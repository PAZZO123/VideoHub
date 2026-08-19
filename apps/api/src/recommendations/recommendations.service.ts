import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RecommendationSource, type MovieSummary, type RecommendationDto } from '@videohub/types';
import { visibilityWhere, type VisibilityContext } from '../common/content-visibility';
import { MOVIE_SUMMARY_INCLUDE, toMovieSummary } from '../movies/movies.mapper';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Blends several independent signals rather than leaning on the model alone.
 *
 * The AI is one input, not the whole engine: it is slow, costs money per call,
 * and is unavailable entirely when `AI_PROVIDER=mock` has no catalogue to work
 * from. Trending, genre similarity and the user's own history are cheap,
 * deterministic, and work for signed-out visitors too — so they carry the
 * baseline and the model adds explanation on top.
 */

/** Relative weight of each signal in the blended score. */
const WEIGHTS = {
  PREFERENCE: 3.0,
  SIMILARITY: 2.0,
  TRENDING: 1.0,
} as const;

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Personalised recommendations for a signed-in user, falling back to trending
   * for anyone without enough history to personalise from.
   */
  async forUser(
    userId: string | undefined,
    context: VisibilityContext,
    limit = 20,
  ): Promise<RecommendationDto[]> {
    if (!userId) {
      return this.fromTrending(context, limit);
    }

    const preferredGenreIds = await this.preferredGenres(userId);

    // Nothing watched or saved yet — trending is the honest answer.
    if (preferredGenreIds.length === 0) {
      return this.fromTrending(context, limit);
    }

    const seenMovieIds = await this.seenMovieIds(userId);

    const candidates = await this.prisma.movie.findMany({
      where: {
        ...visibilityWhere(context),
        isPublished: true,
        id: { notIn: seenMovieIds.length > 0 ? seenMovieIds : undefined },
      },
      include: MOVIE_SUMMARY_INCLUDE,
      orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
      // Scored in memory, so the candidate pool is capped deliberately.
      take: Math.max(limit * 5, 60),
    });

    const scored = candidates.map((movie) => {
      const summary = toMovieSummary(movie);
      const overlap = movie.genres.filter((link) =>
        preferredGenreIds.includes(link.genreId),
      ).length;

      const preference = overlap * WEIGHTS.PREFERENCE;
      const similarity = overlap > 0 ? WEIGHTS.SIMILARITY : 0;
      const trending = Math.min(movie.trendingScore / 100, 1) * WEIGHTS.TRENDING;
      const quality = (movie.rating ?? 0) / 10;

      return {
        movie: summary,
        score: Number((preference + similarity + trending + quality).toFixed(4)),
        source:
          overlap > 0 ? RecommendationSource.PREFERENCE : RecommendationSource.TRENDING,
        reason: this.explain(summary, overlap),
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Titles similar to one the user is looking at, by shared genre. */
  async similarTo(
    movieId: string,
    context: VisibilityContext,
    limit = 12,
  ): Promise<RecommendationDto[]> {
    const movie = await this.prisma.movie.findUnique({
      where: { id: movieId },
      include: MOVIE_SUMMARY_INCLUDE,
    });
    if (!movie) return [];

    const genreIds = movie.genres.map((link) => link.genreId);
    if (genreIds.length === 0) return this.fromTrending(context, limit);

    const similar = await this.prisma.movie.findMany({
      where: {
        ...visibilityWhere(context),
        isPublished: true,
        id: { not: movieId },
        genres: { some: { genreId: { in: genreIds } } },
      },
      include: MOVIE_SUMMARY_INCLUDE,
      orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
      take: limit,
    });

    return similar.map((candidate) => {
      const summary = toMovieSummary(candidate);
      const shared = candidate.genres
        .filter((link) => genreIds.includes(link.genreId))
        .map((link) => link.genre.name);

      return {
        movie: summary,
        score: shared.length * WEIGHTS.SIMILARITY + (candidate.rating ?? 0) / 10,
        source: RecommendationSource.SIMILARITY,
        reason: shared.length
          ? `Shares ${shared.slice(0, 2).join(' and ')} with ${movie.title}.`
          : `Popular with people who watched ${movie.title}.`,
      };
    });
  }

  /**
   * The catalogue slice handed to the AI as context.
   *
   * Keeping this small and relevant matters: it is the entire universe the model
   * is allowed to recommend from, and every title in it costs tokens.
   */
  async catalogueForPrompt(context: VisibilityContext, limit = 40): Promise<string> {
    const movies = await this.prisma.movie.findMany({
      where: { ...visibilityWhere(context), isPublished: true },
      include: MOVIE_SUMMARY_INCLUDE,
      orderBy: [{ trendingScore: 'desc' }, { rating: { sort: 'desc', nulls: 'last' } }],
      take: limit,
    });

    if (movies.length === 0) {
      return 'CATALOGUE\n(The catalogue is currently empty.)';
    }

    const lines = movies.map((movie) => {
      const genres = movie.genres.map((link) => link.genre.name).join(', ') || 'Uncategorised';
      const year = movie.releaseYear ? ` (${movie.releaseYear})` : '';
      const rating = movie.rating !== null ? ` | rating ${movie.rating.toFixed(1)}` : '';
      return `- ${movie.title}${year} | ${genres}${rating} | ${movie.slug}`;
    });

    return `CATALOGUE — the only titles you may recommend:\n${lines.join('\n')}`;
  }

  /** Resolves titles the assistant named back to real catalogue records. */
  async resolveMentioned(
    content: string,
    context: VisibilityContext,
    limit = 5,
  ): Promise<MovieSummary[]> {
    // Bold markdown is how the system prompt asks for titles to be formatted.
    const mentioned = [...content.matchAll(/\*\*(.+?)\*\*/g)]
      .map((match) => match[1]?.replace(/\s*\(\d{4}\)\s*$/, '').trim())
      .filter((title): title is string => Boolean(title && title.length > 1))
      .slice(0, limit);

    if (mentioned.length === 0) return [];

    const movies = await this.prisma.movie.findMany({
      where: {
        ...visibilityWhere(context),
        isPublished: true,
        OR: mentioned.map((title) => ({
          title: { equals: title, mode: 'insensitive' as Prisma.QueryMode },
        })),
      },
      include: MOVIE_SUMMARY_INCLUDE,
      take: limit,
    });

    // Returned in the order the assistant mentioned them, not database order.
    return mentioned
      .map((title) =>
        movies.find((movie) => movie.title.toLowerCase() === title.toLowerCase()),
      )
      .filter((movie): movie is (typeof movies)[number] => Boolean(movie))
      .map(toMovieSummary);
  }

  private async fromTrending(
    context: VisibilityContext,
    limit: number,
  ): Promise<RecommendationDto[]> {
    const movies = await this.prisma.movie.findMany({
      where: { ...visibilityWhere(context), isPublished: true },
      include: MOVIE_SUMMARY_INCLUDE,
      orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
      take: limit,
    });

    return movies.map((movie) => ({
      movie: toMovieSummary(movie),
      score: movie.trendingScore,
      source: RecommendationSource.TRENDING,
      reason: 'Popular on VideoHub right now.',
    }));
  }

  /** Genres the user actually engages with, from watchlist and history. */
  private async preferredGenres(userId: string): Promise<string[]> {
    const [watchlist, history] = await Promise.all([
      this.prisma.watchlistItem.findMany({
        where: { userId, movieId: { not: null } },
        select: { movie: { select: { genres: { select: { genreId: true } } } } },
        take: 50,
      }),
      this.prisma.watchHistory.findMany({
        where: { userId, movieId: { not: null } },
        select: { movie: { select: { genres: { select: { genreId: true } } } } },
        orderBy: { lastWatchedAt: 'desc' },
        take: 50,
      }),
    ]);

    const counts = new Map<string, number>();
    for (const row of [...watchlist, ...history]) {
      for (const link of row.movie?.genres ?? []) {
        counts.set(link.genreId, (counts.get(link.genreId) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genreId]) => genreId);
  }

  /** Movies already watched or saved, so they are not recommended back. */
  private async seenMovieIds(userId: string): Promise<string[]> {
    const [watchlist, history] = await Promise.all([
      this.prisma.watchlistItem.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
      }),
      this.prisma.watchHistory.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
      }),
    ]);

    return [...new Set([...watchlist, ...history].map((row) => row.movieId))].filter(
      (id): id is string => id !== null,
    );
  }

  private explain(movie: MovieSummary, genreOverlap: number): string {
    if (genreOverlap > 1) {
      const names = movie.genres.slice(0, 2).map((g) => g.name).join(' and ');
      return `Matches your taste for ${names}.`;
    }
    if (genreOverlap === 1) {
      return `In ${movie.genres[0]?.name ?? 'a genre'} you've been watching.`;
    }
    if ((movie.rating ?? 0) >= 8) return 'One of the highest-rated titles available.';
    return 'Popular on VideoHub right now.';
  }
}
