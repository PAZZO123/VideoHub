import { Injectable } from '@nestjs/common';
import { ModerationStatus } from '@prisma/client';
import { MIN_SEARCH_LENGTH, SUGGESTION_LIMITS } from '@videohub/config';
import type { SearchResults, SearchSuggestions } from '@videohub/types';
import { visibilityWhere, type VisibilityContext } from '../common/content-visibility';
import { PrismaService } from '../prisma/prisma.service';
import {
  MOVIE_SUMMARY_INCLUDE,
  toGenreDto,
  toMovieSummary,
} from '../movies/movies.mapper';
import { VIDEO_SUMMARY_INCLUDE, toCategoryDto, toVideoSummary } from '../videos/videos.mapper';

const EMPTY_SUGGESTIONS: SearchSuggestions = {
  movies: [],
  videos: [],
  people: [],
  genres: [],
  categories: [],
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Instant-search dropdown. Fires on keystroke (debounced client-side), so
   * every branch is capped small and no counts are computed.
   */
  async suggest(rawQuery: string, context: VisibilityContext): Promise<SearchSuggestions> {
    const query = rawQuery.trim();
    if (query.length < MIN_SEARCH_LENGTH) return EMPTY_SUGGESTIONS;

    const visibility = visibilityWhere(context);
    const contains = { contains: query, mode: 'insensitive' as const };

    const [movies, videos, people, genres, categories] = await Promise.all([
      this.prisma.movie.findMany({
        where: { ...visibility, isPublished: true, title: contains },
        include: MOVIE_SUMMARY_INCLUDE,
        orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
        take: SUGGESTION_LIMITS.MOVIES,
      }),
      this.prisma.video.findMany({
        where: {
          ...visibility,
          moderationStatus: ModerationStatus.APPROVED,
          title: contains,
        },
        include: VIDEO_SUMMARY_INCLUDE,
        orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
        take: SUGGESTION_LIMITS.VIDEOS,
      }),
      // Cast names, deduplicated to one row per person.
      this.prisma.castMember.findMany({
        where: { name: contains, movie: { ...visibility, isPublished: true } },
        select: { name: true },
        distinct: ['name'],
        take: SUGGESTION_LIMITS.PEOPLE,
      }),
      this.prisma.genre.findMany({
        where: { name: contains },
        take: SUGGESTION_LIMITS.GENRES,
      }),
      this.prisma.category.findMany({
        where: { name: contains },
        take: SUGGESTION_LIMITS.CATEGORIES,
      }),
    ]);

    return {
      movies: movies.map(toMovieSummary),
      videos: videos.map(toVideoSummary),
      people: people.map((person) => ({ name: person.name, role: 'Cast' })),
      genres: genres.map(toGenreDto),
      categories: categories.map(toCategoryDto),
    };
  }

  /** Full results page: movies and videos side by side, with totals. */
  async search(
    rawQuery: string,
    context: VisibilityContext,
    limit = 24,
  ): Promise<SearchResults> {
    const query = rawQuery.trim();
    if (query.length < MIN_SEARCH_LENGTH) {
      return { movies: [], videos: [], totalMovies: 0, totalVideos: 0 };
    }

    const visibility = visibilityWhere(context);
    const contains = { contains: query, mode: 'insensitive' as const };

    const movieWhere = {
      ...visibility,
      isPublished: true,
      OR: [
        { title: contains },
        { originalTitle: contains },
        { tagline: contains },
        { director: contains },
        { cast: { some: { name: contains } } },
      ],
    };

    const videoWhere = {
      ...visibility,
      moderationStatus: ModerationStatus.APPROVED,
      OR: [{ title: contains }, { description: contains }, { tags: { has: query.toLowerCase() } }],
    };

    const [movies, totalMovies, videos, totalVideos] = await Promise.all([
      this.prisma.movie.findMany({
        where: movieWhere,
        include: MOVIE_SUMMARY_INCLUDE,
        orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
        take: limit,
      }),
      this.prisma.movie.count({ where: movieWhere }),
      this.prisma.video.findMany({
        where: videoWhere,
        include: VIDEO_SUMMARY_INCLUDE,
        orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
        take: limit,
      }),
      this.prisma.video.count({ where: videoWhere }),
    ]);

    return {
      movies: movies.map(toMovieSummary),
      videos: videos.map(toVideoSummary),
      totalMovies,
      totalVideos,
    };
  }

  /**
   * Records the search for trending signal and personalisation.
   *
   * Only called from the full results page, never from the suggestion endpoint —
   * logging every keystroke would flood the table and skew trending badly.
   */
  async recordSearch(query: string, resultCount: number, userId?: string): Promise<void> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) return;

    await this.prisma.searchHistory
      .create({
        data: { query: trimmed.slice(0, 200), resultCount, userId: userId ?? null },
      })
      .catch(() => undefined);
  }
}
