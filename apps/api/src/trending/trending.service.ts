import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ModerationStatus } from '@prisma/client';
import {
  TRENDING_ACTIVITY_WINDOW_DAYS,
  TRENDING_RECENCY_HALF_LIFE_DAYS,
  TRENDING_WEIGHTS,
} from '@videohub/config';
import { MediaKind, type TrendingItemDto } from '@videohub/types';
import { visibilityWhere, type VisibilityContext } from '../common/content-visibility';
import { MOVIE_SUMMARY_INCLUDE, toMovieSummary } from '../movies/movies.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { VIDEO_SUMMARY_INCLUDE, toVideoSummary } from '../videos/videos.mapper';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TrendingService {
  private readonly logger = new Logger(TrendingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTrending(context: VisibilityContext, limit = 20): Promise<TrendingItemDto[]> {
    const visibility = visibilityWhere(context);

    const [movies, videos] = await Promise.all([
      this.prisma.movie.findMany({
        where: { ...visibility, isPublished: true },
        include: MOVIE_SUMMARY_INCLUDE,
        orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
        take: limit,
      }),
      this.prisma.video.findMany({
        where: { ...visibility, moderationStatus: ModerationStatus.APPROVED },
        include: VIDEO_SUMMARY_INCLUDE,
        orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
        take: limit,
      }),
    ]);

    const items: TrendingItemDto[] = [
      ...movies.map((movie) => ({
        kind: MediaKind.MOVIE,
        movie: toMovieSummary(movie),
        video: null,
        trendingScore: movie.trendingScore,
      })),
      ...videos.map((video) => ({
        kind: MediaKind.VIDEO,
        movie: null,
        video: toVideoSummary(video),
        trendingScore: video.trendingScore,
      })),
    ];

    // Interleaved by score so the rail mixes both kinds rather than showing all
    // movies then all videos.
    return items.sort((a, b) => b.trendingScore - a.trendingScore).slice(0, limit);
  }

  /**
   * Recalculates every trending score.
   *
   * Deliberately simple for the MVP: a weighted sum of accumulated counters plus
   * an exponential recency bonus. No event stream, no time-bucketed windows —
   * those can come later without changing this interface.
   *
   *   score = views·w1 + searches·w2 + watchlistAdds·w3 + rating·w4 + recency·w5
   *
   * Runs hourly, and writes are chunked so a large catalogue does not open one
   * enormous transaction against a free-tier database.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'recalculate-trending' })
  async recalculateTrending(): Promise<{ movies: number; videos: number }> {
    const startedAt = Date.now();

    const movieCount = await this.recalculateMovies();
    const videoCount = await this.recalculateVideos();

    this.logger.log(
      `Trending recalculated: ${movieCount} movies, ${videoCount} videos in ${Date.now() - startedAt}ms`,
    );

    return { movies: movieCount, videos: videoCount };
  }

  private async recalculateMovies(): Promise<number> {
    const movies = await this.prisma.movie.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        viewCount: true,
        searchCount: true,
        watchlistAdds: true,
        rating: true,
        releaseDate: true,
        createdAt: true,
      },
    });

    const updates = movies.map((movie) => {
      const score = this.computeScore({
        views: movie.viewCount,
        searches: movie.searchCount,
        watchlistAdds: movie.watchlistAdds,
        rating: movie.rating,
        referenceDate: movie.releaseDate ?? movie.createdAt,
      });

      return this.prisma.movie.update({
        where: { id: movie.id },
        data: { trendingScore: score },
      });
    });

    await this.runChunked(updates);
    return movies.length;
  }

  private async recalculateVideos(): Promise<number> {
    const videos = await this.prisma.video.findMany({
      where: { moderationStatus: ModerationStatus.APPROVED },
      select: {
        id: true,
        viewCount: true,
        searchCount: true,
        watchlistAdds: true,
        createdAt: true,
      },
    });

    const updates = videos.map((video) =>
      this.prisma.video.update({
        where: { id: video.id },
        data: {
          trendingScore: this.computeScore({
            views: video.viewCount,
            searches: video.searchCount,
            watchlistAdds: video.watchlistAdds,
            // Videos carry no aggregate rating.
            rating: null,
            referenceDate: video.createdAt,
          }),
        },
      }),
    );

    await this.runChunked(updates);
    return videos.length;
  }

  private computeScore(input: {
    views: number;
    searches: number;
    watchlistAdds: number;
    rating: number | null;
    referenceDate: Date;
  }): number {
    const engagement =
      input.views * TRENDING_WEIGHTS.VIEWS +
      input.searches * TRENDING_WEIGHTS.SEARCHES +
      input.watchlistAdds * TRENDING_WEIGHTS.WATCHLIST_ADDS;

    const quality = (input.rating ?? 0) * TRENDING_WEIGHTS.RATING;

    // Exponential decay: a title halves its recency bonus every
    // TRENDING_RECENCY_HALF_LIFE_DAYS, so new releases surface without
    // permanently outranking everything older.
    const ageDays = Math.max(0, (Date.now() - input.referenceDate.getTime()) / DAY_MS);
    const recency =
      ageDays <= TRENDING_ACTIVITY_WINDOW_DAYS
        ? TRENDING_WEIGHTS.RECENCY * Math.pow(0.5, ageDays / TRENDING_RECENCY_HALF_LIFE_DAYS)
        : 0;

    return Number((engagement + quality + recency).toFixed(4));
  }

  /** Applies updates in batches so one transaction never holds thousands of writes. */
  private async runChunked<T>(operations: Promise<T>[] | T[], size = 100): Promise<void> {
    const list = operations as unknown[];
    for (let index = 0; index < list.length; index += size) {
      const chunk = list.slice(index, index + size);
      await this.prisma.$transaction(chunk as never);
    }
  }
}
