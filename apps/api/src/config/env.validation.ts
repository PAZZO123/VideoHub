import { z } from 'zod';

/**
 * Fail fast on boot rather than at the first request. Only genuinely required
 * variables are strict here; provider-specific keys are validated by the
 * provider that needs them (so `AI_PROVIDER=mock` boots with no keys at all).
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().default('api'),
    WEB_ORIGIN: z.string().default('http://localhost:5173'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Neon pooled connection string)'),
    DIRECT_URL: z.string().optional(),

    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_REFRESH_SECRET: z.string().min(16).optional(),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    AI_PROVIDER: z.enum(['mock', 'claude', 'openai', 'gemini']).default('mock'),
    AI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().optional(),
    AI_RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

    MOVIE_METADATA_PROVIDER: z.enum(['local', 'tmdb']).default('local'),
    TMDB_API_KEY: z.string().optional(),
    TMDB_BASE_URL: z.string().optional(),
    TMDB_IMAGE_BASE_URL: z.string().optional(),

    STORAGE_PROVIDER: z.enum(['local', 's3', 'r2', 'supabase']).default('local'),
    STORAGE_LOCAL_DIR: z.string().optional(),
    STORAGE_PUBLIC_URL: z.string().optional(),
    STORAGE_BUCKET: z.string().optional(),
    STORAGE_REGION: z.string().optional(),
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(200),

    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    DOWNLOAD_ALLOWED_HOSTS: z.string().optional(),
    DOWNLOAD_MAX_MB: z.coerce.number().int().positive().default(1024),
  })
  .superRefine((env, ctx) => {
    // A non-mock AI provider is useless without its key — catch it at boot.
    const keyByProvider: Record<string, string | undefined> = {
      claude: env.ANTHROPIC_API_KEY,
      openai: env.OPENAI_API_KEY,
      gemini: env.GEMINI_API_KEY,
    };
    const required = keyByProvider[env.AI_PROVIDER];
    if (env.AI_PROVIDER !== 'mock' && !required) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `AI_PROVIDER=${env.AI_PROVIDER} requires the matching API key to be set. Use AI_PROVIDER=mock for development.`,
        path: ['AI_PROVIDER'],
      });
    }

    if (env.MOVIE_METADATA_PROVIDER === 'tmdb' && !env.TMDB_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MOVIE_METADATA_PROVIDER=tmdb requires TMDB_API_KEY.',
        path: ['MOVIE_METADATA_PROVIDER'],
      });
    }

    if (env.STORAGE_PROVIDER !== 'local' && (!env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `STORAGE_PROVIDER=${env.STORAGE_PROVIDER} requires STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY.`,
        path: ['STORAGE_PROVIDER'],
      });
    }

    if (env.NODE_ENV === 'production') {
      if (env.JWT_SECRET.includes('change-me')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWT_SECRET still holds the placeholder value. Generate a real secret.',
          path: ['JWT_SECRET'],
        });
      }
      if (env.STORAGE_PROVIDER === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'STORAGE_PROVIDER=local is development-only. Configure object storage for production.',
          path: ['STORAGE_PROVIDER'],
        });
      }
    }
  });

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Record<string, unknown> {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  // Return the raw object so ConfigService still exposes every variable; the
  // parse above is purely a gate.
  return raw;
}
