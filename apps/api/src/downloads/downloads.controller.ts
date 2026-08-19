import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { DownloadAnalysis, DownloadDto, Paginated } from '@videohub/types';
import { CurrentUser, Public } from '../common/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { StorageModule } from '../storage/storage.module';
import { DownloadPolicyService } from './download-policy.service';
import { AnalyzeUrlDto, CreateDownloadDto } from './dto/downloads.dto';
import { DownloadsService } from './downloads.service';

@ApiTags('downloads')
@Controller('downloads')
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  @Public()
  @Get('sources')
  @ApiOperation({
    summary: 'Sources VideoHub is authorized to download from',
    description:
      'The allowlist this deployment is running with. Anything not listed is refused with an explanation.',
  })
  supportedSources(): { host: string; label: string; basis: string }[] {
    return this.downloadsService.supportedSources();
  }

  @Public()
  // Each analyze makes an outbound request, so it is rate limited well below the
  // global ceiling — otherwise this endpoint becomes a traffic amplifier.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analyze a URL without downloading it',
    description:
      'Returns whether the source permits downloading through VideoHub. A refusal is a 200 with permitted=false, a reason, and the original URL to open instead — not an error.',
  })
  analyze(@Body() dto: AnalyzeUrlDto): Promise<DownloadAnalysis> {
    return this.downloadsService.analyze(dto);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @ApiOperation({
    summary: 'Start a download',
    description:
      'Refusals are recorded with status BLOCKED rather than raised, so the reason stays visible in the download list.',
  })
  @ApiResponse({ status: 201, description: 'Download queued, or recorded as blocked.' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDownloadDto,
  ): Promise<DownloadDto> {
    return this.downloadsService.create(userId, dto);
  }

  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List your downloads' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<Paginated<DownloadDto>> {
    return this.downloadsService.findAll(userId, pagination);
  }

  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get one download (poll this for progress)' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<DownloadDto> {
    return this.downloadsService.findOne(userId, id);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a download and its stored file' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<{ removed: true }> {
    return this.downloadsService.remove(userId, id);
  }
}

@Module({
  imports: [StorageModule],
  controllers: [DownloadsController],
  providers: [DownloadsService, DownloadPolicyService],
  exports: [DownloadsService, DownloadPolicyService],
})
export class DownloadsModule {}
