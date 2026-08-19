import type { Category, Source, User, Video } from '@prisma/client';
import type {
  CategoryDto,
  MaturityRating,
  ModerationStatus,
  VideoDetail,
  VideoSummary,
} from '@videohub/types';
import { toSourceDto } from '../movies/movies.mapper';

export type VideoWithRelations = Video & {
  category: Category | null;
  uploader: Pick<User, 'displayName'> | null;
  sources?: Source[];
};

export const VIDEO_SUMMARY_INCLUDE = {
  category: true,
  uploader: { select: { displayName: true } },
} as const;

export const VIDEO_DETAIL_INCLUDE = {
  category: true,
  uploader: { select: { displayName: true } },
  sources: true,
} as const;

export function toCategoryDto(category: Category): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    isKids: category.isKids,
    iconEmoji: category.iconEmoji,
    colorHex: category.colorHex,
  };
}

export function toVideoSummary(video: VideoWithRelations): VideoSummary {
  return {
    id: video.id,
    slug: video.slug,
    title: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    durationSeconds: video.durationSeconds,
    maturityRating: video.maturityRating as MaturityRating,
    category: video.category ? toCategoryDto(video.category) : null,
    uploaderName: video.uploader?.displayName ?? null,
    viewCount: video.viewCount,
    trendingScore: video.trendingScore,
    moderationStatus: video.moderationStatus as ModerationStatus,
    createdAt: video.createdAt.toISOString(),
  };
}

export function toVideoDetail(video: VideoWithRelations): VideoDetail {
  const source = video.sources?.[0] ?? null;

  return {
    ...toVideoSummary(video),
    tags: video.tags,
    playbackUrl: video.playbackUrl,
    captionsUrl: video.captionsUrl,
    captionsLabel: video.captionsLabel,
    source: source ? toSourceDto(source) : null,
    // Only what the rights holder confirmed — never inferred from the file.
    downloadAllowed: video.downloadAllowed && video.rightsConfirmed,
    language: video.language,
  };
}
