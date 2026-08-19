import { Injectable } from '@nestjs/common';
import { MediaKind as PrismaMediaKind, ModerationStatus, Prisma } from '@prisma/client';
import { ErrorCode, MediaKind, type WatchHistoryItemDto } from '@videohub/types';
import { canView, visibilityWhere, type VisibilityContext } from '../common/content-visibility';
import { paginate } from '../common/dto/pagination.dto';
import type { PaginationDto } from '../common/dto/pagination.dto';
import { AppException } from '../common/exceptions/app.exception';
import { MOVIE_SUMMARY_INCLUDE, toMovieSummary } from '../movies/movies.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { VIDEO_SUMMARY_INCLUDE, toVideoSummary } from '../videos/videos.mapper';
import type { RecordProgressDto } from './dto/history.dto';

const HISTORY_INCLUDE = {
  movie: { include: MOVIE_SUMMARY_INCLUDE },
  video: { include: VIDEO_SUMMARY_INCLUDE },
} as const;

type HistoryRow = Prisma.WatchHistoryGetPayload<{ include: typeof HISTORY_INCLUDE }>;

/**
 * Past this fraction of the runtime a title counts as finished, so it drops out
 * of Continue Watching instead of sitting there at 98% forever.
 */
const COMPLETION_THRESHOLD = 0.95;

/** Below this, resuming is not worth offering — the user barely started. */
const CONTINUE_WATCHING_MIN_RATIO = 0.02;

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    userId: string,
    pagination: PaginationDto,
  ): Promise<ReturnType<typeof paginate<WatchHistoryItemDto>>> {
    const where = { userId };

    const [items, total] = await Promise.all([
      this.prisma.watchHistory.findMany({
        where,
        include: HISTORY_INCLUDE,
        orderBy: { lastWatchedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.watchHistory.count({ where }),
    ]);

    return paginate(items.map((item) => this.toDto(item)), pagination.page, pagination.take, total);
  }

  /**
   * Continue Watching: started, not finished, and far enough in to be worth
   * resuming. Visibility is re-applied on read, so a user who turns Kids Mode on
   * stops seeing their in-progress adult titles.
   */
  async getContinueWatching(
    userId: string,
    context: VisibilityContext,
    limit = 12,
  ): Promise<WatchHistoryItemDto[]> {
    const visibility = visibilityWhere(context);

    const items = await this.prisma.watchHistory.findMany({
      where: {
        userId,
        completed: false,
        progressSeconds: { gt: 0 },
        OR: [{ movie: visibility }, { video: visibility }],
      },
      include: HISTORY_INCLUDE,
      orderBy: { lastWatchedAt: 'desc' },
      take: limit,
    });

    return items
      .map((item) => this.toDto(item))
      .filter((item) => item.progressRatio >= CONTINUE_WATCHING_MIN_RATIO);
  }

  /**
   * Upserts progress for one title. Called repeatedly by the player, so it must
   * stay a single write.
   */
  async recordProgress(
    userId: string,
    dto: RecordProgressDto,
    context: VisibilityContext,
  ): Promise<WatchHistoryItemDto> {
    const duration = await this.resolveDuration(dto, context);
    const completed = dto.completed ?? this.inferCompleted(dto.progressSeconds, duration);
    const now = new Date();

    const data = {
      progressSeconds: dto.progressSeconds,
      durationSeconds: duration,
      completed,
      lastWatchedAt: now,
    };

    // The compound uniques are (userId, movieId) and (userId, videoId), so each
    // kind upserts through its own key.
    const item =
      dto.kind === MediaKind.MOVIE
        ? await this.prisma.watchHistory.upsert({
            where: { userId_movieId: { userId, movieId: dto.movieId as string } },
            update: data,
            create: {
              userId,
              kind: PrismaMediaKind.MOVIE,
              movieId: dto.movieId as string,
              startedAt: now,
              ...data,
            },
            include: HISTORY_INCLUDE,
          })
        : await this.prisma.watchHistory.upsert({
            where: { userId_videoId: { userId, videoId: dto.videoId as string } },
            update: data,
            create: {
              userId,
              kind: PrismaMediaKind.VIDEO,
              videoId: dto.videoId as string,
              startedAt: now,
              ...data,
            },
            include: HISTORY_INCLUDE,
          });

    return this.toDto(item);
  }

  async removeOne(userId: string, itemId: string): Promise<{ removed: true }> {
    const { count } = await this.prisma.watchHistory.deleteMany({
      where: { id: itemId, userId },
    });

    if (count === 0) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'That history entry could not be found.');
    }

    return { removed: true };
  }

  async clear(userId: string): Promise<{ removed: number }> {
    const { count } = await this.prisma.watchHistory.deleteMany({ where: { userId } });
    return { removed: count };
  }

  /**
   * Uses the client-reported duration when given, otherwise falls back to the
   * catalogue. Also serves as the existence + visibility check, so progress
   * cannot be recorded against something the viewer may not see.
   */
  private async resolveDuration(
    dto: RecordProgressDto,
    context: VisibilityContext,
  ): Promise<number | null> {
    if (dto.kind === MediaKind.MOVIE) {
      const movie = await this.prisma.movie.findFirst({
        where: { id: dto.movieId as string, isPublished: true },
        select: { maturityRating: true, runtimeMinutes: true },
      });

      if (!movie || !canView(movie.maturityRating, context)) {
        throw AppException.notFound(ErrorCode.MOVIE_NOT_FOUND, 'We couldn’t find that movie.');
      }

      return dto.durationSeconds ?? (movie.runtimeMinutes ? movie.runtimeMinutes * 60 : null);
    }

    const video = await this.prisma.video.findFirst({
      where: { id: dto.videoId as string, moderationStatus: ModerationStatus.APPROVED },
      select: { maturityRating: true, durationSeconds: true },
    });

    if (!video || !canView(video.maturityRating, context)) {
      throw AppException.notFound(ErrorCode.VIDEO_NOT_FOUND, 'We couldn’t find that video.');
    }

    return dto.durationSeconds ?? video.durationSeconds;
  }

  private inferCompleted(progressSeconds: number, duration: number | null): boolean {
    if (!duration || duration <= 0) return false;
    return progressSeconds / duration >= COMPLETION_THRESHOLD;
  }

  private toDto(item: HistoryRow): WatchHistoryItemDto {
    const duration = item.durationSeconds;
    // Precomputed here so the client never divides by a null duration.
    const ratio =
      duration && duration > 0 ? Math.min(1, item.progressSeconds / duration) : 0;

    return {
      id: item.id,
      kind: item.kind as MediaKind,
      movie: item.movie ? toMovieSummary(item.movie) : null,
      video: item.video ? toVideoSummary(item.video) : null,
      progressSeconds: item.progressSeconds,
      durationSeconds: duration,
      progressRatio: Number(ratio.toFixed(4)),
      completed: item.completed,
      startedAt: item.startedAt.toISOString(),
      lastWatchedAt: item.lastWatchedAt.toISOString(),
    };
  }
}
