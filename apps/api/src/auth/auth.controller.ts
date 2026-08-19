import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthSession, PublicUser } from '@videohub/types';
import type { Request } from 'express';
import { CurrentUser, Public, type RequestUser } from '../common/decorators';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto, VerifyAgeDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Tighter than the global limit: credential endpoints are the ones worth
  // brute-forcing.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Create an account' })
  @ApiResponse({ status: 201, description: 'Account created; session returned.' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthSession> {
    return this.authService.register(dto, req.headers['user-agent']);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({ status: 200, description: 'Session returned.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthSession> {
    return this.authService.login(dto, req.headers['user-agent']);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new session' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthSession> {
    return this.authService.refresh(dto.refreshToken, req.headers['user-agent']);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current refresh token (or all sessions)' })
  logout(
    @CurrentUser('id') userId: string,
    @Body() dto: Partial<RefreshTokenDto>,
  ): Promise<{ loggedOut: true }> {
    return this.authService.logout(userId, dto?.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'The signed-in user' })
  me(@CurrentUser() user: RequestUser): RequestUser {
    return user;
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-age')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm you are 18 or older',
    description:
      'Required before any ADULT-rated content is returned. Turns Kids Mode off.',
  })
  @ApiResponse({ status: 403, description: 'Under the minimum age.' })
  verifyAge(@CurrentUser('id') userId: string, @Body() dto: VerifyAgeDto): Promise<PublicUser> {
    return this.authService.verifyAge(userId, dto);
  }
}
