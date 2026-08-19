/** Envelope every VideoHub endpoint responds with. Kept identical on both sides. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  /** Human-readable, safe to render. Never contains internal detail. */
  message: string;
  /** Stable machine code, e.g. MOVIE_NOT_FOUND. */
  code: string;
  /** Field-level validation problems, when applicable. */
  details?: Record<string, string[]>;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/** Canonical error codes. Shared so the client can branch on them safely. */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',

  MOVIE_NOT_FOUND: 'MOVIE_NOT_FOUND',
  VIDEO_NOT_FOUND: 'VIDEO_NOT_FOUND',
  GENRE_NOT_FOUND: 'GENRE_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
  WATCHLIST_ITEM_NOT_FOUND: 'WATCHLIST_ITEM_NOT_FOUND',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  DOWNLOAD_NOT_FOUND: 'DOWNLOAD_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  AGE_VERIFICATION_REQUIRED: 'AGE_VERIFICATION_REQUIRED',
  UNDERAGE: 'UNDERAGE',

  DOWNLOAD_NOT_PERMITTED: 'DOWNLOAD_NOT_PERMITTED',
  UPLOAD_REJECTED: 'UPLOAD_REJECTED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
