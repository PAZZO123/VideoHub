import { Test, type TestingModule } from '@nestjs/testing';
import { ModerationStatus } from '@prisma/client';
import { ErrorCode, UserRole } from '@videohub/types';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

const ADMIN_ID = 'admin-1';
const OTHER_ADMIN_ID = 'admin-2';

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: OTHER_ADMIN_ID,
    email: 'other@example.com',
    displayName: 'Other Admin',
    role: 'ADMIN',
    plan: 'FREE',
    ageVerified: true,
    createdAt: new Date(),
    _count: { watchlist: 0, downloads: 0 },
    ...overrides,
  };
}

describe('AdminService', () => {
  let moduleRef: TestingModule;
  let service: AdminService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    video: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock; deleteMany: jest.Mock };
    movie: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock; create: jest.Mock; delete: jest.Mock };
    genre: { findMany: jest.Mock };
    download: { count: jest.Mock };
    searchHistory: { count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(userRow()),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(userRow({ ...data })),
        ),
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([]),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      video: {
        findUnique: jest.fn().mockResolvedValue({ id: 'v1' }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'v1',
            slug: 'v',
            title: 'V',
            description: null,
            thumbnailUrl: null,
            durationSeconds: null,
            maturityRating: 'GENERAL',
            category: null,
            uploader: null,
            viewCount: 0,
            trendingScore: 0,
            createdAt: new Date(),
            ...data,
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      movie: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        delete: jest.fn(),
      },
      genre: { findMany: jest.fn().mockResolvedValue([]) },
      download: { count: jest.fn().mockResolvedValue(0) },
      searchHistory: { count: jest.fn().mockResolvedValue(0) },
      // Throws on purpose. Read paths must use Promise.all, not $transaction:
      // a transaction pins a pooled connection and Neon's pooler runs out under
      // concurrency. Mocking it as Promise.all is what hid this bug originally.
      $transaction: jest.fn(() => {
        throw new Error('$transaction must not be used for read-only queries');
      }),
    };

    moduleRef = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AdminService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('admin lockout protection', () => {
    it('refuses to let an admin remove their own role', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: ADMIN_ID }));

      await expect(
        service.updateUser(ADMIN_ID, { role: UserRole.USER }, ADMIN_ID),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses to let an admin deactivate their own account', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: ADMIN_ID }));

      await expect(
        service.updateUser(ADMIN_ID, { isActive: false }, ADMIN_ID),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });

    it('refuses to demote the last remaining admin', async () => {
      prisma.user.count.mockResolvedValue(1);

      await expect(
        service.updateUser(OTHER_ADMIN_ID, { role: UserRole.USER }, ADMIN_ID),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows demoting an admin while others remain', async () => {
      prisma.user.count.mockResolvedValue(3);

      await expect(
        service.updateUser(OTHER_ADMIN_ID, { role: UserRole.USER }, ADMIN_ID),
      ).resolves.toBeDefined();
    });

    it('404s for an unknown account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUser('ghost', { isActive: false }, ADMIN_ID),
      ).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND });
    });
  });

  describe('deactivation', () => {
    it('revokes existing sessions immediately, not at token expiry', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ role: 'USER' }));

      await service.updateUser(OTHER_ADMIN_ID, { isActive: false }, ADMIN_ID);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: OTHER_ADMIN_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does not revoke sessions when only the role changes', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ role: 'USER' }));

      await service.updateUser(OTHER_ADMIN_ID, { role: UserRole.ADMIN }, ADMIN_ID);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('moderation', () => {
    it('requires a note when rejecting', async () => {
      await expect(
        service.moderate('v1', { status: ModerationStatus.REJECTED }, ADMIN_ID),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
      expect(prisma.video.update).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only note as no note at all', async () => {
      await expect(
        service.moderate('v1', { status: ModerationStatus.REJECTED, note: '   ' }, ADMIN_ID),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });

    it('accepts a rejection carrying a reason', async () => {
      await expect(
        service.moderate(
          'v1',
          { status: ModerationStatus.REJECTED, note: 'Copyrighted material.' },
          ADMIN_ID,
        ),
      ).resolves.toBeDefined();
    });

    it('does not require a note to approve', async () => {
      await expect(
        service.moderate('v1', { status: ModerationStatus.APPROVED }, ADMIN_ID),
      ).resolves.toBeDefined();
    });

    it('stamps the moderation time', async () => {
      await service.moderate('v1', { status: ModerationStatus.APPROVED }, ADMIN_ID);
      expect(prisma.video.update.mock.calls[0][0].data.moderatedAt).toBeInstanceOf(Date);
    });

    it('404s for an unknown video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(
        service.moderate('ghost', { status: ModerationStatus.APPROVED }, ADMIN_ID),
      ).rejects.toMatchObject({ code: ErrorCode.VIDEO_NOT_FOUND });
    });

    it('defaults the queue to pending items, oldest first', async () => {
      const query = Object.assign(Object.create(null), { page: 1, limit: 24, skip: 0, take: 24 });
      await service.moderationQueue(query as never);

      const call = prisma.video.findMany.mock.calls[0][0];
      expect(call.where.moderationStatus).toBe(ModerationStatus.PENDING);
      expect(call.orderBy).toEqual({ createdAt: 'asc' });
    });
  });

  describe('genres', () => {
    it('names unknown genre slugs rather than silently dropping them', async () => {
      prisma.genre.findMany.mockResolvedValue([{ id: 'g1', slug: 'action' }]);

      await expect(
        service.createMovie({ title: 'X', genreSlugs: ['action', 'nonsense'] }),
      ).rejects.toMatchObject({ code: ErrorCode.GENRE_NOT_FOUND });
    });
  });
});
