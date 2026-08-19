import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { ExternalMovie, MovieMetadataProvider } from '../movie-metadata.interface';

/** Only the fields VideoHub consumes. TMDB returns a great deal more. */
interface TmdbMovie {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  runtime?: number;
  vote_average?: number;
  original_language?: string;
  adult?: boolean;
  genres?: { id: number; name: string }[];
  genre_ids?: number[];
}

interface TmdbListResponse {
  results?: TmdbMovie[];
}

/**
 * TMDB-backed metadata.
 *
 * Called only on explicit sync (admin import, scheduled refresh) — never on a
 * page view, so browsing VideoHub makes no third-party requests.
 */
@Injectable()
export class TmdbMetadataProvider implements MovieMetadataProvider {
  readonly name = 'tmdb';
  private readonly logger = new Logger(TmdbMetadataProvider.name);

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly imageBaseUrl: string;

  /** TMDB genre ids are numeric; resolved lazily and cached for the process. */
  private genreNamesById: Map<number, string> | null = null;

  constructor(config: ConfigService<AppConfig, true>) {
    const metadata = config.get('metadata', { infer: true });
    this.apiKey = metadata.tmdbApiKey;
    this.baseUrl = metadata.tmdbBaseUrl;
    this.imageBaseUrl = metadata.tmdbImageBaseUrl;
  }

  async searchMovies(query: string, limit = 20): Promise<ExternalMovie[]> {
    const data = await this.request<TmdbListResponse>('/search/movie', {
      query,
      include_adult: 'false',
    });
    return (data?.results ?? []).slice(0, limit).map((movie) => this.toExternal(movie));
  }

  async getMovie(externalId: string): Promise<ExternalMovie | null> {
    const data = await this.request<TmdbMovie>(`/movie/${encodeURIComponent(externalId)}`, {});
    return data ? this.toExternal(data) : null;
  }

  async getTrendingMovies(limit = 20): Promise<ExternalMovie[]> {
    const data = await this.request<TmdbListResponse>('/trending/movie/week', {});
    return (data?.results ?? []).slice(0, limit).map((movie) => this.toExternal(movie));
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      // A metadata outage must degrade the feature, not take down the request.
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        this.logger.warn(`TMDB ${path} responded ${response.status}`);
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(`TMDB ${path} failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  private async loadGenreMap(): Promise<Map<number, string>> {
    if (this.genreNamesById) return this.genreNamesById;

    const data = await this.request<{ genres?: { id: number; name: string }[] }>(
      '/genre/movie/list',
      {},
    );

    this.genreNamesById = new Map((data?.genres ?? []).map((genre) => [genre.id, genre.name]));
    return this.genreNamesById;
  }

  private toExternal(movie: TmdbMovie): ExternalMovie {
    const releaseDate = movie.release_date ? new Date(movie.release_date) : null;
    const validDate = releaseDate && !Number.isNaN(releaseDate.getTime()) ? releaseDate : null;

    return {
      externalId: String(movie.id),
      provider: this.name,
      title: movie.title,
      originalTitle: movie.original_title ?? null,
      overview: movie.overview || null,
      posterUrl: movie.poster_path ? `${this.imageBaseUrl}/w500${movie.poster_path}` : null,
      backdropUrl: movie.backdrop_path ? `${this.imageBaseUrl}/w1280${movie.backdrop_path}` : null,
      releaseDate: validDate?.toISOString() ?? null,
      releaseYear: validDate?.getUTCFullYear() ?? null,
      runtimeMinutes: movie.runtime ?? null,
      rating: movie.vote_average ?? null,
      language: movie.original_language ?? null,
      genreNames: movie.genres?.map((genre) => genre.name) ?? [],
      adult: movie.adult ?? false,
    };
  }

  /** Resolves `genre_ids` from list endpoints, which omit full genre objects. */
  async resolveGenreNames(genreIds: number[]): Promise<string[]> {
    const map = await this.loadGenreMap();
    return genreIds.map((id) => map.get(id)).filter((name): name is string => Boolean(name));
  }
}
