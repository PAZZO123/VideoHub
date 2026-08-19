import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ADULT_AGE_THRESHOLD } from '@videohub/config';
import { ErrorCode, type AuthSession, type JwtAccessClaims, type PublicUser } from '@videohub/types';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { AppException } from '../common/exceptions/app.exception';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser } from '../users/users.mapper';
import type { LoginDto, RegisterDto, VerifyAgeDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async register(dto: RegisterDto, userAgent?: string): Promise<AuthSession> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw AppException.conflict(
        ErrorCode.EMAIL_ALREADY_REGISTERED,
        'An account with that email already exists.',
      );
    }

    const { bcryptRounds } = this.config.get('auth', { infer: true });
    const passwordHash = await bcrypt.hash(dto.password, bcryptRounds);

    const dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    // Signing up with a DOB that already proves 18+ verifies the account
    // immediately; anything else leaves ageVerified false.
    const isAdult = dateOfBirth ? this.calculateAge(dateOfBirth) >= ADULT_AGE_THRESHOLD : false;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        dateOfBirth,
        ageVerified: isAdult,
        ageVerifiedAt: isAdult ? new Date() : null,
      },
    });

    return this.issueSession(user.id, toPublicUser(user), userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Compare against a dummy hash when the user is missing so the response time
    // does not reveal whether an email is registered.
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordMatches) {
      throw AppException.unauthorized(
        ErrorCode.INVALID_CREDENTIALS,
        'That email or password is incorrect.',
      );
    }

    if (!user.isActive) {
      throw AppException.forbidden(ErrorCode.FORBIDDEN, 'This account has been deactivated.');
    }

    return this.issueSession(user.id, toPublicUser(user), userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<AuthSession> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw AppException.unauthorized(
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Your session has expired. Please sign in again.',
      );
    }

    if (!stored.user.isActive) {
      throw AppException.forbidden(ErrorCode.FORBIDDEN, 'This account has been deactivated.');
    }

    // Rotate: the presented token is burned as part of issuing the new pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(stored.userId, toPublicUser(stored.user), userAgent);
  }

  async logout(userId: string, refreshToken?: string): Promise<{ loggedOut: true }> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      // No token supplied — revoke every session for this user.
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { loggedOut: true };
  }

  /**
   * Self-attested age verification: a date of birth that proves 18+ plus an
   * explicit confirmation. This is the gate for ADULT-rated content.
   */
  async verifyAge(userId: string, dto: VerifyAgeDto): Promise<PublicUser> {
    if (!dto.confirmAdult) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'You must confirm that you are 18 or older.',
      );
    }

    const dateOfBirth = new Date(dto.dateOfBirth);
    if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date()) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, 'Enter a valid date of birth.');
    }

    if (this.calculateAge(dateOfBirth) < ADULT_AGE_THRESHOLD) {
      throw AppException.forbidden(
        ErrorCode.UNDERAGE,
        `You must be at least ${ADULT_AGE_THRESHOLD} to access this content.`,
      );
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        dateOfBirth,
        ageVerified: true,
        ageVerifiedAt: new Date(),
        // Age-restricted browsing and kids mode are mutually exclusive.
        kidsMode: false,
      },
    });

    return toPublicUser(user);
  }

  /** Removes expired and revoked refresh tokens. Called by the cleanup job. */
  async pruneExpiredTokens(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });
    if (count > 0) this.logger.log(`Pruned ${count} expired/revoked refresh tokens`);
    return count;
  }

  private async issueSession(
    userId: string,
    user: PublicUser,
    userAgent?: string,
  ): Promise<AuthSession> {
    const auth = this.config.get('auth', { infer: true });

    const claims: JwtAccessClaims = {
      sub: userId,
      email: user.email,
      role: user.role,
      plan: user.plan,
      ageVerified: user.ageVerified,
    };

    const accessToken = await this.jwt.signAsync(claims, {
      secret: auth.jwtSecret,
      expiresIn: auth.accessTtl,
    });

    // Refresh tokens are opaque random strings, not JWTs — they carry no claims
    // and are only valid while their hash is present and unrevoked in the DB.
    const refreshToken = randomBytes(48).toString('hex');

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.ttlToMs(auth.refreshTtl)),
        userAgent: userAgent?.slice(0, 255) ?? null,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(this.ttlToMs(auth.accessTtl) / 1000),
      user,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private calculateAge(dateOfBirth: Date): number {
    const now = new Date();
    let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
      age -= 1;
    }
    return age;
  }

  /** Parses `15m` / `7d` / `3600` style TTLs into milliseconds. */
  private ttlToMs(ttl: string): number {
    const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
    if (!match) return 15 * 60 * 1000;
    const amount = Number.parseInt(match[1] as string, 10);
    const unit = match[2] ?? 's';
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return amount * (multipliers[unit] ?? 1000);
  }
}
