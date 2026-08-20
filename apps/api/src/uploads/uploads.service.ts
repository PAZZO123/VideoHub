import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MaturityRating, ModerationStatus } from '@prisma/client';
import { UPLOAD_RULES } from '@videohub/config';
import { ErrorCode, type Paginated, type VideoSummary } from '@videohub/types';
import { createReadStream } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import slugify from 'slugify';
import { paginate, type PaginationDto } from '../common/dto/pagination.dto';
import { AppException } from '../common/exceptions/app.exception';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.interface';
import { VIDEO_SUMMARY_INCLUDE, toVideoSummary } from '../videos/videos.mapper';
import type { CreateUploadDto } from './dto/upload.dto';

/** Magic bytes for the container formats we accept, checked against the header. */
const FILE_SIGNATURES: { mime: string; offset: number; bytes: number[] }[] = [
  // ISO base media (mp4, mov): 'ftyp' at byte 4.
  { mime: 'video/mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { mime: 'video/quicktime', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  // EBML header shared by WebM and Matroska.
  { mime: 'video/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: 'video/x-matroska', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  // Ogg.
  { mime: 'video/ogg', offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] },
];

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly maxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {
    this.maxBytes = config.get('storage', { infer: true }).maxUploadMb * 1024 * 1024;
  }

  /**
   * Accepts an upload and files it for review.
   *
   * Nothing here becomes publicly visible: the video is created PENDING and
   * stays out of every public query until an admin approves it.
   */
  async create(
    userId: string,
    dto: CreateUploadDto,
    file: UploadedFile | undefined,
  ): Promise<VideoSummary> {
    if (!file) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, 'Attach a video file.');
    }

    // Everything past this point runs against a file spooled on disk, so the
    // spool has to be removed on every exit — including a rejection.
    try {
      return await this.store(userId, dto, file);
    } finally {
      await this.discardSpool(file.path);
    }
  }

  private async store(
    userId: string,
    dto: CreateUploadDto,
    file: UploadedFile,
  ): Promise<VideoSummary> {
    await this.assertAcceptable(file);

    const category = dto.categorySlug
      ? await this.prisma.category.findUnique({ where: { slug: dto.categorySlug } })
      : null;

    if (dto.categorySlug && !category) {
      throw AppException.badRequest(
        ErrorCode.CATEGORY_NOT_FOUND,
        'That category could not be found.',
      );
    }

    const slug = await this.uniqueSlug(dto.title);

    const stored = await this.storage.upload({
      // Streamed from the spool file rather than read into a Buffer first: a
      // 2 GB upload must never be materialised in memory.
      key: `uploads/${userId}/${slug}${this.extensionFor(file)}`,
      body: createReadStream(file.path),
      contentType: file.mimetype,
      contentLength: file.size,
    });

    const video = await this.prisma.video.create({
      data: {
        slug,
        title: dto.title,
        description: dto.description ?? null,
        language: dto.language ?? null,
        tags: dto.tags ?? [],
        maturityRating: (dto.maturityRating as MaturityRating) ?? MaturityRating.GENERAL,
        categoryId: category?.id ?? null,
        uploaderId: userId,
        storageKey: stored.key,
        playbackUrl: stored.url,
        // Held for review — never publicly searchable on arrival.
        moderationStatus: ModerationStatus.PENDING,
        rightsConfirmed: dto.rightsConfirmed,
        // Only meaningful once both the claim and the review agree.
        downloadAllowed: dto.downloadAllowed === true && dto.rightsConfirmed,
      },
      include: VIDEO_SUMMARY_INCLUDE,
    });

    this.logger.log(`Upload received from ${userId}: ${slug} (pending review)`);
    return toVideoSummary(video);
  }

  /** The uploader's own videos, including ones not yet approved. */
  async listMine(userId: string, pagination: PaginationDto): Promise<Paginated<VideoSummary>> {
    const where = { uploaderId: userId };

    const [items, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        include: VIDEO_SUMMARY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.video.count({ where }),
    ]);

    return paginate(items.map(toVideoSummary), pagination.page, pagination.take, total);
  }

  async remove(userId: string, videoId: string): Promise<{ removed: true }> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, uploaderId: userId },
    });

    if (!video) {
      throw AppException.notFound(ErrorCode.VIDEO_NOT_FOUND, 'That video could not be found.');
    }

    if (video.storageKey) {
      await this.storage.delete(video.storageKey).catch((error: unknown) => {
        this.logger.warn(
          `Could not delete ${video.storageKey}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });
    }

    await this.prisma.video.delete({ where: { id: videoId } });
    return { removed: true };
  }

  /**
   * Validates the file itself, not just what the client claimed.
   *
   * The declared MIME type comes from the browser and is trivially forged, so
   * the header bytes are checked too — a renamed executable must not be accepted
   * because its `Content-Type` said `video/mp4`.
   */
  /**
   * Reads just the leading bytes needed for the signature check.
   *
   * Opening a handle and reading 16 bytes keeps the check O(1) regardless of
   * file size — reading the whole spool back in would defeat the point of
   * spooling it.
   */
  private async readHeader(path: string): Promise<Buffer> {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(16);
      const { bytesRead } = await handle.read(buffer, 0, 16, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  /**
   * Removes the spool file. Failing to unlink is worth a log line but must not
   * turn a successful upload into an error, nor mask the rejection that caused
   * us to get here.
   */
  private async discardSpool(path: string): Promise<void> {
    try {
      await rm(path, { force: true });
    } catch (error: unknown) {
      this.logger.warn(
        `Could not remove the upload spool at ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async assertAcceptable(file: UploadedFile): Promise<void> {
    if (file.size > this.maxBytes) {
      throw AppException.badRequest(
        ErrorCode.UPLOAD_REJECTED,
        `That file is larger than the ${Math.round(this.maxBytes / 1024 / 1024)} MB limit.`,
      );
    }

    if (file.size === 0) {
      throw AppException.badRequest(ErrorCode.UPLOAD_REJECTED, 'That file is empty.');
    }

    const allowed: readonly string[] = UPLOAD_RULES.ALLOWED_VIDEO_MIME;
    if (!allowed.includes(file.mimetype)) {
      throw AppException.badRequest(
        ErrorCode.UPLOAD_REJECTED,
        'That file type is not supported. Upload an MP4, WebM, OGG, MOV or MKV file.',
      );
    }

    const header = await this.readHeader(file.path);
    const matches = FILE_SIGNATURES.some(
      (signature) =>
        signature.mime === file.mimetype &&
        signature.bytes.every((byte, index) => header[signature.offset + index] === byte),
    );

    if (!matches) {
      throw AppException.badRequest(
        ErrorCode.UPLOAD_REJECTED,
        'That file does not look like the video format it claims to be.',
      );
    }
  }

  private extensionFor(file: UploadedFile): string {
    const byMime: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/ogg': '.ogv',
      'video/quicktime': '.mov',
      'video/x-matroska': '.mkv',
    };
    return byMime[file.mimetype] ?? '';
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title, { lower: true, strict: true }) || 'video';
    let candidate = base;
    let suffix = 2;

    for (;;) {
      const clash = await this.prisma.video.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
  }
}

/** The subset of Express.Multer.File this service uses. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  /** Absolute path to multer's spool file. Deleted once the upload is filed. */
  path: string;
}
