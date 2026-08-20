import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import {
  sanitiseStorageKey,
  type StorageObject,
  type StorageService,
  type StorageUploadInput,
  type StorageUrlOptions,
} from '../storage.interface';

/**
 * S3-compatible storage.
 *
 * One adapter covers AWS S3, Cloudflare R2 and Supabase Storage — all three
 * speak the S3 API, and differ only in endpoint and region. Selecting between
 * them is a matter of `STORAGE_ENDPOINT`, not a separate implementation.
 */
@Injectable()
export class S3StorageService implements StorageService {
  readonly name: string;
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const storage = config.get('storage', { infer: true });

    this.name = storage.provider;
    this.bucket = storage.bucket;
    this.publicUrl = storage.publicUrl.replace(/\/$/, '');

    this.client = new S3Client({
      region: storage.region || 'auto',
      // R2 and Supabase require an explicit endpoint; plain AWS S3 does not.
      ...(storage.endpoint ? { endpoint: storage.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: storage.accessKey,
        secretAccessKey: storage.secretKey,
      },
    });
  }

  async upload(input: StorageUploadInput): Promise<StorageObject> {
    const key = sanitiseStorageKey(input.key);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        ...(input.contentLength !== undefined ? { ContentLength: input.contentLength } : {}),
        ...(input.publicRead ? { ACL: 'public-read' } : {}),
      }),
    );

    this.logger.debug(`Uploaded ${key} to ${this.bucket}`);

    return {
      key,
      sizeBytes: input.contentLength ?? 0,
      contentType: input.contentType,
      url: await this.getUrl(key),
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: sanitiseStorageKey(key) }),
    );
  }

  async getUrl(key: string, options?: StorageUrlOptions): Promise<string> {
    const safeKey = sanitiseStorageKey(key);

    // A configured public base URL means the bucket is served directly (an R2
    // custom domain, say), so no signing is needed.
    if (this.publicUrl && !this.publicUrl.includes('localhost')) {
      return `${this.publicUrl}/${safeKey}`;
    }

    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
        ...(options?.downloadFilename
          ? { ResponseContentDisposition: `attachment; filename="${options.downloadFilename}"` }
          : {}),
      }),
      { expiresIn: options?.expiresInSeconds ?? 3600 },
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: sanitiseStorageKey(key) }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
