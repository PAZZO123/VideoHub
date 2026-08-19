import { Test, type TestingModule } from '@nestjs/testing';
import { MaturityRating } from '@prisma/client';
import { ErrorCode, MediaKind } from '@videohub/types';
import type { RequestUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { WatchlistService } from './watchlist.service';

const user = (overrides: Partial<RequestUser> = {}): RequestUser => ({
  id: 'u1',
  email: 'a@b.com',
  role: 'USER',
  plan: 'FREE',
  ageVerified: false,
  kidsMode: false,
  ...overrides,
});

const ITEM = {
  id: 'w1',
  userId: 'u1',
  kind: 'MOVIE',
  movieId: 'm1',
  videoId: null,
  createdAt: new Date(),
  movie: null,
  video: null,
};

describe('WatchlistService', () => {
  let moduleRef: TestingModule;
  let service: WatchlistService;
  let prisma: {
    watchlistItem: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    movie: { findFirst: jest.Mock; update: jest.Mock };
    video: { findFirst: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      watchlistItem: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(ITEM),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      movie: {
        findFirst: jest.fn().mockResolvedValue({ maturityRating: MaturityRating.TEEN }),
        update: jest.fn().mockResolvedValue({}),
      },
      video: {
        findFirst: jest.fn().mockResolvedValue({ maturityRating: MaturityRating.GENERAL }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    moduleRef = await Test.createTestingModule({
      providers: [WatchlistService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(WatchlistService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('add', () => {
    it('saves a visible movie and counts the add for trending', async () => {
      await service.add('u1', { kind: MediaKind.MOVIE, movieId: 'm1' }, { user: user() });

      expect(prisma.watchlistItem.create).toHaveBeenCalled();
      expect(prisma.movie.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { watchlistAdds: { increment: 1 } },
      });
    });

    it('is idempotent — a second add returns the existing entry', async () => {
      prisma.watchlistItem.findFirst.mockResolvedValue(ITEM);

      const result = await service.add(
        'u1',
        { kind: MediaKind.MOVIE, movieId: 'm1' },
        { user: user() },
      );

      expect(result.id).toBe('w1');
      expect(prisma.watchlistItem.create).not.toHaveBeenCalled();
      // The trending counter must not move on a duplicate add.
      expect(prisma.movie.update).not.toHaveBeenCalled();
    });

    it('refuses to save a title the viewer cannot see', async () => {
      prisma.movie.findFirst.mockResolvedValue({ maturityRating: MaturityRating.ADULT });

      await expect(
        service.add('u1', { kind: MediaKind.MOVIE, movieId: 'm1' }, { user: user() }),
      ).rejects.toMatchObject({ code: ErrorCode.MOVIE_NOT_FOUND });

      expect(prisma.watchlistItem.create).not.toHaveBeenCalled();
    });

    it('refuses a movie that does not exist', async () => {
      prisma.movie.findFirst.mockResolvedValue(null);

      await expect(
        service.add('u1', { kind: MediaKind.MOVIE, movieId: 'nope' }, { user: user() }),
      ).rejects.toMatchObject({ code: ErrorCode.MOVIE_NOT_FOUND });
    });

    it('writes the video id and leaves movieId null for a VIDEO entry', async () => {
      await service.add('u1', { kind: MediaKind.VIDEO, videoId: 'v1' }, { user: user() });

      const data = prisma.watchlistItem.create.mock.calls[0][0].data;
      expect(data.videoId).toBe('v1');
      expect(data.movieId).toBeNull();
    });
  });

  describe('remove', () => {
    it('scopes removal to the owner', async () => {
      await service.remove('u1', 'w1');
      expect(prisma.watchlistItem.deleteMany).toHaveBeenCalledWith({
        where: { id: 'w1', userId: 'u1' },
      });
    });

    it('404s when the entry is not the caller’s', async () => {
      prisma.watchlistItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove('u1', 'someone-elses')).rejects.toMatchObject({
        code: ErrorCode.WATCHLIST_ITEM_NOT_FOUND,
      });
    });

    it('removes by media id for the card toggle', async () => {
      await service.removeByMedia('u1', MediaKind.MOVIE, 'm1');
      expect(prisma.watchlistItem.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', movieId: 'm1' },
      });
    });
  });

  describe('getSavedIds', () => {
    it('short-circuits on an empty request without querying', async () => {
      const ids = await service.getSavedIds('u1', []);
      expect(ids).toEqual([]);
      expect(prisma.watchlistItem.findMany).not.toHaveBeenCalled();
    });

    it('flattens movie and video ids into one list', async () => {
      prisma.watchlistItem.findMany.mockResolvedValue([
        { movieId: 'm1', videoId: null },
        { movieId: null, videoId: 'v1' },
      ]);

      expect(await service.getSavedIds('u1', ['m1', 'v1'])).toEqual(['m1', 'v1']);
    });
  });
});
