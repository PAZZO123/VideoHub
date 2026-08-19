import { ApiPropertyOptional } from '@nestjs/swagger';
import { SearchSort } from '@videohub/types';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const SORT_VALUES = Object.values(SearchSort);

export class QueryVideosDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Free-text match on title, description or tags.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug, e.g. ibitente' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ example: 'rw' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  language?: string;

  @ApiPropertyOptional({ description: 'Maximum duration in seconds.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDuration?: number;

  @ApiPropertyOptional({
    description: 'Restrict to the Ibitente kids catalogue. Forced on for the kids surface.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  kids?: boolean;

  @ApiPropertyOptional({ enum: SORT_VALUES, default: SearchSort.TRENDING })
  @IsOptional()
  @IsIn(SORT_VALUES)
  sort?: SearchSort;

  @ApiPropertyOptional({ minimum: 0, maximum: 10, description: 'Unused for videos; accepted for a shared filter UI.' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(10)
  minRating?: number;
}
