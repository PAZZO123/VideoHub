import { MaturityRating } from '@prisma/client';
import { Test, type TestingModule } from '@nestjs/testing';
import { ErrorCode, SearchSort } from '@videohub/types';
import { PaginationDto } from '../common/dto/pagination.dto';
import type { RequestUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { QueryMoviesDto } from './dto/query-movies.dto';
import { MoviesService } from './movies.service';

function movieRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    slug: 'interstellar',
    title: 'Interstellar',
    tagline: null,
    overview: null,
    posterUrl: null,
    backdropUrl: null,
    trailerUrl: null,
    releaseDate: new Date('2014-11-07'),
    releaseYear: 2014,
    runtimeMinutes: 169,
    rating: 8.7,
    ratingCount: 100,
    language: 'en',
    originalTitle: null,
    director: 'Christopher Nolan',
    maturityRating: MaturityRating.TEEN,
    externalId: null,
    externalProvider: null,
    viewCount: 0,
    searchCount: 0,
    watchlistAdds: 0,
    popularity: 1,
    trendingScore: 1,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    genres: [],
    cast: [],
    sources: [],
    ...overrides,
  };
}

function query(overrides: Partial<QueryMoviesDto> = {}): QueryMoviesDto {
  const dto = new QueryMoviesDto();
  Object.assign(dto, { page: 1, limit: 24 }, overrides);
  return dto;
}

const user = (overrides: Partial<RequestUser> = {}): RequestUser => ({
  id: 'u1',
  email: 'a@b.com',
  role: 'USER',
  plan: 'FREE',
  ageVerified: false,
  kidsMode: false,
  ...overrides,
});

