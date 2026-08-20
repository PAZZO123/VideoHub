/**
 * Source of real, playable video.
 *
 * Distinct from MovieMetadataProvider, which supplies posters and synopses for
 * films VideoHub does not host. This one returns something a `<video>` element
 * can actually play.
 *
 * Nothing outside this folder may import a concrete provider — swapping the
 * Internet Archive for another catalogue touches one module.
 */
export interface VideoCatalogueProvider {
  /** Stable identifier, surfaced in health output. */
  readonly name: string;

  /** Runs a provider-native search and returns playable results only. */
  search(query: string, limit: number): Promise<ExternalVideo[]>;

  /** Resolves one item by its provider-native id. */
  getById(externalId: string): Promise<ExternalVideo | null>;
}

/**
 * Provider-neutral shape. Not `VideoSummary` — an external record has no
 * VideoHub id, slug, or moderation state until it is ingested.
 */
export interface ExternalVideo {
  externalId: string;
  provider: string;
  title: string;
  description: string | null;
  /** Direct, publicly fetchable media URL. Must support range requests. */
  playbackUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  /** Human-readable licence, e.g. "Public Domain" or "CC BY 3.0". */
  licence: string | null;
  /**
   * True only when the licence positively permits redistribution. Never
   * inferred from the file being reachable — an item with no stated licence is
   * false, and the downloader stays closed for it.
   */
  redistributable: boolean;
  /** The page a human should visit to check provenance. */
  sourcePageUrl: string;
  year: number | null;
  creator: string | null;
}

export const VIDEO_CATALOGUE_PROVIDER = Symbol('VIDEO_CATALOGUE_PROVIDER');
