import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ModerationStatus } from '@prisma/client';
import { UPLOAD_RULES } from '@videohub/config';
import { ErrorCode } from '@videohub/types';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { UploadsService, type UploadedFile } from './uploads.service';

/** Stands in for multer's spool directory. Removed after the suite. */
const spoolDir = mkdtempSync(join(tmpdir(), 'videohub-uploads-test-'));
let spoolCount = 0;

/**
 * Builds a file spooled to disk, the way multer hands one over.
 *
 * The bytes are really written, because the service now reads the header back
 * off disk rather than from an in-memory buffer.
 */
function videoFile(
  overrides: Partial<Omit<UploadedFile, 'path'>> & { bytes?: Buffer } = {},
): UploadedFile {
  const { bytes, ...rest } = overrides;

  const header = Buffer.alloc(32);
  // 'ftyp' at offset 4 — the ISO base media signature.
  header.write('ftyp', 4, 'ascii');

  spoolCount += 1;
  const path = join(spoolDir, `clip-${spoolCount}.mp4`);
  writeFileSync(path, bytes ?? header);

  return {
    originalname: 'clip.mp4',
    mimetype: 'video/mp4',
    size: 1024,
    path,
    ...rest,
  };
}

afterAll(() => {
  rmSync(spoolDir, { recursive: true, force: true });
});

