import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaKind } from '@videohub/types';
import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

const MEDIA_KINDS = Object.values(MediaKind);

export class AddToWatchlistDto {
  @ApiProperty({ enum: MEDIA_KINDS })
  @IsEnum(MediaKind, { message: 'kind must be MOVIE or VIDEO.' })
  kind!: MediaKind;

  @ApiPropertyOptional({ description: 'Required when kind is MOVIE.' })
  // Enforced conditionally so a MOVIE entry cannot be created without a movie,
  // and a VIDEO entry cannot smuggle one in.
  @ValidateIf((dto: AddToWatchlistDto) => dto.kind === MediaKind.MOVIE)
  @IsString({ message: 'movieId is required when kind is MOVIE.' })
  movieId?: string;

  @ApiPropertyOptional({ description: 'Required when kind is VIDEO.' })
  @ValidateIf((dto: AddToWatchlistDto) => dto.kind === MediaKind.VIDEO)
  @IsString({ message: 'videoId is required when kind is VIDEO.' })
  videoId?: string;
}

export class WatchlistQueryDto {
  @ApiPropertyOptional({ enum: MEDIA_KINDS, description: 'Filter to one media kind.' })
  @IsOptional()
  @IsEnum(MediaKind)
  kind?: MediaKind;
}
