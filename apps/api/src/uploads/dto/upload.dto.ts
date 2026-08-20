import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UPLOAD_RULES } from '@videohub/config';
import { MaturityRating } from '@videohub/types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Multipart fields arrive as strings, so booleans and arrays are coerced here
 * rather than in the controller.
 */
const toBool = ({ value }: { value: unknown }): unknown =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

const toArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }
  return value;
};

export class CreateUploadDto {
  @ApiProperty({ maxLength: UPLOAD_RULES.MAX_TITLE_LENGTH })
  @IsString()
  @MinLength(2, { message: 'Give your video a title.' })
  @MaxLength(UPLOAD_RULES.MAX_TITLE_LENGTH)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title!: string;

  @ApiPropertyOptional({ maxLength: UPLOAD_RULES.MAX_DESCRIPTION_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(UPLOAD_RULES.MAX_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({ description: 'Category slug.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  categorySlug?: string;

  @ApiPropertyOptional({ type: [String], maxItems: UPLOAD_RULES.MAX_TAGS })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(UPLOAD_RULES.MAX_TAGS)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'rw' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  language?: string;

  @ApiPropertyOptional({ enum: Object.values(MaturityRating) })
  @IsOptional()
  @IsEnum(MaturityRating)
  maturityRating?: MaturityRating;

  @ApiProperty({
    description:
      'Must be true. You are confirming you own this content or hold the rights to publish it.',
  })
  @Transform(toBool)
  @IsBoolean()
  // Not merely truthy — the uploader must actively assert the rights claim.
  @Equals(true, {
    message: 'You must confirm you hold the rights to publish this video.',
  })
  rightsConfirmed!: boolean;

  @ApiPropertyOptional({
    description:
      'Only meaningful when you hold distribution rights. Reviewed before it takes effect.',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  downloadAllowed?: boolean;
}
