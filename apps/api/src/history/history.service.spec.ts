import { Test, type TestingModule } from '@nestjs/testing';
import { MaturityRating } from '@prisma/client';
import { ErrorCode, MediaKind } from '@videohub/types';
import type { RequestUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { HistoryService } from './history.service';

const user = (overrides: Partial<RequestUser> = {}): RequestUser => ({
  id: 'u1',
  email: 'a@b.com',
  role: 'USER',
  plan: 'FREE',
  ageVerified: false,
  kidsMode: false,
  ...overrides,
});

function historyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    userId: 'u1',
    kind: 'MOVIE',
    movieId: 'm1',
    videoId: null,
    progressSeconds: 600,
    durationSeconds: 6000,
    completed: false,
    startedAt: new Date(),
    lastWatchedAt: new Date(),
    movie: null,
    video: null,
    ...overrides,
  };
}

describe('HistoryService', () => {
  let moduleRef: TestingModule;
  let service: HistoryService;
  let prisma: {
    watchHistory: {
      findMany: jest.Mock;
      count: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    movie: { findFirst: jest.Mock };
    video: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      watchHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn().mockImplementation(({ update, create }) =>
          Promise.resolve(historyRow({ ...create, ...update })),
        ),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      movie: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ maturityRating: MaturityRating.TEEN, runtimeMinutes: 100 }),
      },
      video: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ maturityRating: MaturityRating.GENERAL, durationSeconds: 300 }),
      },
      // Throws on purpose. Read paths must use Promise.all, not $transaction:
      // a transaction pins a pooled connection and Neon's pooler runs out under
      // concurrency. Mocking it as Promise.all is what hid this bug originally.
      $transaction: jest.fn(() => {
        throw new Error('$transaction must not be used for read-only queries');
      }),
    };

    moduleRef = await Test.createTestingModule({
      providers: [HistoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(HistoryService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('recordProgress', () => {
    it('upserts through the movie compound key', async () => {
      await service.recordProgress(
        'u1',
        { kind: MediaKind.MOVIE, movieId: 'm1', progressSeconds: 60 },
        { user: user() },
      );

      expect(prisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_movieId: { userId: 'u1', movieId: 'm1' } },
        }),
      );
    });

    it('upserts through the video compound key', async () => {
      await service.recordProgress(
        'u1',
        { kind: MediaKind.VIDEO, videoId: 'v1', progressSeconds: 30 },
        { user: user() },
      );

      expect(prisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_videoId: { userId: 'u1', videoId: 'v1' } },
        }),
      );
    });

    it('falls back to the catalogue runtime when no duration is sent', async () => {
      await service.recordProgress(
        'u1',
        { kind: MediaKind.MOVIE, movieId: 'm1', progressSeconds: 60 },
        { user: user() },
      );

      // 100 minutes of runtime becomes 6000 seconds.
      expect(prisma.watchHistory.upsert.mock.calls[0][0].update.durationSeconds).toBe(6000);
    });

    it('prefers a client-reported duration over the catalogue value', async () => {
      await service.recordProgress(
        'u1',
        { kind: MediaKind.MOVIE, movieId: 'm1', progressSeconds: 60, durationSeconds: 7200 },
        { user: user() },
      );

      expect(prisma.watchHistory.upsert.mock.calls[0][0].update.durationSeconds).toBe(7200);
    });

    it('marks a title complete past the threshold', async () => {
      await service.recordProgress(
        'u1',
        { kind: MediaKind.MOVIE, movieId: 'm1', progressSeconds: 5900, durationSeconds: 6000 },
        { user: user() },
      );

      expect(prisma.watchHistory.upsert.mock.calls[0][0].update.completed).toBe(true);
    });

    it('leaves a title incomplete below the threshold', async () => {
      await service.recordProgress(
        'u1',
        { kind: MediaKind.MOVIE, movieId: 'm1', progressSeconds: 3000, durationSeconds: 6000 },
        { user: user() },
      );

      expect(prisma.watchHistory.upsert.mock.calls[0][0].update.completed).toBe(false);
    });

    it('honours an explicit completed flag over the inference', async () => {
      await service.recordProgress(
        'u1',
        {
          kind: MediaKind.MOVIE,
          movieId: 'm1',
          progressSeconds: 10,
          durationSeconds: 6000,
          completed: true,
        },
        { user: user() },
      );

      expect(prisma.watchHistory.upsert.mock.calls[0][0].update.completed).toBe(true);
    });

    it('never divides by a zero duration', async () => {
      prisma.movie.findFirst.mockResolvedValue({
        maturityRating: MaturityRating.TEEN,
        runtimeMinutes: null,
      });

      await service.recordProgress(
        'u1',
        { kind: MediaKind.MOVIE, movieId: 'm1', progressSeconds: 60 },
        { user: user() },
      );

      expect(prisma.watchHistory.upsert.mock.calls[0][0].update.completed).toBe(false);
    });

    it('refuses to record progress against a title the viewer cannot see', async () => {
      prisma.movie.findFirst.mockResolvedValue({
        maturityRating: MaturityRating.ADULT,
        runtimeMinutes: 100,
      });

      await expect(
        service.recordProgress(
          'u1',
          { kind: MediaKind.MOVIE, movieId: 'm1', progressSeconds: 60 },
          { user: user({ ageVerified: false }) },
        ),
      ).rejects.toMatchObject({ code: ErrorCode.MOVIE_NOT_FOUND });

      expect(prisma.watchHistory.upsert).not.toHaveBeenCalled();
    });
  });

  describe('continue watching', () => {
    it('asks only for unfinished entries with progress', async () => {
      await service.getContinueWatching('u1', { user: user() });

      const where = prisma.watchHistory.findMany.mock.calls[0][0].where;
      expect(where.completed).toBe(false);
      expect(where.progressSeconds).toEqual({ gt: 0 });
    });

    it('re-applies visibility on read, so kids mode hides in-progress adult titles', async () => {
      await service.getContinueWatching('u1', { user: user({ kidsMode: true }) });

      const where = prisma.watchHistory.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { movie: { maturityRating: { in: [MaturityRating.KIDS] } } },
        { video: { maturityRating: { in: [MaturityRating.KIDS] } } },
      ]);
    });

    it('drops entries barely started', async () => {
      prisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ id: 'barely', progressSeconds: 5, durationSeconds: 6000 }),
        historyRow({ id: 'halfway', progressSeconds: 3000, durationSeconds: 6000 }),
      ]);

      const items = await service.getContinueWatching('u1', { user: user() });

      expect(items.map((item) => item.id)).toEqual(['halfway']);
    });

    it('reports a zero ratio rather than NaN when the duration is unknown', async () => {
      prisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ progressSeconds: 100, durationSeconds: null }),
      ]);

      const items = await service.getContinueWatching('u1', { user: user() });
      // Filtered out by the minimum-ratio rule, but the ratio itself must be a
      // real number, never NaN.
      expect(items).toHaveLength(0);
    });
  });

  describe('deletion', () => {
    it('scopes a single delete to the owner', async () => {
      await service.removeOne('u1', 'h1');
      expect(prisma.watchHistory.deleteMany).toHaveBeenCalledWith({
        where: { id: 'h1', userId: 'u1' },
      });
    });

    it('404s when the entry does not belong to the user', async () => {
      prisma.watchHistory.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.removeOne('u1', 'someone-elses')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('clears only the calling user’s history', async () => {
      prisma.watchHistory.deleteMany.mockResolvedValue({ count: 7 });
      const result = await service.clear('u1');

      expect(prisma.watchHistory.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(result.removed).toBe(7);
    });
  });
});
