import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { AppConfig } from '../../config/configuration';
import {
  sanitiseStorageKey,
  type StorageObject,
  type StorageService,
  type StorageUploadInput,
  type StorageUrlOptions,
} from '../storage.interface';

/**
 * Filesystem-backed storage for development.
 *
 * Deliberately not production-grade: it does not survive a container restart and
 * does not scale past one machine. Boot refuses `STORAGE_PROVIDER=local` when
 * `NODE_ENV=production` for exactly that reason.
 */
@Injectable()
export class LocalStorageService implements StorageService {
  readonly name = 'local';
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly root: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const storage = config.get('storage', { infer: true });
    this.root = resolve(process.cwd(), storage.localDir);
    this.publicUrl = storage.publicUrl.replace(/\/$/, '');
  }

  async upload(input: StorageUploadInput): Promise<StorageObject> {
    const key = sanitiseStorageKey(input.key);
    const path = this.pathFor(key);

    await mkdir(dirname(path), { recursive: true });

    const source = Buffer.isBuffer(input.body) ? Readable.from(input.body) : input.body;
    await pipeline(source, createWriteStream(path));

    const { size } = await stat(path);
    this.logger.debug(`Stored ${key} (${size} bytes)`);

    return {
      key,
      sizeBytes: size,
      contentType: input.contentType,
      url: await this.getUrl(key),
    };
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(sanitiseStorageKey(key)), { force: true });
  }

  async getUrl(key: string, options?: StorageUrlOptions): Promise<string> {
    const safeKey = sanitiseStorageKey(key);
    const url = `${this.publicUrl}/${safeKey}`;
    return options?.downloadFilename
      ? `${url}?filename=${encodeURIComponent(options.downloadFilename)}`
      : url;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(sanitiseStorageKey(key)));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves a key to an absolute path, refusing anything that escapes the
   * storage root. `sanitiseStorageKey` already strips traversal, but this is the
   * check that actually guarantees it.
   */
  private pathFor(key: string): string {
    const path = resolve(join(this.root, key));
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new Error('Resolved storage path escapes the storage root.');
    }
    return path;
  }
}
