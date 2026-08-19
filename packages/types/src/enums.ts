/**
 * Shared enums. Declared as const-objects (not TS `enum`) so they are safe to
 * consume from the browser bundle without pulling in the Prisma client, while
 * still producing a literal union type. The string values are kept identical to
 * the Prisma enum values so both sides serialise interchangeably.
 */

export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * Billing plan. There is no payment system today and every account is FREE —
 * this exists purely so a premium tier can be layered on later without a
 * migration that touches every user row.
 */
export const UserPlan = {
  FREE: 'FREE',
  PREMIUM: 'PREMIUM',
} as const;
export type UserPlan = (typeof UserPlan)[keyof typeof UserPlan];

/** Content maturity. ADULT is only ever served to age-verified accounts. */
export const MaturityRating = {
  KIDS: 'KIDS',
  GENERAL: 'GENERAL',
  TEEN: 'TEEN',
  MATURE: 'MATURE',
  ADULT: 'ADULT',
} as const;
export type MaturityRating = (typeof MaturityRating)[keyof typeof MaturityRating];

/** Ratings that require a verified 18+ account before they may be returned. */
export const AGE_RESTRICTED_RATINGS: readonly MaturityRating[] = [MaturityRating.ADULT];

export const ModerationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ModerationStatus = (typeof ModerationStatus)[keyof typeof ModerationStatus];

export const MediaKind = {
  MOVIE: 'MOVIE',
  VIDEO: 'VIDEO',
} as const;
export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];

/** How a Source may legally be consumed. Drives the downloader policy engine. */
export const SourceAccess = {
  /** Freely streamable on the source platform. */
  FREE_STREAM: 'FREE_STREAM',
  /** Streamable but requires a subscription/rental on the source platform. */
  SUBSCRIPTION: 'SUBSCRIPTION',
  RENT: 'RENT',
  BUY: 'BUY',
  /** Public domain / permissively licensed — download is explicitly allowed. */
  PUBLIC_DOMAIN: 'PUBLIC_DOMAIN',
  /** Rights holder uploaded to VideoHub and permitted download. */
  LICENSED_DOWNLOAD: 'LICENSED_DOWNLOAD',
} as const;
export type SourceAccess = (typeof SourceAccess)[keyof typeof SourceAccess];

export const DownloadStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
} as const;
export type DownloadStatus = (typeof DownloadStatus)[keyof typeof DownloadStatus];

/** Why the downloader refused a URL. Surfaced verbatim to the UI. */
export const DownloadRefusalReason = {
  HOST_NOT_ALLOWED: 'HOST_NOT_ALLOWED',
  PROTECTED_CONTENT: 'PROTECTED_CONTENT',
  REQUIRES_AUTH: 'REQUIRES_AUTH',
  PAYWALLED: 'PAYWALLED',
  ROBOTS_DISALLOWED: 'ROBOTS_DISALLOWED',
  UNSUPPORTED_URL: 'UNSUPPORTED_URL',
  TOO_LARGE: 'TOO_LARGE',
} as const;
export type DownloadRefusalReason =
  (typeof DownloadRefusalReason)[keyof typeof DownloadRefusalReason];

export const AIRole = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
} as const;
export type AIRole = (typeof AIRole)[keyof typeof AIRole];

export const RecommendationSource = {
  TRENDING: 'TRENDING',
  SIMILARITY: 'SIMILARITY',
  PREFERENCE: 'PREFERENCE',
  AI: 'AI',
} as const;
export type RecommendationSource =
  (typeof RecommendationSource)[keyof typeof RecommendationSource];
