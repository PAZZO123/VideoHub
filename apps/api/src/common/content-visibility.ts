import { MaturityRating } from '@prisma/client';
import type { RequestUser } from './decorators';

/**
 * Decides which maturity ratings a given viewer may see.
 *
 * Every query that returns movies or videos must go through here. Centralising
 * it means an ADULT title cannot leak through a listing, a search, a trending
 * rail, a recommendation, or a "similar titles" query just because one of them
 * forgot to add a filter.
 *
 * The rules:
 *   - Kids Mode on              -> KIDS only, regardless of age verification.
 *   - Guest or unverified user  -> everything except ADULT.
 *   - Verified 18+ user         -> everything.
 */

const NON_ADULT_RATINGS: MaturityRating[] = [
  MaturityRating.KIDS,
  MaturityRating.GENERAL,
  MaturityRating.TEEN,
  MaturityRating.MATURE,
];

const ALL_RATINGS: MaturityRating[] = [...NON_ADULT_RATINGS, MaturityRating.ADULT];

export interface VisibilityContext {
  /** Undefined for guests. */
  user?: RequestUser | undefined;
  /**
   * Forces the kids-only view even for a signed-out visitor — used by the
   * Ibitente surface, which is browsable without an account.
   */
  forceKids?: boolean;
}

export function allowedRatings({ user, forceKids }: VisibilityContext): MaturityRating[] {
  if (forceKids || user?.kidsMode) return [MaturityRating.KIDS];
  if (user?.ageVerified) return ALL_RATINGS;
  return NON_ADULT_RATINGS;
}

/** Prisma `where` fragment restricting a query to what this viewer may see. */
export function visibilityWhere(context: VisibilityContext): {
  maturityRating: { in: MaturityRating[] };
} {
  return { maturityRating: { in: allowedRatings(context) } };
}

/**
 * Whether a viewer may see one specific rating. Used on detail endpoints, where
 * a 404 (rather than a 403) is the right answer — confirming that an ADULT title
 * exists is itself a disclosure.
 */
export function canView(rating: MaturityRating, context: VisibilityContext): boolean {
  return allowedRatings(context).includes(rating);
}

/** True when the viewer is restricted to kids content. */
export function isKidsView(context: VisibilityContext): boolean {
  return Boolean(context.forceKids || context.user?.kidsMode);
}
