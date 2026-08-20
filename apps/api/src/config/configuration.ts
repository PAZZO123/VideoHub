import { DOWNLOAD_LIMITS, UPLOAD_RULES } from '@videohub/config';

/**
 * Typed, validated view of process.env. Nothing in the app reads process.env
 * directly — everything goes through ConfigService<AppConfig, true>.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  apiPrefix: string;
  webOrigin: string[];

  database: {
    url: string;
  };

  auth: {
    jwtSecret: string;
    jwtRefreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
    bcryptRounds: number;
  };

  ai: {
    provider: 'mock' | 'claude' | 'openai' | 'gemini';
    maxTokens: number;
    anthropicApiKey: string;
    anthropicModel: string;
    openaiApiKey: string;
    openaiModel: string;
    geminiApiKey: string;
    geminiModel: string;
    rateLimitTtl: number;
    rateLimitMax: number;
  };

  metadata: {
    provider: 'local' | 'tmdb';
    tmdbApiKey: string;
    tmdbBaseUrl: string;
    tmdbImageBaseUrl: string;
  };

  videoCatalogue: {
    provider: 'archive' | 'none';
  };

  storage: {
    provider: 'local' | 's3' | 'r2' | 'supabase';
    localDir: string;
    publicUrl: string;
    bucket: string;
    region: string;
    endpoint: string;
    accessKey: string;
    secretKey: string;
    maxUploadMb: number;
  };

  rateLimit: {
    ttl: number;
    max: number;
  };

  downloads: {
    /** Hostnames the downloader may fetch from. Empty = use the built-in list. */
    allowedHosts: string[];
    maxMb: number;
  };
}

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const toOrigins = (value: string | undefined): string[] => {
  const origins = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : ['http://localhost:5173'];
};

export const configuration = (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: toInt(process.env.API_PORT ?? process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  webOrigin: toOrigins(process.env.WEB_ORIGIN),

  database: {
    url: process.env.DATABASE_URL ?? '',
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12),
  },

  ai: {
    provider: (process.env.AI_PROVIDER as AppConfig['ai']['provider']) ?? 'mock',
    maxTokens: toInt(process.env.AI_MAX_TOKENS, 1024),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    rateLimitTtl: toInt(process.env.AI_RATE_LIMIT_TTL, 60),
    rateLimitMax: toInt(process.env.AI_RATE_LIMIT_MAX, 10),
  },

  metadata: {
    provider: (process.env.MOVIE_METADATA_PROVIDER as AppConfig['metadata']['provider']) ?? 'local',
    tmdbApiKey: process.env.TMDB_API_KEY ?? '',
    tmdbBaseUrl: process.env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3',
    tmdbImageBaseUrl: process.env.TMDB_IMAGE_BASE_URL ?? 'https://image.tmdb.org/t/p',
  },

  videoCatalogue: {
    // Defaults to `none` so a fresh checkout never calls a third party until
    // someone opts in.
    provider:
      (process.env.VIDEO_CATALOGUE_PROVIDER as AppConfig['videoCatalogue']['provider']) ?? 'none',
  },

  storage: {
    provider: (process.env.STORAGE_PROVIDER as AppConfig['storage']['provider']) ?? 'local',
    localDir: process.env.STORAGE_LOCAL_DIR ?? './storage',
    publicUrl: process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:3000/api/files',
    bucket: process.env.STORAGE_BUCKET ?? 'videohub',
    region: process.env.STORAGE_REGION ?? 'auto',
    endpoint: process.env.STORAGE_ENDPOINT ?? '',
    accessKey: process.env.STORAGE_ACCESS_KEY ?? '',
    secretKey: process.env.STORAGE_SECRET_KEY ?? '',
    maxUploadMb: toInt(process.env.MAX_UPLOAD_MB, UPLOAD_RULES.MAX_UPLOAD_MB),
  },

  rateLimit: {
    ttl: toInt(process.env.RATE_LIMIT_TTL, 60),
    max: toInt(process.env.RATE_LIMIT_MAX, 120),
  },

  downloads: {
    allowedHosts: toList(process.env.DOWNLOAD_ALLOWED_HOSTS),
    maxMb: Math.min(
      toInt(process.env.DOWNLOAD_MAX_MB, DOWNLOAD_LIMITS.DEFAULT_MAX_MB),
      DOWNLOAD_LIMITS.ABSOLUTE_MAX_MB,
    ),
  },
});
