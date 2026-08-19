import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '@videohub/types';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from '../decorators';
import { AppException } from '../exceptions/app.exception';

/**
 * Global auth guard. Endpoints are protected by default; `@Public()` opts out
 * entirely and `@OptionalAuth()` opts out of the *requirement* while still
 * populating `request.user` when a valid token is supplied.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser>(err: unknown, user: TUser, _info: unknown, context: ExecutionContext): TUser {
    const targets = [context.getHandler(), context.getClass()];
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, targets);

    if (isOptional) {
      // Bad or missing token simply means "treat as a guest".
      return (user ?? undefined) as TUser;
    }

    if (err || !user) {
      throw AppException.unauthorized(
        ErrorCode.UNAUTHORIZED,
        'You need to be signed in to do that.',
      );
    }

    return user;
  }
}
