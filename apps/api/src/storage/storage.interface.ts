import type { Readable } from 'node:stream';

/**
 * Object storage behind one interface, so the rest of the app never learns which
 * backend is in use. Swapping local disk for R2, S3 or Supabase is a config
 * change, not a code change.
 */
export interface StorageService {
  /** Stable identifier, surfaced in health output. */
  readonly name: string;

  upload(input: StorageUploadInput): Promise<StorageObject>;

  delete(key: string): Promise<void>;

  /**
   * A URL a browser can fetch. For private backends this is a time-limited
   * signed URL; for public ones, the permanent public URL.
   */
  getUrl(key: string, options?: StorageUrlOptions): Promise<string>;

  exists(key: string): Promise<boolean>;
}

export interface StorageUploadInput {
  /** Path within the bucket, e.g. `downloads/<userId>/<id>.mp4`. */
  key: string;
  body: Buffer | Readable;
  contentType: string;
  /** Known upfront where possible; some backends require it for streams. */
  contentLength?: number;
  /** Whether the object should be readable without a signed URL. */
  publicRead?: boolean;
}

export interface StorageObject {
  key: string;
  sizeBytes: number;
  contentType: string;
  url: string;
}

export interface StorageUrlOptions {
  /** Signed-URL lifetime in seconds. Ignored by public backends. */
  expiresInSeconds?: number;
  /** Filename offered to the browser via Content-Disposition. */
  downloadFilename?: string;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

/** Strips anything that could escape the intended prefix when building a key. */
export function sanitiseStorageKey(key: string): string {
  return key
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) =>
      segment
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        // `..` would traverse upwards on a filesystem backend.
        .replace(/^\.+$/, '_'),
    )
    .filter(Boolean)
    .join('/');
}
