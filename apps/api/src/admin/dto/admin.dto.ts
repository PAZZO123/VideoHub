import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UPLOAD_RULES } from '@videohub/config';
import { MaturityRating, ModerationStatus, SourceAccess, UserRole } from '@videohub/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMovieDto {
  @ApiProperty({ maxLength: UPLOAD_RULES.MAX_TITLE_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(UPLOAD_RULES.MAX_TITLE_LENGTH)
  @Transform(trim)
  title!: string;

  @ApiPropertyOptional({ description: 'Generated from the title when omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(UPLOAD_RULES.MAX_DESCRIPTION_LENGTH)
  overview?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  tagline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  posterUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  backdropUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  trailerUrl?: string;

  @ApiPropertyOptional({ minimum: 1880, maximum: 2200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1880)
  @Max(2200)
  releaseYear?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  runtimeMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  rating?: number;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  director?: string;

  @ApiPropertyOptional({ enum: Object.values(MaturityRating) })
  @IsOptional()
  @IsEnum(MaturityRating)
  maturityRating?: MaturityRating;

  @ApiPropertyOptional({ type: [String], description: 'Genre slugs.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  genreSlugs?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

/** Every field optional — PATCH semantics. */
export class UpdateMovieDto extends CreateMovieDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(UPLOAD_RULES.MAX_TITLE_LENGTH)
  @Transform(trim)
  declare title: string;
}

export class CreateSourceDto {
  @ApiProperty({ example: 'Internet Archive' })
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  platform!: string;

  @ApiProperty()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @ApiProperty({ enum: Object.values(SourceAccess) })
  @IsEnum(SourceAccess)
  access!: SourceAccess;

  @ApiPropertyOptional({
    description:
      'Set only when the licence permits downloading. This flag never implies bypassing a technical protection.',
  })
  @IsOptional()
  @IsBoolean()
  downloadAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  qualityLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  licenseNote?: string;
}

export class ModerationDecisionDto {
  @ApiProperty({ enum: [ModerationStatus.APPROVED, ModerationStatus.REJECTED] })
  @IsEnum(ModerationStatus)
  status!: ModerationStatus;

  @ApiPropertyOptional({ description: 'Shown to the uploader. Required when rejecting.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  note?: string;

  @ApiPropertyOptional({
    enum: Object.values(MaturityRating),
    description:
      'Reclassify while deciding. An uploader can understate how adult their video is, so the moderator — who has now watched it — gets the final say.',
  })
  @IsOptional()
  @IsEnum(MaturityRating)
  maturityRating?: MaturityRating;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: Object.values(UserRole) })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Deactivating blocks sign-in and invalidates sessions.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ModerationQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Object.values(ModerationStatus), default: ModerationStatus.PENDING })
  @IsOptional()
  @IsEnum(ModerationStatus)
  status?: ModerationStatus;

  @ApiPropertyOptional({
    description: 'Match on title, description or uploader name. Case-insensitive.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  q?: string;
}

export class AdminUsersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Match on email or display name.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  q?: string;
}

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ description: 'Marks the category as part of the Ibitente kids tree.' })
  @IsOptional()
  @IsBoolean()
  isKids?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  iconEmoji?: string;

  @ApiPropertyOptional({ example: '#6366F1' })
  @IsOptional()
  @IsString()
  @MaxLength(9)
  colorHex?: string;
}

export class CreateGenreDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string;
}
