import { Injectable } from '@nestjs/common';
import { MediaKind as PrismaMediaKind, ModerationStatus, Prisma } from '@prisma/client';
import { ErrorCode, MediaKind, type WatchlistItemDto } from '@videohub/types';
import { canView, type VisibilityContext } from '../common/content-visibility';
import { AppException } from '../common/exceptions/app.exception';
import { MOVIE_SUMMARY_INCLUDE, toMovieSummary } from '../movies/movies.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { VIDEO_SUMMARY_INCLUDE, toVideoSummary } from '../videos/videos.mapper';
import type { AddToWatchlistDto } from './dto/watchlist.dto';

const WATCHLIST_INCLUDE = {
  movie: { include: MOVIE_SUMMARY_INCLUDE },
  video: { include: VIDEO_SUMMARY_INCLUDE },
} as const;

type WatchlistRow = Prisma.WatchlistItemGetPayload<{ include: typeof WATCHLIST_INCLUDE }>;

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, kind?: MediaKind): Promise<WatchlistItemDto[]> {
    const items = await this.prisma.watchlistItem.findMany({
      where: { userId, ...(kind ? { kind: kind as PrismaMediaKind } : {}) },
      include: WATCHLIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.toDto(item));
  }

  async add(
    userId: string,
    dto: AddToWatchlistDto,
    context: VisibilityContext,
  ): Promise<WatchlistItemDto> {
    // Resolve the target first: this both proves it exists and applies the
    // viewer's visibility rules, so nothing unviewable can be saved.
    if (dto.kind === MediaKind.MOVIE) {
      await this.assertMovieVisible(dto.movieId as string, context);
    } else {
      await this.assertVideoVisible(dto.videoId as string, context);
    }

    const existing = await this.prisma.watchlistItem.findFirst({
      where: {
        userId,
        ...(dto.kind === MediaKind.MOVIE
          ? { movieId: dto.movieId }
          : { videoId: dto.videoId }),
      },
      include: WATCHLIST_INCLUDE,
    });

    // Adding twice is a no-op rather than an error — the button is a toggle and
    // a double-tap should not produce a 409.
    if (existing) return this.toDto(existing);

    // Genuinely transactional, unlike the read-only list queries elsewhere: the
    // row and the trending counter must move together, or the count drifts.
    const [item] = await this.prisma.$transaction([
      this.prisma.watchlistItem.create({
        data: {
          userId,
          kind: dto.kind as PrismaMediaKind,
          movieId: dto.kind === MediaKind.MOVIE ? (dto.movieId as string) : null,
          videoId: dto.kind === MediaKind.VIDEO ? (dto.videoId as string) : null,
        },
        include: WATCHLIST_INCLUDE,
      }),
      // Feeds the watchlistAdds term in the trending score.
      dto.kind === MediaKind.MOVIE
        ? this.prisma.movie.update({
            where: { id: dto.movieId as string },
            data: { watchlistAdds: { increment: 1 } },
          })
        : this.prisma.video.update({
            where: { id: dto.videoId as string },
            data: { watchlistAdds: { increment: 1 } },
          }),
    ]);

    return this.toDto(item);
  }

  /** Removes by watchlist item id. Scoped to the owner. */
  async remove(userId: string, itemId: string): Promise<{ removed: true }> {
    const { count } = await this.prisma.watchlistItem.deleteMany({
      where: { id: itemId, userId },
    });

    if (count === 0) {
      throw AppException.notFound(
        ErrorCode.WATCHLIST_ITEM_NOT_FOUND,
        'That item is not in your watchlist.',
      );
    }

    return { removed: true };
  }

  /** Removes by the underlying media id — what the toggle button on a card uses. */
  async removeByMedia(
    userId: string,
    kind: MediaKind,
    mediaId: string,
  ): Promise<{ removed: true }> {
    const { count } = await this.prisma.watchlistItem.deleteMany({
      where: {
        userId,
        ...(kind === MediaKind.MOVIE ? { movieId: mediaId } : { videoId: mediaId }),
      },
    });

    if (count === 0) {
      throw AppException.notFound(
        ErrorCode.WATCHLIST_ITEM_NOT_FOUND,
        'That item is not in your watchlist.',
      );
    }

    return { removed: true };
  }

  /**
   * Which of the given media ids the user has saved.
   *
   * Lets a grid of cards resolve their toggle state in one request instead of
   * one per card.
   */
  async getSavedIds(userId: string, mediaIds: string[]): Promise<string[]> {
    if (mediaIds.length === 0) return [];

    const items = await this.prisma.watchlistItem.findMany({
      where: {
        userId,
        OR: [{ movieId: { in: mediaIds } }, { videoId: { in: mediaIds } }],
      },
      select: { movieId: true, videoId: true },
    });

    return items
      .map((item) => item.movieId ?? item.videoId)
      .filter((id): id is string => id !== null);
  }

  private async assertMovieVisible(movieId: string, context: VisibilityContext): Promise<void> {
    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, isPublished: true },
      select: { maturityRating: true },
    });

    if (!movie || !canView(movie.maturityRating, context)) {
      throw AppException.notFound(ErrorCode.MOVIE_NOT_FOUND, 'We couldn’t find that movie.');
    }
  }

  private async assertVideoVisible(videoId: string, context: VisibilityContext): Promise<void> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, moderationStatus: ModerationStatus.APPROVED },
      select: { maturityRating: true },
    });

    if (!video || !canView(video.maturityRating, context)) {
      throw AppException.notFound(ErrorCode.VIDEO_NOT_FOUND, 'We couldn’t find that video.');
    }
  }

  private toDto(item: WatchlistRow): WatchlistItemDto {
    return {
      id: item.id,
      kind: item.kind as MediaKind,
      movie: item.movie ? toMovieSummary(item.movie) : null,
      video: item.video ? toVideoSummary(item.video) : null,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
