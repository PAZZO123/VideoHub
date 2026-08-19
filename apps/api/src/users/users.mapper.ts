import type { User } from '@prisma/client';
import type { PublicUser, UserPlan, UserRole } from '@videohub/types';

/**
 * Single place that decides what a user object looks like on the wire.
 * `passwordHash` is structurally impossible to leak through this function.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role as UserRole,
    plan: user.plan as UserPlan,
    ageVerified: user.ageVerified,
    kidsMode: user.kidsMode,
    preferredLanguage: user.preferredLanguage,
    createdAt: user.createdAt.toISOString(),
  };
}
