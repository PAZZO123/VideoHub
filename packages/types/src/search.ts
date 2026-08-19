import type { MovieSummary, VideoSummary, GenreDto, CategoryDto } from './models';

export const SearchSort = {
  TRENDING: 'trending',
  POPULARITY: 'popularity',
  RATING: 'rating',
  NEWEST: 'newest',
  TITLE: 'title',
} as const;
export type SearchSort = (typeof SearchSort)[keyof typeof SearchSort];

export interface SearchFilters {
  q?: string;
  genre?: string;
  category?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
  language?: string;
  sort?: SearchSort;
  maxRuntime?: number;
}

/** Grouped payload behind the instant-search dropdown. */
export interface SearchSuggestions {
  movies: MovieSummary[];
  videos: VideoSummary[];
  people: { name: string; role: string }[];
  genres: GenreDto[];
  categories: CategoryDto[];
}

export interface SearchResults {
  movies: MovieSummary[];
  videos: VideoSummary[];
  totalMovies: number;
  totalVideos: number;
}
