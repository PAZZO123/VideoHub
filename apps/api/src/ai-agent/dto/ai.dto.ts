import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AI } from '@videohub/config';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    example: 'Recommend me a good sci-fi movie under two hours.',
    maxLength: AI.MAX_MESSAGE_LENGTH,
  })
  @IsString()
  @MinLength(1, { message: 'Type a message first.' })
  @MaxLength(AI.MAX_MESSAGE_LENGTH, {
    message: `Keep messages under ${AI.MAX_MESSAGE_LENGTH} characters.`,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message!: string;

  @ApiPropertyOptional({
    description: 'Continues an existing conversation. Omit to start a new one.',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;
}
