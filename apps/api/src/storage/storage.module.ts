import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { LocalStorageService } from './providers/local.storage';
import { S3StorageService } from './providers/s3.storage';
import { STORAGE_SERVICE, type StorageService } from './storage.interface';

/**
 * Binds the configured backend to the STORAGE_SERVICE token. Consumers inject
 * the token and never learn which implementation they received.
 */
@Global()
@Module({
  providers: [
    LocalStorageService,
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService, LocalStorageService],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        local: LocalStorageService,
      ): StorageService => {
        const { provider } = config.get('storage', { infer: true });
        if (provider === 'local') return local;

        // Constructed lazily rather than registered as a provider: instantiating
        // the S3 client at boot would fail when running on local storage with no
        // credentials configured.
        return new S3StorageService(config);
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
