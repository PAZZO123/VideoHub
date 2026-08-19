import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ErrorCode, type JwtAccessClaims, type UserRole } from '@videohub/types';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/configuration';
import type { RequestUser } from '../../common/decorators';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('auth', { infer: true }).jwtSecret,
    });
  }

  /**
   * Re-reads the user on each request. Slightly more expensive than trusting the
   * claims, but it means a deactivated account, a role change, or a revoked
   * age verification takes effect immediately instead of at token expiry.
   */
  async validate(payload: JwtAccessClaims): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        plan: true,
        ageVerified: true,
        kidsMode: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw AppException.unauthorized(ErrorCode.UNAUTHORIZED, 'This session is no longer valid.');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      plan: user.plan,
      ageVerified: user.ageVerified,
      kidsMode: user.kidsMode,
    };
  }
}
