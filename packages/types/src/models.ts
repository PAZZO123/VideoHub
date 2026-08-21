import type {
  MaturityRating,
  MediaKind,
  ModerationStatus,
  RecommendationSource,
  SourceAccess,
  DownloadStatus,
  DownloadRefusalReason,
  UserPlan,
  UserRole,
  AIRole,
} from './enums';

/** The authenticated user as exposed to the client. Never includes secrets. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  plan: UserPlan;
  /** True only when the user completed the 18+ verification flow. */
  ageVerified: boolean;
  /** User-chosen toggle; when on, only KIDS-rated content is served. */
  kidsMode: boolean;
  preferredLanguage: string | null;
  createdAt: string;
}

export interface GenreDto {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Marks the Ibitente / kids category tree. */
  isKids: boolean;
  iconEmoji: string | null;
  colorHex: string | null;
}

export interface SourceDto {
  id: string;
  platform: string;
  url: string;
  access: SourceAccess;
  region: string | null;
  /**
   * Whether VideoHub may serve a download for this source. Derived from the
   * licence, never from an attempt to defeat a technical protection.
   */
  downloadAllowed: boolean;
  qualityLabel: string | null;
}

export interface CastMemberDto {
  name: string;
  character: string | null;
  order: number;
}

export interface MovieSummary {
  id: string;
  slug: string;
  title: string;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  rating: number | null;
  language: string | null;
  maturityRating: MaturityRating;
  genres: GenreDto[];
  trendingScore: number;
  popularity: number;
}

export interface MovieDetail extends MovieSummary {
  releaseDate: string | null;
  tagline: string | null;
  director: string | null;
  cast: CastMemberDto[];
  trailerUrl: string | null;
  sources: SourceDto[];
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A queue row, which is a VideoSummary plus what a moderator needs to decide.
 *
 * `playbackUrl` is deliberately absent from VideoSummary — public listings must
 * not hand out a playable URL for something still unapproved. Here it is the
 * whole point: a reviewer has to watch before judging.
 */
export interface ModerationItem extends VideoSummary {
  playbackUrl: string | null;
  moderationNote: string | null;
  moderatedAt: string | null;
}

export interface VideoSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  maturityRating: MaturityRating;
  category: CategoryDto | null;
  uploaderName: string | null;
  viewCount: number;
  trendingScore: number;
  moderationStatus: ModerationStatus;
  createdAt: string;
}

export interface VideoDetail extends VideoSummary {
  tags: string[];
  playbackUrl: string | null;
  /** WebVTT captions track, when the uploader supplied one. */
  captionsUrl: string | null;
  captionsLabel: string | null;
  source: SourceDto | null;
  downloadAllowed: boolean;
  language: string | null;
}

export interface WatchlistItemDto {
  id: string;
  kind: MediaKind;
  movie: MovieSummary | null;
  video: VideoSummary | null;
  createdAt: string;
}

export interface WatchHistoryItemDto {
  id: string;
  kind: MediaKind;
  movie: MovieSummary | null;
  video: VideoSummary | null;
  progressSeconds: number;
  durationSeconds: number | null;
  /** 0 to 1. Precomputed so the client never divides by a null duration. */
  progressRatio: number;
  completed: boolean;
  startedAt: string;
  lastWatchedAt: string;
}

export interface DownloadDto {
  id: string;
  sourceUrl: string;
  /** Hostname the URL pointed at, shown as a fallback title. */
  host: string;
  title: string | null;
  thumbnailUrl: string | null;
  status: DownloadStatus;
  fileSizeBytes: number | null;
  format: string | null;
  storageKey: string | null;
  refusalReason: DownloadRefusalReason | null;
  message: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DownloadFormatOption {
  formatId: string;
  label: string;
  container: string;
  qualityLabel: string | null;
  approxSizeBytes: number | null;
}

/** Result of POST /downloads/analyze. */
export interface DownloadAnalysis {
  url: string;
  host: string;
  /** True only when the host is allowlisted AND the licence permits download. */
  permitted: boolean;
  refusalReason: DownloadRefusalReason | null;
  /** Rendered verbatim in the UI when permitted is false. */
  message: string;
  title: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  formats: DownloadFormatOption[];
  /** Always present so the UI can offer "Open original source". */
  originalUrl: string;
}

export interface AIRecommendationDto {
  movieId: string | null;
  videoId: string | null;
  title: string;
  reason: string;
  rating: number | null;
  genres: string[];
  posterUrl: string | null;
  sources: SourceDto[];
}

export interface AIMessageDto {
  id: string;
  role: AIRole;
  content: string;
  /** Movies the assistant referenced, resolved to real records. */
  recommendations: AIRecommendationDto[];
  createdAt: string;
}

export interface AIConversationDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: AIMessageDto[];
}

export interface RecommendationDto {
  movie: MovieSummary;
  score: number;
  source: RecommendationSource;
  reason: string;
}

export interface TrendingItemDto {
  kind: MediaKind;
  movie: MovieSummary | null;
  video: VideoSummary | null;
  trendingScore: number;
}

export interface AdminStatsDto {
  totalUsers: number;
  totalMovies: number;
  totalVideos: number;
  totalDownloads: number;
  totalSearches: number;
  pendingModeration: number;
  mostViewedMovies: MovieSummary[];
  trendingMovies: MovieSummary[];
}

export interface AdminUserDto {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  plan: UserPlan;
  ageVerified: boolean;
  createdAt: string;
  watchlistCount: number;
  downloadCount: number;
}

export interface ModerationItemDto {
  id: string;
  title: string;
  uploaderName: string | null;
  thumbnailUrl: string | null;
  moderationStatus: ModerationStatus;
  moderationNote: string | null;
  createdAt: string;
}
