import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { ErrorCode, type ApiError } from '@videohub/types';
import type { Request, Response } from 'express';
import { AppException } from '../exceptions/app.exception';

/**
 * Single exit point for every error. Guarantees the documented envelope and,
 * critically, never leaks stack traces, SQL, or connection strings to clients —
 * the full error is logged server-side and a generic message is returned.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.toErrorResponse(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${body.code}`);
    }

    response.status(status).json(body);
  }

  private toErrorResponse(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof AppException) {
      const payload = exception.getResponse() as {
        code: ErrorCode;
        message: string;
        details?: Record<string, string[]>;
      };
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          message: payload.message,
          code: payload.code,
          ...(payload.details ? { details: payload.details } : {}),
        },
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: {
          success: false,
          message: 'Too many requests. Please slow down and try again shortly.',
          code: ErrorCode.RATE_LIMITED,
        },
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        message: 'Something went wrong on our side. Please try again.',
        code: ErrorCode.INTERNAL_ERROR,
      },
    };
  }

  private fromHttpException(exception: HttpException): { status: number; body: ApiError } {
    const status = exception.getStatus();
    const raw = exception.getResponse();

    // ValidationPipe returns { message: string[], error, statusCode }.
    if (typeof raw === 'object' && raw !== null && 'message' in raw) {
      const messages = (raw as { message: unknown }).message;
      if (Array.isArray(messages)) {
        return {
          status,
          body: {
            success: false,
            message: 'Some fields are invalid. Please check and try again.',
            code: ErrorCode.VALIDATION_FAILED,
            details: { _errors: messages.map(String) },
          },
        };
      }
    }

    const codeByStatus: Record<number, ErrorCode> = {
      [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
      [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
      [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
      [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.VALIDATION_FAILED,
      [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.VALIDATION_FAILED,
      [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_FAILED,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
    };

    // Anything else in the 4xx range is still the caller's problem, so it must
    // not be reported as INTERNAL_ERROR — that would send clients chasing a
    // server fault for a bad request (a malformed JSON body, for instance).
    const fallback =
      status >= HttpStatus.BAD_REQUEST && status < HttpStatus.INTERNAL_SERVER_ERROR
        ? ErrorCode.VALIDATION_FAILED
        : ErrorCode.INTERNAL_ERROR;

    return {
      status,
      body: {
        success: false,
        message: status >= 500 ? 'Something went wrong on our side.' : exception.message,
        code: codeByStatus[status] ?? fallback,
      },
    };
  }

  private fromPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: ApiError;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            success: false,
            message: 'That record already exists.',
            code: ErrorCode.CONFLICT,
          },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: {
            success: false,
            message: 'The requested record was not found.',
            code: ErrorCode.NOT_FOUND,
          },
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: {
            success: false,
            message: 'Something went wrong on our side. Please try again.',
            code: ErrorCode.INTERNAL_ERROR,
          },
        };
    }
  }
}
