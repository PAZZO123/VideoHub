import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { ErrorCode } from '@videohub/types';
import * as bcrypt from 'bcryptjs';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const AUTH_CONFIG = {
  jwtSecret: 'test-secret-value-at-least-16-chars',
  jwtRefreshSecret: 'test-refresh-secret-at-least-16-chars',
  accessTtl: '15m',
  refreshTtl: '30d',
  bcryptRounds: 4,
};

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'alex@example.com',
    passwordHash: bcrypt.hashSync('Password1', 4),
    displayName: 'Alex',
    avatarUrl: null,
    role: 'USER',
    plan: 'FREE',
    ageVerified: false,
    ageVerifiedAt: null,
    dateOfBirth: null,
    kidsMode: false,
    preferredLanguage: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let moduleRef: TestingModule;
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('access.jwt') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(AUTH_CONFIG) } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('register', () => {
    it('hashes the password and never returns it', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(buildUser(data)),
      );

      const session = await service.register({
        email: 'new@example.com',
        password: 'Password1',
        displayName: 'New User',
      });

      const created = prisma.user.create.mock.calls[0][0].data;
      expect(created.passwordHash).not.toBe('Password1');
      expect(await bcrypt.compare('Password1', created.passwordHash)).toBe(true);
      expect(JSON.stringify(session.user)).not.toContain('passwordHash');
    });

    it('rejects an email that is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({ email: 'taken@example.com', password: 'Password1', displayName: 'X' }),
      ).rejects.toMatchObject({ code: ErrorCode.EMAIL_ALREADY_REGISTERED });
    });

    it('verifies age at signup when the date of birth proves 18+', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(buildUser(data)),
      );

      const session = await service.register({
        email: 'adult@example.com',
        password: 'Password1',
        displayName: 'Adult',
        dateOfBirth: '1990-06-15',
      });

      expect(session.user.ageVerified).toBe(true);
    });

    it('leaves a minor unverified', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(buildUser(data)),
      );

      const recent = new Date();
      recent.setFullYear(recent.getFullYear() - 12);

      const session = await service.register({
        email: 'kid@example.com',
        password: 'Password1',
        displayName: 'Kid',
        dateOfBirth: recent.toISOString().slice(0, 10),
      });

      expect(session.user.ageVerified).toBe(false);
    });
  });

  describe('login', () => {
    it('returns a session for correct credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const session = await service.login({ email: 'alex@example.com', password: 'Password1' });

      expect(session.accessToken).toBe('access.jwt');
      expect(session.refreshToken).toHaveLength(96);
      expect(session.user.email).toBe('alex@example.com');
    });

    it('gives the same error for an unknown email and a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknownEmail = await service
        .login({ email: 'nobody@example.com', password: 'Password1' })
        .catch((error: AppException) => error);

      prisma.user.findUnique.mockResolvedValue(buildUser());
      const wrongPassword = await service
        .login({ email: 'alex@example.com', password: 'WrongPassword1' })
        .catch((error: AppException) => error);

      // Distinguishable errors here would let an attacker enumerate accounts.
      expect((unknownEmail as AppException).code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect((wrongPassword as AppException).code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect((unknownEmail as AppException).message).toBe((wrongPassword as AppException).message);
    });

    it('refuses a deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ isActive: false }));

      await expect(
        service.login({ email: 'alex@example.com', password: 'Password1' }),
      ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    });
  });

  describe('refresh', () => {
    it('rotates the presented token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt_1',
        userId: 'user_1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        user: buildUser(),
      });

      const session = await service.refresh('some-refresh-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt_1' } }),
      );
      expect(session.refreshToken).not.toBe('some-refresh-token');
    });

    it('rejects a revoked token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt_1',
        userId: 'user_1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        user: buildUser(),
      });

      await expect(service.refresh('revoked')).rejects.toMatchObject({
        code: ErrorCode.INVALID_REFRESH_TOKEN,
      });
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt_1',
        userId: 'user_1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: buildUser(),
      });

      await expect(service.refresh('expired')).rejects.toMatchObject({
        code: ErrorCode.INVALID_REFRESH_TOKEN,
      });
    });

    it('stores only a hash, never the raw refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const session = await service.login({ email: 'alex@example.com', password: 'Password1' });
      const stored = prisma.refreshToken.create.mock.calls[0][0].data;

      expect(stored.tokenHash).not.toBe(session.refreshToken);
      expect(stored.tokenHash).toHaveLength(64);
    });
  });

  describe('verifyAge', () => {
    it('verifies an adult and turns kids mode off', async () => {
      prisma.user.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(buildUser(data)),
      );

      const user = await service.verifyAge('user_1', {
        dateOfBirth: '1995-03-10',
        confirmAdult: true,
      });

      expect(user.ageVerified).toBe(true);
      expect(user.kidsMode).toBe(false);
    });

    it('rejects a user under 18', async () => {
      const under = new Date();
      under.setFullYear(under.getFullYear() - 15);

      await expect(
        service.verifyAge('user_1', {
          dateOfBirth: under.toISOString().slice(0, 10),
          confirmAdult: true,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.UNDERAGE });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an unchecked confirmation even with a valid date', async () => {
      await expect(
        service.verifyAge('user_1', { dateOfBirth: '1990-01-01', confirmAdult: false }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a future date of birth', async () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);

      await expect(
        service.verifyAge('user_1', {
          dateOfBirth: future.toISOString().slice(0, 10),
          confirmAdult: true,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });
  });

  describe('logout', () => {
    it('revokes every session when no token is supplied', async () => {
      await service.logout('user_1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user_1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