describe('UploadsService', () => {
  let moduleRef: TestingModule;
  let service: UploadsService;
  let prisma: {
    video: { create: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
    category: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: { upload: jest.Mock; delete: jest.Mock; getUrl: jest.Mock; exists: jest.Mock; name: string };

  beforeEach(async () => {
    prisma = {
      video: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'v1',
            description: null,
            thumbnailUrl: null,
            durationSeconds: null,
            category: null,
            uploader: null,
            viewCount: 0,
            trendingScore: 0,
            createdAt: new Date(),
            ...data,
          }),
        ),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
      category: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', slug: 'music' }) },
      // Throws on purpose. Read paths must use Promise.all, not $transaction:
      // a transaction pins a pooled connection and Neon's pooler runs out under
      // concurrency. Mocking it as Promise.all is what hid this bug originally.
      $transaction: jest.fn(() => {
        throw new Error('$transaction must not be used for read-only queries');
      }),
    };

    storage = {
      name: 'local',
      upload: jest.fn().mockResolvedValue({
        key: 'uploads/u1/clip.mp4',
        sizeBytes: 1024,
        contentType: 'video/mp4',
        url: 'http://localhost/files/uploads/u1/clip.mp4',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      getUrl: jest.fn(),
      exists: jest.fn(),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: STORAGE_SERVICE, useValue: storage },
        {
          provide: ConfigService,
          useValue: { get: () => ({ maxUploadMb: UPLOAD_RULES.MAX_UPLOAD_MB }) },
        },
      ],
    }).compile();

    service = moduleRef.get(UploadsService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const dto = { title: 'My Clip', rightsConfirmed: true };

  describe('moderation state', () => {
    it('creates uploads as PENDING, never publicly visible on arrival', async () => {
      await service.create('u1', dto, videoFile());

      expect(prisma.video.create.mock.calls[0][0].data.moderationStatus).toBe(
        ModerationStatus.PENDING,
      );
    });

    it('records the rights confirmation', async () => {
      await service.create('u1', dto, videoFile());
      expect(prisma.video.create.mock.calls[0][0].data.rightsConfirmed).toBe(true);
    });

    it('does not grant download permission without a rights claim', async () => {
      // The DTO forbids this combination, but the service must not depend on
      // validation having run.
      await service.create(
        'u1',
        { title: 'X', rightsConfirmed: false, downloadAllowed: true },
        videoFile(),
      );

      expect(prisma.video.create.mock.calls[0][0].data.downloadAllowed).toBe(false);
    });

    it('grants download permission only when both flags agree', async () => {
      await service.create(
        'u1',
        { title: 'X', rightsConfirmed: true, downloadAllowed: true },
        videoFile(),
      );

      expect(prisma.video.create.mock.calls[0][0].data.downloadAllowed).toBe(true);
    });
  });

  describe('file validation', () => {
    it('rejects a missing file', async () => {
      await expect(service.create('u1', dto, undefined)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
      });
    });

    it('rejects an empty file', async () => {
      await expect(
        service.create('u1', dto, videoFile({ size: 0 })),
      ).rejects.toMatchObject({ code: ErrorCode.UPLOAD_REJECTED });
    });

    it('rejects a file over the size limit', async () => {
      // Derived from the configured ceiling so raising the limit cannot leave
      // this test asserting against a number that is now comfortably legal.
      const overLimit = (UPLOAD_RULES.MAX_UPLOAD_MB + 1) * 1024 * 1024;

      await expect(
        service.create('u1', dto, videoFile({ size: overLimit })),
      ).rejects.toMatchObject({ code: ErrorCode.UPLOAD_REJECTED });
    });

    it('rejects a disallowed MIME type', async () => {
      await expect(
        service.create('u1', dto, videoFile({ mimetype: 'application/x-msdownload' })),
      ).rejects.toMatchObject({ code: ErrorCode.UPLOAD_REJECTED });
    });

    it('rejects a file whose bytes contradict its declared type', async () => {
      // An executable renamed to .mp4 and sent with a video Content-Type. The
      // declared type comes from the browser and is trivially forged.
      const disguised = videoFile({ bytes: Buffer.from('MZ\x90\x00 not a video at all') });

      await expect(service.create('u1', dto, disguised)).rejects.toMatchObject({
        code: ErrorCode.UPLOAD_REJECTED,
      });
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('accepts a WebM whose header matches', async () => {
      const webm = videoFile({
        mimetype: 'video/webm',
        bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]),
      });

      await expect(service.create('u1', dto, webm)).resolves.toBeDefined();
    });

    it('deletes the spooled file after a successful upload', async () => {
      // A 2 GB spool left behind on every upload fills the disk within a day.
      const file = videoFile();
      await service.create('u1', dto, file);

      expect(existsSync(file.path)).toBe(false);
    });

    it('deletes the spooled file even when the upload is rejected', async () => {
      const file = videoFile({ mimetype: 'text/plain' });
      await service.create('u1', dto, file).catch(() => undefined);

      expect(existsSync(file.path)).toBe(false);
    });

    it('does not store a file it rejected', async () => {
      await service
        .create('u1', dto, videoFile({ mimetype: 'text/plain' }))
        .catch(() => undefined);

      expect(storage.upload).not.toHaveBeenCalled();
      expect(prisma.video.create).not.toHaveBeenCalled();
    });
  });

  describe('categories', () => {
    it('rejects an unknown category slug', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.create('u1', { ...dto, categorySlug: 'nope' }, videoFile()),
      ).rejects.toMatchObject({ code: ErrorCode.CATEGORY_NOT_FOUND });
    });
  });

  describe('deletion', () => {
    it('refuses to delete someone else’s upload', async () => {
      prisma.video.findFirst.mockResolvedValue(null);

      await expect(service.remove('u1', 'someone-elses')).rejects.toMatchObject({
        code: ErrorCode.VIDEO_NOT_FOUND,
      });
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('removes the stored file alongside the record', async () => {
      prisma.video.findFirst.mockResolvedValue({ id: 'v1', storageKey: 'uploads/u1/clip.mp4' });

      await service.remove('u1', 'v1');

      expect(storage.delete).toHaveBeenCalledWith('uploads/u1/clip.mp4');
      expect(prisma.video.delete).toHaveBeenCalled();
    });

    it('still deletes the record when storage removal fails', async () => {
      prisma.video.findFirst.mockResolvedValue({ id: 'v1', storageKey: 'uploads/u1/clip.mp4' });
      storage.delete.mockRejectedValue(new Error('bucket unreachable'));

      await expect(service.remove('u1', 'v1')).resolves.toEqual({ removed: true });
      expect(prisma.video.delete).toHaveBeenCalled();
    });
  });
});
