import { MaturityRating } from '@prisma/client';
import type { RequestUser } from './decorators';
import { allowedRatings, canView, isKidsView, visibilityWhere } from './content-visibility';

function user(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'u1',
    email: 'a@b.com',
    role: 'USER',
    plan: 'FREE',
    ageVerified: false,
    kidsMode: false,
    ...overrides,
  };
}

describe('content visibility', () => {
  describe('guests', () => {
    it('never sees ADULT content', () => {
      expect(allowedRatings({})).not.toContain(MaturityRating.ADULT);
    });

    it('sees everything else', () => {
      const ratings = allowedRatings({});
      expect(ratings).toContain(MaturityRating.KIDS);
      expect(ratings).toContain(MaturityRating.GENERAL);
      expect(ratings).toContain(MaturityRating.TEEN);
      expect(ratings).toContain(MaturityRating.MATURE);
    });
  });

  describe('signed-in but unverified', () => {
    it('still never sees ADULT content', () => {
      expect(allowedRatings({ user: user({ ageVerified: false }) })).not.toContain(
        MaturityRating.ADULT,
      );
      expect(canView(MaturityRating.ADULT, { user: user({ ageVerified: false }) })).toBe(false);
    });
  });

  describe('verified 18+', () => {
    it('sees ADULT content', () => {
      expect(canView(MaturityRating.ADULT, { user: user({ ageVerified: true }) })).toBe(true);
    });
  });

  describe('kids mode', () => {
    it('restricts to KIDS only', () => {
      expect(allowedRatings({ user: user({ kidsMode: true }) })).toEqual([MaturityRating.KIDS]);
    });

    it('overrides age verification — a verified adult in kids mode sees only KIDS', () => {
      const kidsAdult = user({ kidsMode: true, ageVerified: true });
      expect(allowedRatings({ user: kidsAdult })).toEqual([MaturityRating.KIDS]);
      expect(canView(MaturityRating.ADULT, { user: kidsAdult })).toBe(false);
      expect(canView(MaturityRating.MATURE, { user: kidsAdult })).toBe(false);
    });

    it('applies to guests on the Ibitente surface via forceKids', () => {
      expect(allowedRatings({ forceKids: true })).toEqual([MaturityRating.KIDS]);
      expect(isKidsView({ forceKids: true })).toBe(true);
    });

    it('forceKids overrides a verified adult too', () => {
      expect(allowedRatings({ user: user({ ageVerified: true }), forceKids: true })).toEqual([
        MaturityRating.KIDS,
      ]);
    });
  });

  describe('visibilityWhere', () => {
    it('produces a Prisma filter matching the allowed ratings', () => {
      expect(visibilityWhere({ user: user({ kidsMode: true }) })).toEqual({
        maturityRating: { in: [MaturityRating.KIDS] },
      });
    });

    it('excludes ADULT for an unverified viewer', () => {
      const where = visibilityWhere({ user: user() });
      expect(where.maturityRating.in).not.toContain(MaturityRating.ADULT);
    });
  });
});
