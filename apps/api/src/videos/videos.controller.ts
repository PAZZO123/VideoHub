import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ALLOWED_HOSTS } from '@videohub/config';
import { ErrorCode, type Paginated, type VideoDetail, type VideoSummary } from '@videohub/types';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { CurrentUser, OptionalAuth, RawResponse, type RequestUser } from '../common/decorators';
import { AppException } from '../common/exceptions/app.exception';
import { QueryVideosDto } from './dto/query-videos.dto';
import { VideosService } from './videos.service';

/** The same allowlist the downloader uses — we never proxy arbitrary hosts. */
function isAllowedHost(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return ALLOWED_HOSTS.some((rule) => hostname === rule.host || hostname.endsWith(`.${rule.host}`));
  } catch {
    return false;
  }
}

/** Filename offered to the browser. Never derived from an untrusted path. */
function downloadFilename(title: string): string {
  const safe = title.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100);
  return `${safe || 'video'}.mp4`;
}

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @OptionalAuth()
  @Get()
  @ApiOperation({
    summary: 'List videos',
    description: 'Only approved uploads are returned. Respects Kids Mode and age verification.',
  })
  findAll(
    @Query() query: QueryVideosDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<Paginated<VideoSummary>> {
    return this.videosService.findAll(query, { user });
  }

  /**
   * Serves the actual file as a download.
   *
   * Routed through the API rather than linking straight at the media because a
   * cross-origin `<a download>` is ignored by browsers — the file would open in
   * a tab instead of saving. Going through here also means the rights check is
   * enforced server-side, where it cannot be skipped.
   */
  @OptionalAuth()
  @RawResponse()
  @Get(':slug/download')
  @ApiOperation({
    summary: 'Download a video file',
    description:
      'Only when the rights holder permitted it. Served from our own storage when the title is mirrored, otherwise streamed from the allowlisted source.',
  })
  @ApiParam({ name: 'slug' })
  async download(
    @Param('slug') slug: string,
    @Res() response: Response,
    @CurrentUser() user?: RequestUser,
  ): Promise<void> {
    const video = await this.videosService.findForDownload(slug, { user });
    const filename = downloadFilename(video.title);

    // Mirrored or uploaded: the bytes are ours, so hand off to the files route,
    // which already does ranges and resume properly.
    if (video.storageKey) {
      const url = await this.videosService.downloadUrlFor(video.storageKey, filename);
      response.redirect(302, url);
      return;
    }

    if (!video.playbackUrl || !isAllowedHost(video.playbackUrl)) {
      throw AppException.forbidden(
        ErrorCode.DOWNLOAD_NOT_PERMITTED,
        'This video has no downloadable source.',
      );
    }

    // Not mirrored yet, so proxy the allowlisted source. Streamed straight
    // through — a feature film must never be buffered into memory here.
    //
    // Retried because archive.org's storage nodes intermittently fail to accept
    // a connection inside Node's 10s default, and that limit is not reachable
    // through the fetch options. A second or third attempt usually lands on a
    // node that answers.
    let upstream: Awaited<ReturnType<typeof fetch>> | null = null;
    for (let attempt = 1; attempt <= 3 && !upstream?.ok; attempt += 1) {
      upstream = await fetch(video.playbackUrl, {
        headers: { 'User-Agent': 'VideoHub/0.1 (download proxy)' },
        redirect: 'follow',
      }).catch(() => null);
    }

    if (!upstream?.ok || !upstream.body) {
      // Not a rights problem — the licence permits this, the host is simply
      // unreachable. Saying "not permitted" would send the user looking for the
      // wrong fix.
      throw AppException.serviceUnavailable(
        ErrorCode.DOWNLOAD_SOURCE_UNAVAILABLE,
        'This title is not mirrored yet and its source is unreachable right now. Try again shortly, or open the original source.',
      );
    }

    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const length = upstream.headers.get('content-length');
    if (length) response.setHeader('Content-Length', length);

    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(response);
  }

  @OptionalAuth()
  @Get(':slug')
  @ApiOperation({ summary: 'Get one video by slug' })
  @ApiParam({ name: 'slug' })
  async findOne(
    @Param('slug') slug: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<VideoDetail> {
    const video = await this.videosService.findBySlug(slug, { user });
    void this.videosService.recordView(video.id);
    return video;
  }
}

/**
 * The Ibitente surface. A separate controller so `forceKids` is applied by the
 * route itself — a kid-facing endpoint cannot accidentally serve adult content
 * because a query parameter was omitted.
 */
@ApiTags('kids')
@Controller('kids')
export class KidsController {
  constructor(private readonly videosService: VideosService) {}

  @OptionalAuth()
  @Get('videos')
  @ApiOperation({
    summary: 'List Ibitente videos',
    description: 'Always restricted to KIDS-rated content in kids categories, for every viewer.',
  })
  findAll(
    @Query() query: QueryVideosDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<Paginated<VideoSummary>> {
    // Mutated rather than spread: QueryVideosDto carries `skip`/`take` as
    // prototype getters, which an object spread would silently drop.
    query.kids = true;
    return this.videosService.findAll(query, { user, forceKids: true });
  }

  @OptionalAuth()
  @Get('videos/:slug')
  @ApiOperation({ summary: 'Get one Ibitente video' })
  async findOne(
    @Param('slug') slug: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<VideoDetail> {
    const video = await this.videosService.findBySlug(slug, { user, forceKids: true });
    void this.videosService.recordView(video.id);
    return video;
  }
}
