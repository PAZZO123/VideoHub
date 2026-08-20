import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ALLOWED_HOSTS } from '@videohub/config';
import { ErrorCode, type Paginated, type VideoDetail, type VideoSummary } from '@videohub/types';
import type { Request, Response } from 'express';
import { CurrentUser, OptionalAuth, RawResponse, type RequestUser } from '../common/decorators';
import type { AppConfig } from '../config/configuration';
import { AppException } from '../common/exceptions/app.exception';
import { getSlowSource } from '../common/slow-source';
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
  constructor(
    private readonly videosService: VideosService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Back to the video page, carrying why the download did not happen. */
  private videoPageUrl(slug: string, reason: string): string {
    const [origin] = this.config.get('webOrigin', { infer: true });
    return `${origin ?? ''}/videos/${encodeURIComponent(slug)}?download=${reason}`;
  }

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
    @Req() request: Request,
    @Res() response: Response,
    @CurrentUser() user?: RequestUser,
  ): Promise<void> {
    // A browser following this link must never be dumped on a page of raw JSON.
    // When the caller is a navigation rather than an API client, failures go
    // back to the video page with a flag it can explain properly.
    const isNavigation = (request.headers.accept ?? '').includes('text/html');

    let video: Awaited<ReturnType<VideosService['findForDownload']>>;
    try {
      video = await this.videosService.findForDownload(slug, { user });
    } catch (error: unknown) {
      if (!isNavigation) throw error;
      response.redirect(302, this.videoPageUrl(slug, 'not-available'));
      return;
    }

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
    // getSlowSource rather than fetch: archive.org's nodes often need far
    // longer than fetch's ~10s connect limit, which cannot be raised through
    // its options. The same URL that "fetch failed" answered curl in 29.6s.
    const upstream = await getSlowSource(video.playbackUrl, {
      userAgent: 'VideoHub/0.1 (download proxy)',
      timeoutMs: 3 * 60_000,
    }).catch(() => null);

    if (!upstream?.ok) {
      upstream?.stream.resume();

      if (isNavigation) {
        response.redirect(302, this.videoPageUrl(slug, 'source-unreachable'));
        return;
      }

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
    if (upstream.contentLength !== null) {
      response.setHeader('Content-Length', String(upstream.contentLength));
    }

    // If the client goes away mid-download, stop pulling from the origin rather
    // than finishing a transfer nobody is receiving.
    response.on('close', () => upstream.stream.destroy());
    upstream.stream.pipe(response);
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
