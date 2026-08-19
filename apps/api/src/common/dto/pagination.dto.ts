import { ApiPropertyOptional } from '@nestjs/swagger';
import { PAGINATION } from '@videohub/config';
import type { PageMeta, Paginated } from '@videohub/types';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ minimum: 1, default: PAGINATION.DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = PAGINATION.DEFAULT_PAGE;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PAGINATION.MAX_LIMIT,
    default: PAGINATION.DEFAULT_LIMIT,
    description: 'Capped server-side; large pages are never returned.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_LIMIT)
  limit: number = PAGINATION.DEFAULT_LIMIT;

  get skip(): number {
    return (this.page - 1) * this.take;
  }

  get take(): number {
    return Math.min(this.limit, PAGINATION.MAX_LIMIT);
  }
}

export function buildPageMeta(page: number, limit: number, total: number): PageMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function paginate<T>(items: T[], page: number, limit: number, total: number): Paginated<T> {
  return { items, meta: buildPageMeta(page, limit, total) };
}
