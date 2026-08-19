import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Paginated, VideoDetail, VideoSummary } from '@videohub/types';
import { CurrentUser, OptionalAuth, type RequestUser } from '../common/decorators';
import { QueryVideosDto } from './dto/query-videos.dto';
import { VideosService } from './videos.service';

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
