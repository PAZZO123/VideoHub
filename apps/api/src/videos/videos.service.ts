import { Injectable } from '@nestjs/common';
import { ModerationStatus, Prisma } from '@prisma/client';
import {
  ErrorCode,
  SearchSort,
  type Paginated,
  type VideoDetail,
  type VideoSummary,
} from '@videohub/types';
import { canView, isKidsView, visibilityWhere, type VisibilityContext } from '../common/content-visibility';
import { paginate } from '../common/dto/pagination.dto';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryVideosDto } from './dto/query-videos.dto';
import {
  VIDEO_DETAIL_INCLUDE,
  VIDEO_SUMMARY_INCLUDE,
  toVideoDetail,
  toVideoSummary,
} from './videos.mapper';

@Injectable()
export class VideosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: QueryVideosDto,
    context: VisibilityContext,
  ): Promise<Paginated<VideoSummary>> {
    const where = this.buildWhere(query, context);

    const [items, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        include: VIDEO_SUMMARY_INCLUDE,
        orderBy: this.buildOrderBy(query.sort),
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.video.count({ where }),
    ]);

    return paginate(items.map(toVideoSummary), query.page, query.take, total);
  }

  async findBySlug(slug: string, context: VisibilityContext): Promise<VideoDetail> {
    const video = await this.prisma.video.findFirst({
      where: { slug, moderationStatus: ModerationStatus.APPROVED },
      include: VIDEO_DETAIL_INCLUDE,
    });

    if (!video || !canView(video.maturityRating, context)) {
      throw AppException.notFound(ErrorCode.VIDEO_NOT_FOUND, 'We couldn’t find that video.');
    }

    // In a kids view, a video outside the kids catalogue is not reachable even
    // if its own rating happens to be KIDS.
    if (isKidsView(context) && !video.category?.isKids) {
      throw AppException.notFound(ErrorCode.VIDEO_NOT_FOUND, 'We couldn’t find that video.');
    }

    return toVideoDetail(video);
  }

  async recordView(videoId: string): Promise<void> {
    await this.prisma.video
      .update({ where: { id: videoId }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);
  }

  private buildWhere(query: QueryVideosDto, context: VisibilityContext): Prisma.VideoWhereInput {
    const where: Prisma.VideoWhereInput = {
      ...visibilityWhere(context),
      // Unreviewed and rejected uploads are never publicly searchable.
      moderationStatus: ModerationStatus.APPROVED,
    };

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { tags: { has: query.q.toLowerCase() } },
      ];
    }

    // An explicit category wins; otherwise a kids view is scoped to the whole
    // kids tree.
    if (query.category) {
      where.category = { slug: query.category };
    } else if (query.kids || isKidsView(context)) {
      where.category = { isKids: true };
    }

    if (query.language) where.language = query.language;
    if (query.maxDuration !== undefined) where.durationSeconds = { lte: query.maxDuration };

    return where;
  }

  private buildOrderBy(sort: SearchSort = SearchSort.TRENDING): Prisma.VideoOrderByWithRelationInput[] {
    switch (sort) {
      case SearchSort.NEWEST:
        return [{ createdAt: 'desc' }, { id: 'asc' }];
      case SearchSort.TITLE:
        return [{ title: 'asc' }, { id: 'asc' }];
      case SearchSort.POPULARITY:
        return [{ viewCount: 'desc' }, { id: 'asc' }];
      case SearchSort.RATING:
      case SearchSort.TRENDING:
      default:
        return [{ trendingScore: 'desc' }, { id: 'asc' }];
    }
  }
}
