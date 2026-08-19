import { PAGINATION } from '@videohub/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto, buildPageMeta, paginate } from './pagination.dto';

describe('PaginationDto', () => {
  it('applies defaults when nothing is supplied', () => {
    const dto = plainToInstance(PaginationDto, {});
    expect(dto.page).toBe(PAGINATION.DEFAULT_PAGE);
    expect(dto.limit).toBe(PAGINATION.DEFAULT_LIMIT);
  });

  it('computes skip and take from page and limit', () => {
    const dto = plainToInstance(PaginationDto, { page: 3, limit: 20 });
    expect(dto.skip).toBe(40);
    expect(dto.take).toBe(20);
  });

  it('rejects a limit above the server cap', async () => {
    const dto = plainToInstance(PaginationDto, { page: 1, limit: PAGINATION.MAX_LIMIT + 1 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('limit');
  });

  it('rejects a page below 1', async () => {
    const dto = plainToInstance(PaginationDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });
});

describe('buildPageMeta', () => {
  it('describes a middle page', () => {
    expect(buildPageMeta(2, 10, 35)).toEqual({
      page: 2,
      limit: 10,
      total: 35,
      totalPages: 4,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('describes an empty result set without claiming a next page', () => {
    const meta = buildPageMeta(1, 24, 0);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(false);
  });

  it('marks the last page as having no next', () => {
    expect(buildPageMeta(4, 10, 35).hasNext).toBe(false);
  });
});

describe('paginate', () => {
  it('wraps items with their metadata', () => {
    const result = paginate(['a', 'b'], 1, 2, 5);
    expect(result.items).toEqual(['a', 'b']);
    expect(result.meta.totalPages).toBe(3);
  });
});
