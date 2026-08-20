import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { CatalogueSyncService } from './catalogue-sync.service';
import { ArchiveOrgProvider } from './providers/archive.provider';
import { NoneCatalogueProvider } from './providers/none.provider';
import {
  VIDEO_CATALOGUE_PROVIDER,
  type VideoCatalogueProvider,
} from './video-catalogue.interface';

/**
 * Binds the configured provider to the VIDEO_CATALOGUE_PROVIDER token.
 *
 * Defaults to `none`, so a fresh checkout never reaches a third party until
 * someone opts in.
 */
@Global()
@Module({
  providers: [
    ArchiveOrgProvider,
    NoneCatalogueProvider,
    CatalogueSyncService,
    {
      provide: VIDEO_CATALOGUE_PROVIDER,
      inject: [ConfigService, ArchiveOrgProvider, NoneCatalogueProvider],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        archive: ArchiveOrgProvider,
        none: NoneCatalogueProvider,
      ): VideoCatalogueProvider => {
        const { provider } = config.get('videoCatalogue', { infer: true });
        return provider === 'archive' ? archive : none;
      },
    },
  ],
  exports: [VIDEO_CATALOGUE_PROVIDER, CatalogueSyncService],
})
export class VideoCatalogueModule {}
