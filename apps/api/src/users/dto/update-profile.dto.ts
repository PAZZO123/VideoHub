import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator';
import { LANGUAGES } from '@videohub/config';

const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Alex Uwase' })
  @IsOptional()
  @IsString()
  @Length(2, 60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ enum: LANGUAGE_CODES, nullable: true })
  @IsOptional()
  @IsIn(LANGUAGE_CODES)
  preferredLanguage?: string | null;

  @ApiPropertyOptional({
    description: 'When on, only KIDS-rated content is returned to this account.',
  })
  @IsOptional()
  @IsBoolean()
  kidsMode?: boolean;
}
