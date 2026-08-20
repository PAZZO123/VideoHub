/**
 * Where real catalogue content comes from.
 *
 * The Internet Archive is the only external video source wired up: it needs no
 * API key, serves direct MP4 over HTTPS with range requests, and its curated
 * collections are public domain or Creative Commons. It is already on the
 * downloader's ALLOWED_HOSTS, so a title ingested here is also one the
 * downloader may legitimately fetch.
 *
 * ---------------------------------------------------------------------------
 * Why this file is a curated list and not a search box
 * ---------------------------------------------------------------------------
 * archive.org mixes librarian-curated collections with wide-open user uploads.
 * Probing the open ones while building this returned, on the first page of
 * results: an extremist music video, a short advertising its own nude scene, a
 * film titled around child abuse, and several plainly copyrighted uploads
 * (a Disney feature, a Tina Turner concert). None of that can be allowed to
 * appear automatically in a catalogue that also serves a children's section.
 *
 * So content arrives one of two ways:
 *
 *   FEATURED_VIDEOS   — individually checked identifiers. Published on sync.
 *   DISCOVERY_QUERIES — curated collections only, and every result lands in the
 *                       moderation queue as PENDING for a human to approve.
 *
 * Kids categories are never auto-published from a query. Public-domain
 * animation of the 1930s-40s carries well-documented racial caricature, which
 * no title-and-collection filter can detect.
 */

/** What happens to an ingested item: published outright, or queued for review. */
export type ReviewPolicy = 'publish' | 'queue-for-review';

export interface FeaturedVideo {
  /** archive.org item identifier. */
  identifier: string;
  categorySlug: string;
  /** Set explicitly — never inferred from the source metadata. */
  maturityRating: 'KIDS' | 'GENERAL' | 'TEEN' | 'MATURE';
  tags: string[];
  language: string;
  /** Why this one was cleared, so a later reader can re-check the judgement. */
  note: string;
}

export interface DiscoveryQuery {
  categorySlug: string;
  /** Shown in the sync log. */
  label: string;
  /** An archive.org advancedsearch query. Curated collections only. */
  query: string;
  limit: number;
  review: ReviewPolicy;
  maturityRating: 'KIDS' | 'GENERAL' | 'TEEN' | 'MATURE';
  tags: string[];
}

/**
 * Individually verified titles. Each was checked for a playable file, a
 * permissive licence, and suitability for the category it lands in.
 */
export const FEATURED_VIDEOS: readonly FeaturedVideo[] = [
  // --- Movies --------------------------------------------------------------
  {
    identifier: 'TheGeneral1926',
    categorySlug: 'movies',
    maturityRating: 'GENERAL',
    tags: ['silent', 'comedy', 'classic'],
    language: 'en',
    note: 'Buster Keaton, 1926. Public domain mark.',
  },
  {
    identifier: 'his_girl_friday',
    categorySlug: 'movies',
    maturityRating: 'GENERAL',
    tags: ['comedy', 'classic'],
    language: 'en',
    note: 'Howard Hawks, 1940. Public domain.',
  },
  {
    identifier: 'steamboat_bill_ipod',
    categorySlug: 'movies',
    maturityRating: 'GENERAL',
    tags: ['silent', 'comedy', 'classic'],
    language: 'en',
    note: 'Keaton, 1928. Public domain, silent_films collection.',
  },
  {
    identifier: 'Charade_1953',
    categorySlug: 'movies',
    maturityRating: 'GENERAL',
    tags: ['comedy', 'classic'],
    language: 'en',
    note: 'Curated Comedy_Films collection.',
  },
  {
    identifier: 'Night.Of.The.Living.Dead_1080p',
    categorySlug: 'movies',
    // Horror. Deliberately not GENERAL — it is gated away from Kids Mode.
    maturityRating: 'MATURE',
    tags: ['horror', 'classic'],
    language: 'en',
    note: 'Romero, 1968. Public domain. Rated MATURE for horror content.',
  },
  {
    identifier: 'Nosferatu_most_complete_version_93_mins.',
    categorySlug: 'movies',
    maturityRating: 'TEEN',
    tags: ['silent', 'horror', 'classic'],
    language: 'de',
    note: 'Murnau, 1922. silent_films collection.',
  },
  {
    identifier: 'DasKabinettdesDoktorCaligariTheCabinetofDrCaligari',
    categorySlug: 'movies',
    maturityRating: 'TEEN',
    tags: ['silent', 'expressionism', 'classic'],
    language: 'de',
    note: 'Wiene, 1920. Public domain, silent_films collection.',
  },
  {
    identifier: 'Sintel',
    categorySlug: 'movies',
    // Animated, but it ends with the protagonist killing the dragon she raised.
    // Filed with the features rather than the kids tree for that reason.
    maturityRating: 'TEEN',
    tags: ['animation', 'blender', 'open-movie'],
    language: 'en',
    note: 'Blender Foundation, CC BY 3.0. Too bleak for Ibitente.',
  },
  {
    identifier: 'Tears-of-Steel',
    categorySlug: 'movies',
    maturityRating: 'TEEN',
    tags: ['sci-fi', 'blender', 'open-movie'],
    language: 'en',
    note: 'Blender Foundation, CC BY 3.0. Sci-fi violence.',
  },

  // --- Documentaries -------------------------------------------------------
  {
    identifier: 'DuckandC1951',
    categorySlug: 'documentaries',
    maturityRating: 'GENERAL',
    tags: ['history', 'archival'],
    language: 'en',
    note: 'Prelinger archival short, 1951.',
  },
  {
    identifier: '6007_Trip_to_the_Moon_A_08_38_20_04',
    categorySlug: 'documentaries',
    maturityRating: 'GENERAL',
    tags: ['space', 'archival'],
    language: 'en',
    note: 'Prelinger collection.',
  },

  // --- Learning ------------------------------------------------------------
  {
    identifier: 'frames_of_reference',
    categorySlug: 'learning',
    maturityRating: 'GENERAL',
    tags: ['physics', 'education'],
    language: 'en',
    note: 'academic_films collection, 1960 PSSC physics film.',
  },
  {
    identifier: 'ComputerChronicles-SearchEngines_861',
    categorySlug: 'learning',
    maturityRating: 'GENERAL',
    tags: ['technology', 'education'],
    language: 'en',
    note: 'computerchronicles collection.',
  },

  // --- Ibitente and the kids tree ------------------------------------------
  // Only the Blender open movies are auto-published to children. They are
  // CC BY, made for a general audience, and carry none of the era-typical
  // caricature that public-domain cartoons do.
  {
    identifier: 'BigBuckBunny_124',
    categorySlug: 'ibitente',
    maturityRating: 'KIDS',
    tags: ['animation', 'blender', 'open-movie'],
    language: 'en',
    note: 'Blender Foundation, CC BY 3.0. Slapstick only.',
  },
  {
    identifier: 'Caminandes1LlamaDrama',
    categorySlug: 'ibitente',
    maturityRating: 'KIDS',
    tags: ['animation', 'blender', 'wordless'],
    language: 'en',
    note: 'CC BY. Wordless, so language is no barrier for Kinyarwanda speakers.',
  },
  {
    identifier: 'CaminandesLlamigos',
    categorySlug: 'cartoons',
    maturityRating: 'KIDS',
    tags: ['animation', 'blender', 'wordless'],
    language: 'en',
    note: 'CC BY. Wordless.',
  },
  {
    identifier: 'ElephantsDream',
    categorySlug: 'cartoons',
    maturityRating: 'KIDS',
    tags: ['animation', 'blender', 'open-movie'],
    language: 'en',
    note: 'Blender Foundation, CC BY 2.5. Abstract but harmless.',
  },
] as const;

