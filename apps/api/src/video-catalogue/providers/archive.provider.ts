import { Injectable, Logger } from '@nestjs/common';
import type {
  ExternalVideo,
  VideoCatalogueProvider,
} from '../video-catalogue.interface';

/**
 * Internet Archive catalogue provider.
 *
 * No API key, no account, no quota headers to respect beyond ordinary courtesy.
 * Two endpoints are used:
 *
 *   advancedsearch.php  — the search index, returns identifiers
 *   metadata/{id}       — the file manifest for one item
 *
 * Only public, read-only endpoints are touched. Nothing here signs in, replays
 * a credential, or reaches for a file the item does not publish.
 */

const SEARCH_ENDPOINT = 'https://archive.org/advancedsearch.php';
const METADATA_ENDPOINT = 'https://archive.org/metadata';
const DOWNLOAD_BASE = 'https://archive.org/download';
const THUMBNAIL_BASE = 'https://archive.org/services/img';

/** Identifies us to archive.org, which asks that clients say who they are. */
const USER_AGENT = 'VideoHub/0.1 (catalogue sync; +https://github.com/PAZZO123/VideoHub)';

/**
 * Derivative formats archive.org generates, cheapest-to-stream first.
 *
 * The 512Kb derivative is preferred over the source: it is a fraction of the
 * size, and a viewer on a Rwandan mobile connection is far better served by a
 * 40 MB stream than a 400 MB one.
 */
const PLAYABLE_FORMATS = ['512Kb MPEG4', 'h.264', 'MPEG4', 'h.264 IA', 'HiRes MPEG4'];

/** Licences that positively permit redistribution. Anything else stays closed. */
const REDISTRIBUTABLE_PATTERNS = [
  /creativecommons\.org\/publicdomain/i,
  /creativecommons\.org\/licenses\/publicdomain/i,
  /creativecommons\.org\/licenses\/by\//i,
  /creativecommons\.org\/licenses\/by-sa\//i,
];

interface SearchResponse {
  response?: { numFound?: number; docs?: { identifier?: string }[] };
}

interface MetadataFile {
  name?: string;
  format?: string;
  size?: string;
  length?: string;
}

interface MetadataResponse {
  metadata?: Record<string, unknown>;
  files?: MetadataFile[];
}

@Injectable()
export class ArchiveOrgProvider implements VideoCatalogueProvider {
  readonly name = 'archive.org';
  private readonly logger = new Logger(ArchiveOrgProvider.name);

  async search(query: string, limit: number): Promise<ExternalVideo[]> {
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.append('fl[]', 'identifier');
    url.searchParams.set('rows', String(limit));
    url.searchParams.set('page', '1');
    url.searchParams.set('output', 'json');
    // Downloads are a rough popularity signal, which correlates with an item
    // being complete and watchable rather than a broken partial upload.
    url.searchParams.append('sort[]', 'downloads desc');

    const body = await this.fetchJson<SearchResponse>(url.toString());
    const identifiers = (body?.response?.docs ?? [])
      .map((doc) => doc.identifier)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const resolved = await Promise.all(identifiers.map((id) => this.getById(id)));

    // An item with no playable derivative is dropped rather than stored with a
    // dead playbackUrl — a catalogue row that cannot play is worse than absent.
    return resolved.filter((video): video is ExternalVideo => video !== null);
  }

  async getById(externalId: string): Promise<ExternalVideo | null> {
    const body = await this.fetchJson<MetadataResponse>(
      `${METADATA_ENDPOINT}/${encodeURIComponent(externalId)}`,
    );

    const metadata = body?.metadata;
    if (!metadata) {
      this.logger.debug(`No metadata for ${externalId}; skipping.`);
      return null;
    }

    const file = this.pickPlayableFile(body?.files ?? []);
    if (!file?.name) {
      this.logger.debug(`No playable derivative for ${externalId}; skipping.`);
      return null;
    }

    const licenceUrl = this.str(metadata.licenseurl);
    const rights = this.str(metadata.rights);

    return {
      externalId,
      provider: this.name,
      title: this.str(metadata.title) ?? externalId,
      description: this.plainText(this.str(metadata.description)),
      playbackUrl: `${DOWNLOAD_BASE}/${encodeURIComponent(externalId)}/${encodeURI(file.name)}`,
      thumbnailUrl: `${THUMBNAIL_BASE}/${encodeURIComponent(externalId)}`,
      durationSeconds: this.seconds(file.length),
      sizeBytes: this.int(file.size),
      licence: this.describeLicence(licenceUrl, rights),
      redistributable: this.isRedistributable(licenceUrl),
      sourcePageUrl: `https://archive.org/details/${encodeURIComponent(externalId)}`,
      year: this.year(this.str(metadata.date) ?? this.str(metadata.year)),
      creator: this.str(metadata.creator),
    };
  }

  /** Cheapest playable derivative, by the preference order above. */
  private pickPlayableFile(files: MetadataFile[]): MetadataFile | null {
    for (const format of PLAYABLE_FORMATS) {
      const matches = files.filter((file) => file.format === format && file.name);
      if (matches.length === 0) continue;

      // Smallest wins within a format — some items carry several cuts.
      matches.sort((a, b) => (this.int(a.size) ?? 0) - (this.int(b.size) ?? 0));
      return matches[0] ?? null;
    }
    return null;
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        // A hung archive.org request must not stall the whole sync.
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        this.logger.warn(`archive.org replied ${res.status} for ${url}`);
        return null;
      }

      return (await res.json()) as T;
    } catch (error: unknown) {
      this.logger.warn(
        `archive.org request failed (${url}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private isRedistributable(licenceUrl: string | null): boolean {
    if (!licenceUrl) return false;
    return REDISTRIBUTABLE_PATTERNS.some((pattern) => pattern.test(licenceUrl));
  }

  private describeLicence(licenceUrl: string | null, rights: string | null): string | null {
    if (licenceUrl) {
      if (/publicdomain/i.test(licenceUrl)) return 'Public Domain';
      const match = /licenses\/([a-z-]+)\/([0-9.]+)/i.exec(licenceUrl);
      if (match) return `CC ${match[1]!.toUpperCase()} ${match[2]}`;
      return licenceUrl;
    }
    return rights;
  }

  private str(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    // archive.org returns repeated fields as arrays.
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim() || null;
    return null;
  }

  /** Descriptions are HTML fragments; the UI renders plain text. */
  private plainText(value: string | null): string | null {
    if (!value) return null;
    const text = value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();

    return text ? text.slice(0, 2000) : null;
  }

  private int(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  private seconds(value: unknown): number | null {
    if (typeof value !== 'string') return null;

    // Either "664.03" or "1:04:23".
    if (value.includes(':')) {
      const parts = value.split(':').map(Number);
      if (parts.some((part) => !Number.isFinite(part))) return null;
      return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  private year(value: string | null): number | null {
    if (!value) return null;
    const match = /(\d{4})/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    return year >= 1870 && year <= new Date().getFullYear() + 1 ? year : null;
  }
}
