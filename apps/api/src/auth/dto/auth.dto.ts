import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_RULES } from '@videohub/config';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const normaliseEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'you@example.com' })
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    minLength: PASSWORD_RULES.MIN_LENGTH,
    description: 'At least 8 characters, including a letter and a number.',
  })
  @IsString()
  @Length(PASSWORD_RULES.MIN_LENGTH, PASSWORD_RULES.MAX_LENGTH)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number.',
  })
  password!: string;

  @ApiProperty({ example: 'Alex Uwase' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName!: string;

  @ApiPropertyOptional({
    example: '1998-04-21',
    description: 'Optional at signup. Required later to unlock 18+ content.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date (YYYY-MM-DD).' })
  dateOfBirth?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'you@example.com' })
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class VerifyAgeDto {
  @ApiProperty({ example: '1998-04-21', description: 'Must place the user at 18 or older.' })
  @IsDateString({}, { message: 'Enter a valid date of birth (YYYY-MM-DD).' })
  dateOfBirth!: string;

  @ApiProperty({
    description: 'Explicit confirmation. Must be true — an unchecked box is not consent.',
  })
  @IsBoolean()
  confirmAdult!: boolean;
}