/**
 * Bulk discovery. Every one of these targets a curated collection, and every
 * one queues for review rather than publishing — these are candidates for a
 * moderator, not finished catalogue entries.
 *
 * There is deliberately no query for `african-cinema`. The Internet Archive's
 * public-domain holdings for Africa are colonial-era travelogues shot by
 * European crews; filing those under African Cinema would misrepresent both the
 * films and the category. That shelf is better filled by uploads.
 */
export const DISCOVERY_QUERIES: readonly DiscoveryQuery[] = [
  {
    categorySlug: 'movies',
    label: 'Public-domain feature films',
    query: 'collection:(feature_films) AND mediatype:(movies)',
    limit: 20,
    review: 'queue-for-review',
    maturityRating: 'TEEN',
    tags: ['feature', 'classic'],
  },
  {
    categorySlug: 'movies',
    label: 'Silent cinema',
    query: 'collection:(silent_films) AND mediatype:(movies)',
    limit: 15,
    review: 'queue-for-review',
    maturityRating: 'GENERAL',
    tags: ['silent', 'classic'],
  },
  {
    categorySlug: 'documentaries',
    label: 'Prelinger archival films',
    query: 'collection:(prelinger) AND mediatype:(movies)',
    limit: 20,
    review: 'queue-for-review',
    maturityRating: 'GENERAL',
    tags: ['archival', 'documentary'],
  },
  {
    categorySlug: 'learning',
    label: 'Academic films',
    query: 'collection:(academic_films) AND mediatype:(movies)',
    limit: 20,
    review: 'queue-for-review',
    maturityRating: 'GENERAL',
    tags: ['education'],
  },
  {
    categorySlug: 'learning',
    label: 'Computer Chronicles',
    query: 'collection:(computerchronicles) AND mediatype:(movies)',
    limit: 15,
    review: 'queue-for-review',
    maturityRating: 'GENERAL',
    tags: ['technology', 'education'],
  },
  {
    categorySlug: 'cartoons',
    label: 'Classic cartoons (review required)',
    query: 'collection:(classic_cartoons) AND mediatype:(movies)',
    limit: 20,
    // KIDS-facing, so this is the one that most needs a human. Era-typical
    // racial caricature is common in this collection and is not detectable
    // from a title.
    review: 'queue-for-review',
    maturityRating: 'KIDS',
    tags: ['animation', 'classic'],
  },
  {
    categorySlug: 'stories',
    label: 'Animated fairy tales (review required)',
    query: 'collection:(animationandcartoons) AND mediatype:(movies) AND subject:(fairy tale)',
    limit: 15,
    review: 'queue-for-review',
    maturityRating: 'KIDS',
    tags: ['animation', 'story'],
  },
];

/** Categories no external source fills, so the UI can say why they are empty. */
export const UNSOURCED_CATEGORY_SLUGS: readonly string[] = [
  'african-cinema',
  'music',
  'indirimbo-zabana',
  'learn-and-play',
];
