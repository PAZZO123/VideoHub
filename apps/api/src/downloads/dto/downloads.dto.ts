import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class AnalyzeUrlDto {
  @ApiProperty({
    example: 'https://archive.org/details/night_of_the_living_dead',
    description: 'The URL to analyze. Only http(s) is accepted.',
  })
  @IsString()
  @MaxLength(2048, { message: 'That URL is too long.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Enter a valid http(s) URL.' },
  )
  url!: string;
}

export class CreateDownloadDto extends AnalyzeUrlDto {
  @ApiPropertyOptional({
    description: 'Format id from the analysis response. Defaults to the only available format.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  formatId?: string;
}
