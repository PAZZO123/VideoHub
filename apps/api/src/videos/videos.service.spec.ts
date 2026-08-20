import { Test, type TestingModule } from '@nestjs/testing';
import { MaturityRating, ModerationStatus } from '@prisma/client';
import { ErrorCode } from '@videohub/types';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { VideosService } from './videos.service';

/**
 * Focused on `findForDownload`, which is the gate on handing out actual bytes.
 * Everything it refuses, it must refuse the same way the detail page does.
 */
describe('VideosService.findForDownload', () => {
  let moduleRef: TestingModule;
  let service: VideosService;
  let prisma: { video: { findFirst: jest.Mock } };
  let storage: { getUrl: jest.Mock };

  const video = (overrides: Record<string, unknown> = {}) => ({
    id: 'v1',
    slug: 'ia-duckandc1951',
    title: 'Duck and Cover',
    maturityRating: MaturityRating.GENERAL,
    moderationStatus: ModerationStatus.APPROVED,
    storageKey: 'catalogue/ia-duckandc1951.mp4',
    playbackUrl: 'https://archive.org/download/DuckandC1951/DuckandC1951_512kb.mp4',
    downloadAllowed: true,
    rightsConfirmed: true,
    category: { isKids: false },
    sources: [{ url: 'https://archive.org/details/DuckandC1951' }],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = { video: { findFirst: jest.fn().mockResolvedValue(video()) } };
    storage = { getUrl: jest.fn().mockResolvedValue('http://localhost:3000/api/files/x.mp4') };

    moduleRef = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: PrismaService, useValue: prisma },
        { provide: STORAGE_SERVICE, useValue: storage },
      ],
    }).compile();

    service = moduleRef.get(VideosService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('returns the file details when the rights permit it', async () => {
    const result = await service.findForDownload('ia-duckandc1951', {});

    expect(result.storageKey).toBe('catalogue/ia-duckandc1951.mp4');
    expect(result.title).toBe('Duck and Cover');
  });

  it('refuses when the rights holder did not permit downloads', async () => {
    prisma.video.findFirst.mockResolvedValue(video({ downloadAllowed: false }));

    await expect(service.findForDownload('x', {})).rejects.toMatchObject({
      code: ErrorCode.DOWNLOAD_NOT_PERMITTED,
    });
  });

  it('refuses when downloadAllowed is set but the rights claim is not', async () => {
    // Both flags must agree, exactly as the detail page computes it — otherwise
    // this route would hand out bytes the UI refuses to offer.
    prisma.video.findFirst.mockResolvedValue(video({ rightsConfirmed: false }));

    await expect(service.findForDownload('x', {})).rejects.toMatchObject({
      code: ErrorCode.DOWNLOAD_NOT_PERMITTED,
    });
  });

  it('404s an ADULT title for a guest rather than admitting it exists', async () => {
    prisma.video.findFirst.mockResolvedValue(video({ maturityRating: MaturityRating.ADULT }));

    await expect(service.findForDownload('x', {})).rejects.toMatchObject({
      code: ErrorCode.VIDEO_NOT_FOUND,
    });
  });

  it('404s a non-kids title in Kids Mode even when downloads are permitted', async () => {
    prisma.video.findFirst.mockResolvedValue(video({ category: { isKids: false } }));

    await expect(
      service.findForDownload('x', {
        user: { id: 'u1', kidsMode: true } as never,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VIDEO_NOT_FOUND });
  });

  it('only ever looks at approved videos', async () => {
    await service.findForDownload('x', {});

    expect(prisma.video.findFirst.mock.calls[0][0].where.moderationStatus).toBe(
      ModerationStatus.APPROVED,
    );
  });

  it('404s a video that does not exist', async () => {
    prisma.video.findFirst.mockResolvedValue(null);

    await expect(service.findForDownload('nope', {})).rejects.toMatchObject({
      code: ErrorCode.VIDEO_NOT_FOUND,
    });
  });

  it('asks storage for a URL that saves rather than plays', async () => {
    await service.downloadUrlFor('catalogue/x.mp4', 'Duck and Cover.mp4');

    expect(storage.getUrl).toHaveBeenCalledWith('catalogue/x.mp4', {
      downloadFilename: 'Duck and Cover.mp4',
    });
  });
});
