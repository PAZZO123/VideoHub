import { Test, type TestingModule } from '@nestjs/testing';
import { ModerationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogueSyncService } from './catalogue-sync.service';
import { VIDEO_CATALOGUE_PROVIDER, type ExternalVideo } from './video-catalogue.interface';

function externalVideo(overrides: Partial<ExternalVideo> = {}): ExternalVideo {
  return {
    externalId: 'BigBuckBunny_124',
    provider: 'archive.org',
    title: 'Big Buck Bunny',
    description: 'A large rabbit.',
    playbackUrl: 'https://archive.org/download/BigBuckBunny_124/bunny_512kb.mp4',
    thumbnailUrl: 'https://archive.org/services/img/BigBuckBunny_124',
    durationSeconds: 597,
    sizeBytes: 40_000_000,
    licence: 'CC BY 3.0',
    redistributable: true,
    sourcePageUrl: 'https://archive.org/details/BigBuckBunny_124',
    year: 2008,
    creator: 'Blender Foundation',
    ...overrides,
  };
}

describe('CatalogueSyncService', () => {
  let moduleRef: TestingModule;
  let service: CatalogueSyncService;
  let prisma: {
    video: { findUnique: jest.Mock; upsert: jest.Mock };
    source: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    category: { findMany: jest.Mock };
  };
  let provider: { name: string; search: jest.Mock; getById: jest.Mock };

  beforeEach(async () => {
    prisma = {
      video: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'v1' }),
      },
      source: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 's1' }),
        update: jest.fn().mockResolvedValue({ id: 's1' }),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c-movies', slug: 'movies' },
          { id: 'c-docs', slug: 'documentaries' },
          { id: 'c-learning', slug: 'learning' },
          { id: 'c-ibitente', slug: 'ibitente' },
          { id: 'c-cartoons', slug: 'cartoons' },
          { id: 'c-stories', slug: 'stories' },
        ]),
      },
    };

    provider = {
      name: 'archive.org',
      search: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(externalVideo()),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        CatalogueSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: VIDEO_CATALOGUE_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = moduleRef.get(CatalogueSyncService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('slugs', () => {
    it('is stable for the same identifier, so re-runs update instead of duplicating', () => {
      expect(CatalogueSyncService.slugFor('BigBuckBunny_124')).toBe(
        CatalogueSyncService.slugFor('BigBuckBunny_124'),
      );
    });

    it('namespaces the slug so ingested rows cannot collide with an upload', () => {
      expect(CatalogueSyncService.slugFor('my-clip')).toMatch(/^ia-/);
    });
  });

  describe('moderation', () => {
    it('publishes hand-checked curated titles', async () => {
      await service.sync({ includeDiscovery: false });

      const statuses = prisma.video.upsert.mock.calls.map(
        ([args]) => args.create.moderationStatus,
      );
      expect(statuses.every((s: ModerationStatus) => s === ModerationStatus.APPROVED)).toBe(true);
    });

    it('queues everything a query found, rather than publishing it', async () => {
      // The discovery collections are curated but not vetted item by item, and
      // one of them feeds the children's section.
      prisma.video.upsert.mockClear();
      provider.search.mockResolvedValue([externalVideo({ externalId: 'FoundByQuery' })]);

      await service.sync({ includeDiscovery: true });

      const queried = prisma.video.upsert.mock.calls
        .map(([args]) => args)
        .filter((args) => args.where.slug === 'ia-foundbyquery');

      expect(queried.length).toBeGreaterThan(0);
      expect(
        queried.every((args) => args.create.moderationStatus === ModerationStatus.PENDING),
      ).toBe(true);
    });

    it('never overwrites a decision a moderator already made', async () => {
      // Re-running the sync must not resurrect something a human rejected.
      prisma.video.findUnique.mockResolvedValue({
        id: 'v1',
        moderationStatus: ModerationStatus.REJECTED,
      });

      await service.sync({ includeDiscovery: false });

      for (const [args] of prisma.video.upsert.mock.calls) {
        expect(args.update).not.toHaveProperty('moderationStatus');
      }
    });
  });

  describe('rights', () => {
    it('marks a permissively licensed item as downloadable', async () => {
      await service.sync({ includeDiscovery: false });

      const [args] = prisma.video.upsert.mock.calls[0];
      expect(args.update.downloadAllowed).toBe(true);
      expect(args.update.rightsConfirmed).toBe(true);
    });

    it('keeps downloads closed when the licence does not permit redistribution', async () => {
      provider.getById.mockResolvedValue(externalVideo({ redistributable: false, licence: null }));

      await service.sync({ includeDiscovery: false });

      const [args] = prisma.video.upsert.mock.calls[0];
      expect(args.update.downloadAllowed).toBe(false);
      expect(args.update.rightsConfirmed).toBe(false);
    });
  });

  describe('resilience', () => {
    it('skips a curated title that vanished upstream instead of failing the run', async () => {
      provider.getById.mockResolvedValue(null);

      const report = await service.sync({ includeDiscovery: false });

      expect(report.created).toBe(0);
      expect(report.skipped).toBeGreaterThan(0);
    });

    it('does nothing at all when the provider is `none`', async () => {
      provider.name = 'none';

      const report = await service.sync();

      expect(report.created).toBe(0);
      expect(prisma.video.upsert).not.toHaveBeenCalled();
    });

    it('records the source page so provenance can be checked', async () => {
      await service.sync({ includeDiscovery: false });

      expect(prisma.source.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            platform: 'archive.org',
            url: 'https://archive.org/details/BigBuckBunny_124',
          }),
        }),
      );
    });
  });
});
