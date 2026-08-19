import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@videohub/types';
import type { MaybeAuthedRequest } from '../decorators';
import { AGE_RESTRICTED_KEY } from '../decorators';
import { AppException } from '../exceptions/app.exception';

/**
 * Enforces `@RequiresAgeVerification()`. Age-restricted material is never served
 * to a guest or to an account that has not completed 18+ verification, and kids
 * mode is an absolute block regardless of verification state.
 */
@Injectable()
export class AgeVerificationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const restricted = this.reflector.getAllAndOverride<boolean>(AGE_RESTRICTED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!restricted) return true;

    const user = context.switchToHttp().getRequest<MaybeAuthedRequest>().user;

    if (!user) {
      throw AppException.unauthorized(
        ErrorCode.AGE_VERIFICATION_REQUIRED,
        'Create an account and confirm you are 18 or older to view this section.',
      );
    }

    if (user.kidsMode) {
      throw AppException.forbidden(
        ErrorCode.FORBIDDEN,
        'This section is unavailable while Kids Mode is on.',
      );
    }

    if (!user.ageVerified) {
      throw AppException.forbidden(
        ErrorCode.AGE_VERIFICATION_REQUIRED,
        'You must confirm you are 18 or older before viewing this section.',
      );
    }

    return true;
  }
}
