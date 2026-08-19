import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SearchSort } from '@videohub/types';
import { ErrorCode, type MovieDetail, type MovieSummary, type Paginated } from '@videohub/types';
import { paginate } from '../common/dto/pagination.dto';
import { canView, visibilityWhere, type VisibilityContext } from '../common/content-visibility';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryMoviesDto } from './dto/query-movies.dto';
import {
  MOVIE_DETAIL_INCLUDE,
  MOVIE_SUMMARY_INCLUDE,
  toMovieDetail,
  toMovieSummary,
} from './movies.mapper';

@Injectable()
export class MoviesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: QueryMoviesDto,
    context: VisibilityContext,
  ): Promise<Paginated<MovieSummary>> {
    const where = this.buildWhere(query, context);

    // Issued together rather than sequentially. Deliberately NOT $transaction:
    // a read-only list+count needs no atomicity, and a transaction would pin a
    // pooled connection for BEGIN..COMMIT, which exhausts Neon's pooler as soon
    // as several of these run concurrently.
    const [items, total] = await Promise.all([
      this.prisma.movie.findMany({
        where,
        include: MOVIE_SUMMARY_INCLUDE,
        orderBy: this.buildOrderBy(query.sort),
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.movie.count({ where }),
    ]);

    return paginate(items.map(toMovieSummary), query.page, query.take, total);
  }

  async findBySlug(slug: string, context: VisibilityContext): Promise<MovieDetail> {
    const movie = await this.prisma.movie.findFirst({
      where: { slug, isPublished: true },
      include: MOVIE_DETAIL_INCLUDE,
    });

    // A 404 rather than a 403 when the rating is out of bounds: confirming that
    // an ADULT title exists is itself a disclosure.
    if (!movie || !canView(movie.maturityRating, context)) {
      throw AppException.notFound(ErrorCode.MOVIE_NOT_FOUND, 'We couldn’t find that movie.');
    }

    return toMovieDetail(movie);
  }

  /**
   * Titles similar to the given one, ranked by shared genres.
   *
   * Deliberately a single query with a genre filter rather than a per-candidate
   * scoring pass — this runs on every details page, and the ordering difference
   * does not justify the extra load on a free-tier database.
   */
  async findSimilar(
    slug: string,
    context: VisibilityContext,
    limit = 12,
  ): Promise<MovieSummary[]> {
    const movie = await this.prisma.movie.findFirst({
      where: { slug, isPublished: true },
      include: MOVIE_SUMMARY_INCLUDE,
    });

    if (!movie || !canView(movie.maturityRating, context)) {
      throw AppException.notFound(ErrorCode.MOVIE_NOT_FOUND, 'We couldn’t find that movie.');
    }

    const genreIds = movie.genres.map((link) => link.genreId);

    const similar = await this.prisma.movie.findMany({
      where: {
        ...visibilityWhere(context),
        isPublished: true,
        id: { not: movie.id },
        ...(genreIds.length > 0 ? { genres: { some: { genreId: { in: genreIds } } } } : {}),
      },
      include: MOVIE_SUMMARY_INCLUDE,
      orderBy: [{ trendingScore: 'desc' }, { rating: 'desc' }],
      take: limit,
    });

    return similar.map(toMovieSummary);
  }

  /**
   * Records a view. Fire-and-forget from the controller's perspective — a
   * failure here must never break the details page.
   */
  async recordView(movieId: string): Promise<void> {
    await this.prisma.movie
      .update({ where: { id: movieId }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);
  }

  private buildWhere(query: QueryMoviesDto, context: VisibilityContext): Prisma.MovieWhereInput {
    const where: Prisma.MovieWhereInput = {
      ...visibilityWhere(context),
      isPublished: true,
    };

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { originalTitle: { contains: query.q, mode: 'insensitive' } },
        { tagline: { contains: query.q, mode: 'insensitive' } },
        { director: { contains: query.q, mode: 'insensitive' } },
        { cast: { some: { name: { contains: query.q, mode: 'insensitive' } } } },
      ];
    }

    if (query.genre) {
      where.genres = { some: { genre: { slug: query.genre } } };
    }

    if (query.year !== undefined) {
      where.releaseYear = query.year;
    } else if (query.yearFrom !== undefined || query.yearTo !== undefined) {
      where.releaseYear = {
        ...(query.yearFrom !== undefined ? { gte: query.yearFrom } : {}),
        ...(query.yearTo !== undefined ? { lte: query.yearTo } : {}),
      };
    }

    if (query.minRating !== undefined) {
      where.rating = { gte: query.minRating };
    }

    if (query.language) {
      where.language = query.language;
    }

    if (query.maxRuntime !== undefined) {
      where.runtimeMinutes = { lte: query.maxRuntime };
    }

    return where;
  }

  private buildOrderBy(sort: SearchSort = SearchSort.TRENDING): Prisma.MovieOrderByWithRelationInput[] {
    switch (sort) {
      case SearchSort.POPULARITY:
        return [{ popularity: 'desc' }, { id: 'asc' }];
      case SearchSort.RATING:
        // nulls last, so unrated titles do not occupy the top of the list.
        return [{ rating: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
      case SearchSort.NEWEST:
        return [{ releaseDate: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
      case SearchSort.TITLE:
        return [{ title: 'asc' }, { id: 'asc' }];
      case SearchSort.TRENDING:
      default:
        // `id` breaks ties so pagination is stable across pages.
        return [{ trendingScore: 'desc' }, { id: 'asc' }];
    }
  }
}
