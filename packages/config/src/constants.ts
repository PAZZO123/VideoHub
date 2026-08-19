export const APP_NAME = 'VideoHub';
export const APP_TAGLINE = 'Discover. Watch. Enjoy.';

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 24,
  MAX_LIMIT: 60,
} as const;

/** Instant-search dropdown caps. Deliberately small — this fires on keystroke. */
export const SUGGESTION_LIMITS = {
  MOVIES: 5,
  VIDEOS: 4,
  PEOPLE: 3,
  GENRES: 3,
  CATEGORIES: 3,
} as const;

export const SEARCH_DEBOUNCE_MS = 250;
export const MIN_SEARCH_LENGTH = 2;

/** Minimum age for age-restricted content. */
export const ADULT_AGE_THRESHOLD = 18;

/**
 * Weights for the trending score. Intentionally simple for the MVP — a single
 * weighted sum recomputed on a schedule, no decay model or event stream.
 */
export const TRENDING_WEIGHTS = {
  VIEWS: 1.0,
  SEARCHES: 2.0,
  WATCHLIST_ADDS: 3.0,
  RATING: 8.0,
  RECENCY: 25.0,
} as const;

/** Half-life in days used to decay the recency component of trending. */
export const TRENDING_RECENCY_HALF_LIFE_DAYS = 14;

/** Activity older than this window is ignored by the trending job. */
export const TRENDING_ACTIVITY_WINDOW_DAYS = 30;

export const PASSWORD_RULES = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
} as const;

export const UPLOAD_RULES = {
  ALLOWED_VIDEO_MIME: [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-matroska',
  ],
  ALLOWED_IMAGE_MIME: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  MAX_THUMBNAIL_MB: 5,
  MAX_TAGS: 12,
  MAX_TITLE_LENGTH: 160,
  MAX_DESCRIPTION_LENGTH: 4000,
} as const;

export const AI = {
  MAX_MESSAGE_LENGTH: 2000,
  MAX_HISTORY_MESSAGES: 20,
  DEFAULT_MAX_TOKENS: 1024,
} as const;

export const SUGGESTED_PROMPTS = [
  { emoji: '\u{1F525}', text: "What's trending today?" },
  { emoji: '\u{1F3AC}', text: 'Recommend me an action movie' },
  { emoji: '\u{1F602}', text: 'Give me a funny movie' },
  { emoji: '\u{1F680}', text: 'Best sci-fi movies' },
  { emoji: '\u{2764}\u{FE0F}', text: 'Best romantic movies' },
  { emoji: '\u{1F30D}', text: 'Recommend African movies' },
  { emoji: '\u{1F46A}', text: 'What should I watch with my family?' },
  { emoji: '\u{23F1}\u{FE0F}', text: 'Recommend movies under 2 hours' },
] as const;
