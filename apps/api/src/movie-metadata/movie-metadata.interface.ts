import type { MovieSummary } from '@videohub/types';

/**
 * Source of movie metadata.
 *
 * Nothing outside this folder may import a concrete provider — the rest of the
 * app depends on this interface only, so swapping TMDB for another catalogue (or
 * dropping external metadata entirely) touches one module.
 */
export interface MovieMetadataProvider {
  /** Stable identifier, surfaced in health output. */
  readonly name: string;

  searchMovies(query: string, limit?: number): Promise<ExternalMovie[]>;
  getMovie(externalId: string): Promise<ExternalMovie | null>;
  getTrendingMovies(limit?: number): Promise<ExternalMovie[]>;
}

/**
 * Provider-neutral metadata shape. Deliberately not `MovieSummary` — external
 * records have no VideoHub id, slug or trending score until they are imported.
 */
export interface ExternalMovie {
  externalId: string;
  provider: string;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  rating: number | null;
  language: string | null;
  genreNames: string[];
  /** True when the provider flags the title as adult. Mapped to ADULT on import. */
  adult: boolean;
}

export const MOVIE_METADATA_PROVIDER = Symbol('MOVIE_METADATA_PROVIDER');

/** Convenience type for callers that import an external record into the catalogue. */
export type ImportedMovie = MovieSummary;
