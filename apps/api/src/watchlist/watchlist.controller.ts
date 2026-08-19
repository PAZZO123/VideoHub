import { Body, Controller, Delete, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MediaKind, type WatchlistItemDto } from '@videohub/types';
import { CurrentUser, type RequestUser } from '../common/decorators';
import { AddToWatchlistDto, WatchlistQueryDto } from './dto/watchlist.dto';
import { WatchlistService } from './watchlist.service';

@ApiTags('watchlist')
@ApiBearerAuth()
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Get()
  @ApiOperation({ summary: 'List the signed-in user’s watchlist' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: WatchlistQueryDto,
  ): Promise<WatchlistItemDto[]> {
    return this.watchlistService.findAll(userId, query.kind);
  }

  @Get('ids')
  @ApiOperation({
    summary: 'Which of the given media ids are saved',
    description:
      'Resolves toggle state for a whole grid in one request instead of one call per card.',
  })
  @ApiQuery({ name: 'ids', description: 'Comma-separated media ids.' })
  getSavedIds(@CurrentUser('id') userId: string, @Query('ids') ids = ''): Promise<string[]> {
    const mediaIds = ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 100);
    return this.watchlistService.getSavedIds(userId, mediaIds);
  }

  @Post()
  @ApiOperation({
    summary: 'Add to the watchlist',
    description: 'Idempotent — adding an item already saved returns the existing entry.',
  })
  @ApiResponse({ status: 404, description: 'Target not found, or not visible to this viewer.' })
  add(
    @CurrentUser() user: RequestUser,
    @Body() dto: AddToWatchlistDto,
  ): Promise<WatchlistItemDto> {
    return this.watchlistService.add(user.id, dto, { user });
  }

  @Delete('media/:kind/:mediaId')
  @ApiOperation({ summary: 'Remove by media id (what a card toggle uses)' })
  removeByMedia(
    @CurrentUser('id') userId: string,
    @Param('kind') kind: MediaKind,
    @Param('mediaId') mediaId: string,
  ): Promise<{ removed: true }> {
    return this.watchlistService.removeByMedia(userId, kind, mediaId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a watchlist entry by its own id' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<{ removed: true }> {
    return this.watchlistService.remove(userId, id);
  }
}

@Module({
  controllers: [WatchlistController],
  providers: [WatchlistService],
  exports: [WatchlistService],
})
export class WatchlistModule {}
