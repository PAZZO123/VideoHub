import { DownloadRefusalReason } from '@videohub/types';

/**
 * VideoHub's downloader is allowlist-based and never attempts to circumvent a
 * technical protection.
 *
 * The rules, in order:
 *   1. The host must appear in ALLOWED_HOSTS (or the DOWNLOAD_ALLOWED_HOSTS env
 *      override, which replaces this list at runtime).
 *   2. The resource must be served over plain HTTP(S) with no authentication,
 *      no paywall and no DRM.
 *   3. If any of that fails, the user is shown the reason and a link to open
 *      the original source on the platform that hosts it.
 *
 * There is deliberately no code path that decrypts DRM, replays credentials,
 * defeats a paywall, or evades rate limiting. PROTECTED_HOSTS exists only so the
 * refusal message can be specific and useful — not as a list of things to work
 * around.
 */

export interface AllowedHostRule {
  host: string;
  label: string;
  /** Why this host is permitted — shown in the UI's supported-sources list. */
  basis: string;
}

/** Hosts that publish openly licensed or public-domain media. */
export const ALLOWED_HOSTS: readonly AllowedHostRule[] = [
  {
    host: 'archive.org',
    label: 'Internet Archive',
    basis: 'Public-domain and openly licensed collections.',
  },
  {
    host: 'commons.wikimedia.org',
    label: 'Wikimedia Commons',
    basis: 'Free-licence media repository.',
  },
  {
    host: 'upload.wikimedia.org',
    label: 'Wikimedia (direct media)',
    basis: 'Free-licence media repository.',
  },
  {
    host: 'peertube.tv',
    label: 'PeerTube',
    basis: 'Federated hosting; per-video licence is respected.',
  },
  {
    host: 'media.blender.org',
    label: 'Blender Open Movies',
    basis: 'Creative Commons open movie project.',
  },
];

export interface ProtectedHostRule {
  host: string;
  label: string;
  reason: DownloadRefusalReason;
}

/**
 * Well-known platforms whose terms and/or technical protections mean VideoHub
 * will not download from them. Matching here short-circuits to a clear message
 * plus an "open original source" link.
 */
export const PROTECTED_HOSTS: readonly ProtectedHostRule[] = [
  { host: 'netflix.com', label: 'Netflix', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'disneyplus.com', label: 'Disney+', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'primevideo.com', label: 'Prime Video', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'amazon.com', label: 'Amazon', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'hulu.com', label: 'Hulu', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'max.com', label: 'Max', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'hbomax.com', label: 'HBO Max', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'appletv.com', label: 'Apple TV+', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'tv.apple.com', label: 'Apple TV+', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'youtube.com', label: 'YouTube', reason: DownloadRefusalReason.ROBOTS_DISALLOWED },
  { host: 'youtu.be', label: 'YouTube', reason: DownloadRefusalReason.ROBOTS_DISALLOWED },
  { host: 'vimeo.com', label: 'Vimeo', reason: DownloadRefusalReason.ROBOTS_DISALLOWED },
  { host: 'showmax.com', label: 'Showmax', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'peacocktv.com', label: 'Peacock', reason: DownloadRefusalReason.PROTECTED_CONTENT },
  { host: 'paramountplus.com', label: 'Paramount+', reason: DownloadRefusalReason.PROTECTED_CONTENT },
];

/** Copy shown to the user for each refusal reason. */
export const REFUSAL_MESSAGES: Record<DownloadRefusalReason, string> = {
  HOST_NOT_ALLOWED:
    'This source is not on VideoHub’s authorized download list, so we can’t fetch it for you. You can still open it at the original source.',
  PROTECTED_CONTENT:
    'This source protects its content technically and by its terms of service. VideoHub does not bypass those protections. Watch it on the original platform instead.',
  REQUIRES_AUTH:
    'This link requires signing in to the original platform. VideoHub never uses your credentials on other services — open it directly instead.',
  PAYWALLED:
    'This content sits behind a paywall on the original platform. VideoHub does not bypass paywalls. You can purchase or subscribe at the source.',
  ROBOTS_DISALLOWED:
    'This platform’s terms do not permit third-party downloading through VideoHub. Open the original source to watch it there.',
  UNSUPPORTED_URL:
    'That doesn’t look like a video URL we can analyze. Check the link and try again.',
  TOO_LARGE: 'This file is larger than the download limit VideoHub currently allows.',
};

export const DOWNLOAD_LIMITS = {
  /** Hard ceiling regardless of the DOWNLOAD_MAX_MB env value. */
  ABSOLUTE_MAX_MB: 4096,
  DEFAULT_MAX_MB: 1024,
  ANALYZE_TIMEOUT_MS: 10_000,
  FETCH_TIMEOUT_MS: 120_000,
} as const;

/** Schemes the analyzer will even consider. */
export const ALLOWED_URL_PROTOCOLS: readonly string[] = ['http:', 'https:'];
