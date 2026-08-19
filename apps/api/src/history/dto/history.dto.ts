import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaKind } from '@videohub/types';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

const MEDIA_KINDS = Object.values(MediaKind);

export class RecordProgressDto {
  @ApiProperty({ enum: MEDIA_KINDS })
  @IsEnum(MediaKind, { message: 'kind must be MOVIE or VIDEO.' })
  kind!: MediaKind;

  @ApiPropertyOptional({ description: 'Required when kind is MOVIE.' })
  @ValidateIf((dto: RecordProgressDto) => dto.kind === MediaKind.MOVIE)
  @IsString({ message: 'movieId is required when kind is MOVIE.' })
  movieId?: string;

  @ApiPropertyOptional({ description: 'Required when kind is VIDEO.' })
  @ValidateIf((dto: RecordProgressDto) => dto.kind === MediaKind.VIDEO)
  @IsString({ message: 'videoId is required when kind is VIDEO.' })
  videoId?: string;

  @ApiProperty({ description: 'Seconds watched so far.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  progressSeconds!: number;

  @ApiPropertyOptional({ description: 'Total runtime in seconds, when known.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @ApiPropertyOptional({
    description: 'Set explicitly on finish. Otherwise inferred from progress.',
  })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
