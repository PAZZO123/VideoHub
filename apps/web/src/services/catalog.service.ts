import type {
  CategoryDto,
  GenreDto,
  MovieDetail,
  MovieSummary,
  Paginated,
  SearchResults,
  SearchSuggestions,
  TrendingItemDto,
  VideoDetail,
  VideoSummary,
} from '@videohub/types';
import { api, unwrap } from '@/lib/api-client';

/** Filters accepted by the movie and video listing endpoints. */
export interface CatalogQuery {
  page?: number;
  limit?: number;
  q?: string;
  genre?: string;
  category?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
  language?: string;
  maxRuntime?: number;
  maxDuration?: number;
  kids?: boolean;
  sort?: string;
}

/** Drops empty values so they never reach the URL as `?genre=&year=`. */
function toParams(query: CatalogQuery): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  ) as Record<string, string | number | boolean>;
}

export const moviesService = {
  list(query: CatalogQuery = {}): Promise<Paginated<MovieSummary>> {
    return unwrap(api.get('/movies', { params: toParams(query) }));
  },

  get(slug: string): Promise<MovieDetail> {
    return unwrap(api.get(`/movies/${encodeURIComponent(slug)}`));
  },

  similar(slug: string): Promise<MovieSummary[]> {
    return unwrap(api.get(`/movies/${encodeURIComponent(slug)}/similar`));
  },
};

export const videosService = {
  list(query: CatalogQuery = {}): Promise<Paginated<VideoSummary>> {
    return unwrap(api.get('/videos', { params: toParams(query) }));
  },

  get(slug: string): Promise<VideoDetail> {
    return unwrap(api.get(`/videos/${encodeURIComponent(slug)}`));
  },

  /** Ibitente endpoints. Kids-only enforcement lives on the server. */
  listKids(query: CatalogQuery = {}): Promise<Paginated<VideoSummary>> {
    return unwrap(api.get('/kids/videos', { params: toParams(query) }));
  },

  getKids(slug: string): Promise<VideoDetail> {
    return unwrap(api.get(`/kids/videos/${encodeURIComponent(slug)}`));
  },
};

export const searchService = {
  suggest(q: string): Promise<SearchSuggestions> {
    return unwrap(api.get('/search/suggest', { params: { q } }));
  },

  search(q: string): Promise<SearchResults> {
    return unwrap(api.get('/search', { params: { q } }));
  },
};

export const taxonomyService = {
  genres(): Promise<GenreDto[]> {
    return unwrap(api.get('/genres'));
  },

  categories(kids?: boolean): Promise<CategoryDto[]> {
    return unwrap(api.get('/categories', { params: kids === undefined ? {} : { kids } }));
  },
};

export const trendingService = {
  list(limit = 20, q?: string): Promise<TrendingItemDto[]> {
    return unwrap(api.get('/trending', { params: { limit, ...(q ? { q } : {}) } }));
  },
};
