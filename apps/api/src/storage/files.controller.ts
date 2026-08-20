import { Controller, Get, Module, NotFoundException, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { Public, RawResponse } from '../common/decorators';
import type { AppConfig } from '../config/configuration';
import { sanitiseStorageKey } from './storage.interface';

/**
 * Serves files held by the local storage backend.
 *
 * `LocalStorageService` hands out URLs under `STORAGE_PUBLIC_URL`
 * (`/api/files/...` by default) but nothing was serving that route, so every
 * locally stored upload and mirrored title resolved to a 404. This is that
 * route.
 *
 * Development only, in step with the backend it serves: `STORAGE_PROVIDER=local`
 * is already refused when `NODE_ENV=production`, where a real bucket and CDN
 * serve these bytes instead.
 *
 * `res.sendFile` is used rather than a hand-rolled stream because Express
 * already implements conditional and **range** requests correctly — and without
 * range support a browser cannot seek within a video.
 */
@ApiExcludeController()
@Controller('files')
export class FilesController {
  private readonly root: string;
  private readonly enabled: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    const storage = config.get('storage', { infer: true });
    this.root = resolve(process.cwd(), storage.localDir);
    this.enabled = storage.provider === 'local';
  }

  // Express 4 splat syntax — the matched path arrives as req.params[0].
  @Public()
  @RawResponse()
  @Get('*')
  async serve(
    @Req() req: Request,
    @Query('filename') filename: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.enabled) {
      // A non-local backend serves its own bytes; this route must not become a
      // second, unauthenticated way to reach them.
      throw new NotFoundException('Not found.');
    }

    const key = sanitiseStorageKey(String(req.params[0] ?? ''));
    const absolute = this.pathFor(key);

    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) {
      throw new NotFoundException('Not found.');
    }

    if (filename) {
      // Only ever an attachment name — never a path.
      const safe = filename.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
      res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    }

    // Immutable: keys are content-addressed by slug, and a changed file gets a
    // new key rather than new bytes under the old one.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Helmet sets Cross-Origin-Resource-Policy: same-origin for the whole app,
    // which is right for the JSON API but stops a browser loading this media
    // from the web app's origin (:5173 -> :3000 in development). Relaxed only
    // for these public, already-unauthenticated bytes — not app-wide.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    res.sendFile(absolute);
  }

  /**
   * Resolves a key to an absolute path, refusing anything that escapes the
   * storage root. `sanitiseStorageKey` already strips traversal; this is the
   * check that actually guarantees it.
   */
  private pathFor(key: string): string {
    const path = resolve(join(this.root, key));
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new NotFoundException('Not found.');
    }
    return path;
  }
}

@Module({ controllers: [FilesController] })
export class FilesModule {}
