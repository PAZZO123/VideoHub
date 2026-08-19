import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, UserRole } from '@videohub/types';
import type { MaybeAuthedRequest } from '../decorators';
import { ROLES_KEY } from '../decorators';
import { AppException } from '../exceptions/app.exception';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<MaybeAuthedRequest>();
    const user = request.user;

    if (!user) {
      throw AppException.unauthorized(ErrorCode.UNAUTHORIZED, 'You need to be signed in to do that.');
    }

    if (!required.includes(user.role)) {
      throw AppException.forbidden(
        ErrorCode.FORBIDDEN,
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}
