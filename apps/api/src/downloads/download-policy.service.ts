import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ALLOWED_HOSTS,
  ALLOWED_URL_PROTOCOLS,
  PROTECTED_HOSTS,
  REFUSAL_MESSAGES,
} from '@videohub/config';
import { DownloadRefusalReason } from '@videohub/types';
import type { AppConfig } from '../config/configuration';
import { resolveHostSafely } from './network-guard';

export interface PolicyDecision {
  /** True only when the URL may be fetched by VideoHub. */
  permitted: boolean;
  host: string;
  /** Normalised absolute URL, with credentials and fragment stripped. */
  normalisedUrl: string;
  refusalReason: DownloadRefusalReason | null;
  /** User-facing copy. Rendered verbatim. */
  message: string;
  /** Why the decision was made, for logs. Never sent to a client. */
  internalNote?: string;
}

/**
 * Decides whether VideoHub may download a given URL.
 *
 * The rules, in order — the first that matches wins:
 *
 *   1. The URL must parse, use http(s), and carry no embedded credentials.
 *   2. If the host is a known protected platform, refuse with its specific
 *      reason. VideoHub does not bypass DRM, authentication, paywalls, or any
 *      other technical protection, so these are refusals by design and there is
 *      deliberately no code path that attempts otherwise.
 *   3. The host must appear on the allowlist.
 *   4. The host must not resolve to a private or link-local address (SSRF).
 *
 * Anything refused still returns the original URL, so the UI can offer to open
 * it at the source.
 */
@Injectable()
export class DownloadPolicyService {
  private readonly logger = new Logger(DownloadPolicyService.name);
  private readonly allowedHosts: string[];

  constructor(config: ConfigService<AppConfig, true>) {
    const configured = config.get('downloads', { infer: true }).allowedHosts;
    // The env var replaces the built-in list when set, so a deployment can
    // narrow or extend it without a code change.
    this.allowedHosts =
      configured.length > 0 ? configured : ALLOWED_HOSTS.map((rule) => rule.host);
  }

  /** The hosts this deployment will download from, for the UI to display. */
  get supportedHosts(): { host: string; label: string; basis: string }[] {
    return this.allowedHosts.map((host) => {
      const known = ALLOWED_HOSTS.find((rule) => rule.host === host);
      return {
        host,
        label: known?.label ?? host,
        basis: known?.basis ?? 'Configured for this deployment.',
      };
    });
  }

  async evaluate(rawUrl: string): Promise<PolicyDecision> {
    const parsed = this.parseUrl(rawUrl);

    if (!parsed) {
      return this.refuse(
        DownloadRefusalReason.UNSUPPORTED_URL,
        rawUrl,
        '',
        'URL did not parse or used an unsupported protocol',
      );
    }

    const host = parsed.hostname.toLowerCase();
    const normalisedUrl = parsed.toString();

    // Credentials in the URL would mean authenticating as someone else on
    // another service — never something VideoHub does.
    if (parsed.username || parsed.password) {
      return this.refuse(
        DownloadRefusalReason.REQUIRES_AUTH,
        rawUrl,
        host,
        'URL carried embedded credentials',
      );
    }

    const protectedHost = this.matchProtectedHost(host);
    if (protectedHost) {
      return this.refuse(
        protectedHost.reason,
        normalisedUrl,
        host,
        `known protected platform: ${protectedHost.label}`,
      );
    }

    if (!this.isAllowed(host)) {
      return this.refuse(
        DownloadRefusalReason.HOST_NOT_ALLOWED,
        normalisedUrl,
        host,
        'host is not on the allowlist',
      );
    }

    // Allowlisted hosts still get resolved: a DNS record could point a permitted
    // name at a private address.
    const resolution = await resolveHostSafely(host);
    if (!resolution.safe) {
      this.logger.warn(`Blocked ${host}: resolves to a blocked range (${resolution.reason})`);
      return this.refuse(
        DownloadRefusalReason.HOST_NOT_ALLOWED,
        normalisedUrl,
        host,
        `blocked address range: ${resolution.reason}`,
      );
    }

    return {
      permitted: true,
      host,
      normalisedUrl,
      refusalReason: null,
      message: 'This source permits downloading through VideoHub.',
    };
  }

  /**
   * Re-checks a redirect target. Called for every hop, because a permitted URL
   * can redirect to one that is not.
   */
  async evaluateRedirect(location: string, from: string): Promise<PolicyDecision> {
    let absolute: string;
    try {
      absolute = new URL(location, from).toString();
    } catch {
      return this.refuse(DownloadRefusalReason.UNSUPPORTED_URL, location, '', 'bad redirect target');
    }
    return this.evaluate(absolute);
  }

  private parseUrl(rawUrl: string): URL | null {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }

    if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) return null;
    if (!parsed.hostname) return null;

    // The fragment never reaches the server; dropping it keeps stored URLs tidy.
    parsed.hash = '';
    return parsed;
  }

  /** Matches a host or any of its subdomains against the protected list. */
  private matchProtectedHost(host: string): (typeof PROTECTED_HOSTS)[number] | undefined {
    return PROTECTED_HOSTS.find((rule) => host === rule.host || host.endsWith(`.${rule.host}`));
  }

  private isAllowed(host: string): boolean {
    return this.allowedHosts.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  }

  private refuse(
    reason: DownloadRefusalReason,
    url: string,
    host: string,
    internalNote: string,
  ): PolicyDecision {
    return {
      permitted: false,
      host,
      normalisedUrl: url,
      refusalReason: reason,
      message: REFUSAL_MESSAGES[reason],
      internalNote,
    };
  }
}
