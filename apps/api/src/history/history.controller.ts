import { Body, Controller, Delete, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated, WatchHistoryItemDto } from '@videohub/types';
import { CurrentUser, type RequestUser } from '../common/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RecordProgressDto } from './dto/history.dto';
import { HistoryService } from './history.service';

@ApiTags('history')
@ApiBearerAuth()
@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @ApiOperation({ summary: 'Watch history, most recent first' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<Paginated<WatchHistoryItemDto>> {
    return this.historyService.findAll(userId, pagination);
  }

  @Get('continue-watching')
  @ApiOperation({
    summary: 'Titles to resume',
    description:
      'Started but unfinished. Visibility is re-applied on read, so turning Kids Mode on immediately hides in-progress adult titles.',
  })
  continueWatching(@CurrentUser() user: RequestUser): Promise<WatchHistoryItemDto[]> {
    return this.historyService.getContinueWatching(user.id, { user });
  }

  @Post()
  @ApiOperation({
    summary: 'Record playback progress',
    description: 'Upserts one row per user and title. Safe to call repeatedly from the player.',
  })
  recordProgress(
    @CurrentUser() user: RequestUser,
    @Body() dto: RecordProgressDto,
  ): Promise<WatchHistoryItemDto> {
    return this.historyService.recordProgress(user.id, dto, { user });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove one history entry' })
  removeOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<{ removed: true }> {
    return this.historyService.removeOne(userId, id);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear the entire watch history' })
  clear(@CurrentUser('id') userId: string): Promise<{ removed: number }> {
    return this.historyService.clear(userId);
  }
}

@Module({
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
