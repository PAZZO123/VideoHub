import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@videohub/types';
import type { Request } from 'express';
import { RAW_RESPONSE_KEY } from '../interceptors/transform.interceptor';

/** The authenticated principal attached to the request by JwtStrategy. */
export interface RequestUser {
  id: string;
  email: string;
  role: UserRole;
  plan: string;
  ageVerified: boolean;
  kidsMode: boolean;
}

export type MaybeAuthedRequest = Request & { user?: RequestUser };

export const IS_PUBLIC_KEY = 'videohub:is-public';
/** Opens an endpoint to unauthenticated callers. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OPTIONAL_AUTH_KEY = 'videohub:optional-auth';
/**
 * Public, but still resolves the user when a valid token is present — used by
 * listing endpoints that personalise results (and enforce kids mode) for
 * signed-in visitors while staying browsable for guests.
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

export const ROLES_KEY = 'videohub:roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const AGE_RESTRICTED_KEY = 'videohub:age-restricted';
/** Requires a signed-in, 18+ verified account. */
export const RequiresAgeVerification = () => SetMetadata(AGE_RESTRICTED_KEY, true);

/** Skips the global response envelope (SSE / file streaming handlers). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);

/** Injects the authenticated user, or a single property of it. */
export const CurrentUser = createParamDecorator(
  (property: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<MaybeAuthedRequest>();
    const user = request.user;
    if (!user) return undefined;
    return property ? user[property] : user;
  },
);
