import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@videohub/types';

/**
 * The only exception type the app throws deliberately. Carries a stable machine
 * `code` alongside the HTTP status so clients can branch without string-matching
 * on messages.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, string[]>,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.NOT_FOUND);
  }

  static conflict(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT);
  }

  static unauthorized(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.FORBIDDEN);
  }

  static badRequest(
    code: ErrorCode,
    message: string,
    details?: Record<string, string[]>,
  ): AppException {
    return new AppException(code, message, HttpStatus.BAD_REQUEST, details);
  }
}
