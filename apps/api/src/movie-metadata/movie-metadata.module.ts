import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import {
  MOVIE_METADATA_PROVIDER,
  type MovieMetadataProvider,
} from './movie-metadata.interface';
import { LocalMetadataProvider } from './providers/local.provider';
import { TmdbMetadataProvider } from './providers/tmdb.provider';

/**
 * Binds the configured provider to the MOVIE_METADATA_PROVIDER token.
 *
 * Selection happens once at startup. Consumers inject the token and never learn
 * which implementation they got.
 */
@Global()
@Module({
  providers: [
    LocalMetadataProvider,
    TmdbMetadataProvider,
    {
      provide: MOVIE_METADATA_PROVIDER,
      // Both are constructed by Nest and one is selected, rather than being
      // built by hand here — so each keeps normal DI and can grow dependencies.
      inject: [ConfigService, LocalMetadataProvider, TmdbMetadataProvider],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        local: LocalMetadataProvider,
        tmdb: TmdbMetadataProvider,
      ): MovieMetadataProvider => {
        const { provider } = config.get('metadata', { infer: true });
        // Env validation already rejects `tmdb` without a key, so reaching this
        // branch means the key is present.
        return provider === 'tmdb' ? tmdb : local;
      },
    },
  ],
  exports: [MOVIE_METADATA_PROVIDER],
})
export class MovieMetadataModule {}