describe('MoviesService', () => {
  let moduleRef: TestingModule;
  let service: MoviesService;
  let prisma: {
    movie: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      movie: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
      },
      // The service batches page+count; resolve them as the array it passes in.
      // Throws on purpose. Read paths must use Promise.all, not $transaction:
      // a transaction pins a pooled connection and Neon's pooler runs out under
      // concurrency. Mocking it as Promise.all is what hid this bug originally.
      $transaction: jest.fn(() => {
        throw new Error('$transaction must not be used for read-only queries');
      }),
    };

    moduleRef = await Test.createTestingModule({
      providers: [MoviesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(MoviesService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('visibility enforcement', () => {
    it('excludes ADULT for an unverified viewer', async () => {
      await service.findAll(query(), { user: user() });

      const where = prisma.movie.findMany.mock.calls[0][0].where;
      expect(where.maturityRating.in).not.toContain(MaturityRating.ADULT);
    });

    it('excludes ADULT for a guest', async () => {
      await service.findAll(query(), {});

      const where = prisma.movie.findMany.mock.calls[0][0].where;
      expect(where.maturityRating.in).not.toContain(MaturityRating.ADULT);
    });

    it('includes ADULT for a verified viewer', async () => {
      await service.findAll(query(), { user: user({ ageVerified: true }) });

      const where = prisma.movie.findMany.mock.calls[0][0].where;
      expect(where.maturityRating.in).toContain(MaturityRating.ADULT);
    });

    it('restricts a kids-mode viewer to KIDS only', async () => {
      await service.findAll(query(), { user: user({ kidsMode: true }) });

      const where = prisma.movie.findMany.mock.calls[0][0].where;
      expect(where.maturityRating.in).toEqual([MaturityRating.KIDS]);
    });

    it('applies the same filter to the count query, so totals cannot leak', async () => {
      await service.findAll(query(), { user: user() });

      const listWhere = prisma.movie.findMany.mock.calls[0][0].where;
      const countWhere = prisma.movie.count.mock.calls[0][0].where;
      expect(countWhere).toEqual(listWhere);
    });

    it('only ever returns published titles', async () => {
      await service.findAll(query(), {});
      expect(prisma.movie.findMany.mock.calls[0][0].where.isPublished).toBe(true);
    });
  });

  describe('findBySlug', () => {
    it('returns a visible movie', async () => {
      prisma.movie.findFirst.mockResolvedValue(movieRow());

      const movie = await service.findBySlug('interstellar', { user: user() });
      expect(movie.title).toBe('Interstellar');
    });

    it('404s rather than 403s for an out-of-bounds rating', async () => {
      prisma.movie.findFirst.mockResolvedValue(
        movieRow({ maturityRating: MaturityRating.ADULT }),
      );

      // A 403 would confirm the title exists, which is itself a disclosure.
      await expect(service.findBySlug('x', { user: user() })).rejects.toMatchObject({
        code: ErrorCode.MOVIE_NOT_FOUND,
      });
    });

    it('serves an ADULT title to a verified viewer', async () => {
      prisma.movie.findFirst.mockResolvedValue(
        movieRow({ maturityRating: MaturityRating.ADULT }),
      );

      await expect(
        service.findBySlug('x', { user: user({ ageVerified: true }) }),
      ).resolves.toBeDefined();
    });

    it('404s when the movie does not exist', async () => {
      prisma.movie.findFirst.mockResolvedValue(null);

      await expect(service.findBySlug('missing', {})).rejects.toMatchObject({
        code: ErrorCode.MOVIE_NOT_FOUND,
      });
    });
  });

  describe('filters', () => {
    it('maps a genre slug to a relation filter', async () => {
      await service.findAll(query({ genre: 'sci-fi' }), {});
      expect(prisma.movie.findMany.mock.calls[0][0].where.genres).toEqual({
        some: { genre: { slug: 'sci-fi' } },
      });
    });

    it('turns a year range into gte/lte', async () => {
      await service.findAll(query({ yearFrom: 2000, yearTo: 2010 }), {});
      expect(prisma.movie.findMany.mock.calls[0][0].where.releaseYear).toEqual({
        gte: 2000,
        lte: 2010,
      });
    });

    it('prefers an exact year over a range', async () => {
      await service.findAll(query({ year: 2014, yearFrom: 2000 }), {});
      expect(prisma.movie.findMany.mock.calls[0][0].where.releaseYear).toBe(2014);
    });

    it('searches title, director and cast together', async () => {
      await service.findAll(query({ q: 'nolan' }), {});
      const or = prisma.movie.findMany.mock.calls[0][0].where.OR;
      expect(or).toHaveLength(5);
      expect(JSON.stringify(or)).toContain('cast');
    });
  });

  describe('ordering', () => {
    it('breaks ties on id so pagination stays stable', async () => {
      await service.findAll(query({ sort: SearchSort.TRENDING }), {});
      expect(prisma.movie.findMany.mock.calls[0][0].orderBy).toEqual([
        { trendingScore: 'desc' },
        { id: 'asc' },
      ]);
    });

    it('sorts unrated titles last', async () => {
      await service.findAll(query({ sort: SearchSort.RATING }), {});
      expect(prisma.movie.findMany.mock.calls[0][0].orderBy[0]).toEqual({
        rating: { sort: 'desc', nulls: 'last' },
      });
    });
  });

  describe('pagination', () => {
    it('translates page and limit into skip and take', async () => {
      const dto = new PaginationDto();
      Object.assign(dto, { page: 3, limit: 10 });
      const moviesQuery = query({ page: 3, limit: 10 });

      await service.findAll(moviesQuery, {});

      expect(prisma.movie.findMany.mock.calls[0][0].skip).toBe(dto.skip);
      expect(prisma.movie.findMany.mock.calls[0][0].take).toBe(10);
    });
  });

  describe('recordView', () => {
    it('swallows failures so a counter cannot break the page', async () => {
      prisma.movie.update.mockRejectedValue(new Error('db down'));
      await expect(service.recordView('m1')).resolves.toBeUndefined();
    });
  });
});
