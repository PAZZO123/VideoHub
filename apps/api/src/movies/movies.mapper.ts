import type {
  CastMember,
  Genre,
  Movie,
  MovieGenre,
  Source,
} from '@prisma/client';
import type {
  MaturityRating,
  MovieDetail,
  MovieSummary,
  SourceDto,
  GenreDto,
  SourceAccess,
} from '@videohub/types';

export type MovieWithGenres = Movie & {
  genres: (MovieGenre & { genre: Genre })[];
};

export type MovieWithRelations = MovieWithGenres & {
  cast: CastMember[];
  sources: Source[];
};

/** Prisma `include` for a summary-shaped movie. Keeps every list query aligned. */
export const MOVIE_SUMMARY_INCLUDE = {
  genres: { include: { genre: true } },
} as const;

/** Prisma `include` for the details page. */
export const MOVIE_DETAIL_INCLUDE = {
  genres: { include: { genre: true } },
  cast: { orderBy: { order: 'asc' } },
  sources: true,
} as const;

export function toGenreDto(genre: Genre): GenreDto {
  return { id: genre.id, name: genre.name, slug: genre.slug };
}

export function toSourceDto(source: Source): SourceDto {
  return {
    id: source.id,
    platform: source.platform,
    url: source.url,
    access: source.access as SourceAccess,
    region: source.region,
    downloadAllowed: source.downloadAllowed,
    qualityLabel: source.qualityLabel,
  };
}

export function toMovieSummary(movie: MovieWithGenres): MovieSummary {
  return {
    id: movie.id,
    slug: movie.slug,
    title: movie.title,
    overview: movie.overview,
    posterUrl: movie.posterUrl,
    backdropUrl: movie.backdropUrl,
    releaseYear: movie.releaseYear,
    runtimeMinutes: movie.runtimeMinutes,
    rating: movie.rating,
    language: movie.language,
    maturityRating: movie.maturityRating as MaturityRating,
    genres: movie.genres.map((link) => toGenreDto(link.genre)),
    trendingScore: movie.trendingScore,
    popularity: movie.popularity,
  };
}

export function toMovieDetail(movie: MovieWithRelations): MovieDetail {
  return {
    ...toMovieSummary(movie),
    releaseDate: movie.releaseDate?.toISOString() ?? null,
    tagline: movie.tagline,
    director: movie.director,
    cast: movie.cast.map((member) => ({
      name: member.name,
      character: member.character,
      order: member.order,
    })),
    trailerUrl: movie.trailerUrl,
    sources: movie.sources.map(toSourceDto),
    viewCount: movie.viewCount,
    createdAt: movie.createdAt.toISOString(),
    updatedAt: movie.updatedAt.toISOString(),
  };
}
