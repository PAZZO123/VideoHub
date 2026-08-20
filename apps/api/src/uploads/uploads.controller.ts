import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Post,
  Query,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FileInterceptor, MulterModule } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UPLOAD_RULES } from '@videohub/config';
import type { Paginated, VideoSummary } from '@videohub/types';
import { diskStorage } from 'multer';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CurrentUser } from '../common/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import type { AppConfig } from '../config/configuration';
import { StorageModule } from '../storage/storage.module';
import { CreateUploadDto } from './dto/upload.dto';
import { UploadsService, type UploadedFile } from './uploads.service';

/** Where multer spools an in-flight upload before it is handed to storage. */
export const UPLOAD_SPOOL_DIR = join(tmpdir(), 'videohub-uploads');

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  // Options (spool directory and size ceiling) come from MulterModule below, so
  // the limit tracks MAX_UPLOAD_MB instead of being fixed at compile time.
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a video for review',
    description:
      'Requires an explicit rights confirmation. The video is created PENDING and stays invisible to public search until an admin approves it.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title', 'rightsConfirmed'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string', maxLength: UPLOAD_RULES.MAX_TITLE_LENGTH },
        description: { type: 'string' },
        categorySlug: { type: 'string' },
        tags: { type: 'string', description: 'Comma-separated.' },
        language: { type: 'string' },
        maturityRating: { type: 'string' },
        rightsConfirmed: { type: 'boolean' },
        downloadAllowed: { type: 'boolean' },
      },
    },
  })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateUploadDto,
    @UploadedFileParam() file: UploadedFile | undefined,
  ): Promise<VideoSummary> {
    return this.uploadsService.create(userId, dto, file);
  }

  @Get('mine')
  @ApiOperation({
    summary: 'Your uploads, including ones still awaiting review',
  })
  listMine(
    @CurrentUser('id') userId: string,
    @Query() pagination: PaginationDto,
  ): Promise<Paginated<VideoSummary>> {
    return this.uploadsService.listMine(userId, pagination);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one of your uploads and its stored file' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<{ removed: true }> {
    return this.uploadsService.remove(userId, id);
  }
}

@Module({
  imports: [
    StorageModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        // Spooled to disk, never held in memory. At the 2 GB ceiling a single
        // memoryStorage() upload would pin 2 GB of RSS for the whole request,
        // and the five-per-minute throttle permits enough concurrency to take
        // the process out with an OOM. Disk costs an fs write we then stream
        // straight into the storage backend.
        storage: diskStorage({
          destination: (_req, _file, done) => {
            void mkdir(UPLOAD_SPOOL_DIR, { recursive: true })
              .then(() => done(null, UPLOAD_SPOOL_DIR))
              .catch((error: Error) => done(error, UPLOAD_SPOOL_DIR));
          },
        }),
        // The hard stop. Multer aborts mid-stream once this is passed, so an
        // oversized file is cut off rather than written out in full and then
        // rejected. UploadsService re-checks the same ceiling for the message.
        limits: {
          fileSize: config.get('storage', { infer: true }).maxUploadMb * 1024 * 1024,
          files: 1,
        },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
