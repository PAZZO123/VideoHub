import { ApiPropertyOptional } from '@nestjs/swagger';
import { SearchSort } from '@videohub/types';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const SORT_VALUES = Object.values(SearchSort);

/** Filters shared by the movie listing and the search endpoint. */
export class QueryMoviesDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Free-text match on title, tagline, director or cast.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @ApiPropertyOptional({ description: 'Genre slug, e.g. sci-fi' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  genre?: string;

  @ApiPropertyOptional({ minimum: 1880 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1880)
  @Max(2200)
  year?: number;

  @ApiPropertyOptional({ minimum: 1880 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1880)
  @Max(2200)
  yearFrom?: number;

  @ApiPropertyOptional({ minimum: 1880 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1880)
  @Max(2200)
  yearTo?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(10)
  minRating?: number;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  language?: string;

  @ApiPropertyOptional({ description: 'Maximum runtime in minutes.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxRuntime?: number;

  @ApiPropertyOptional({ enum: SORT_VALUES, default: SearchSort.TRENDING })
  @IsOptional()
  @IsIn(SORT_VALUES)
  sort?: SearchSort;
}
