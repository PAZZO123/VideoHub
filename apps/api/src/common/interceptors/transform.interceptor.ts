import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { ApiSuccess } from '@videohub/types';
import { map, type Observable } from 'rxjs';

/** Marks a handler as returning a raw payload (SSE, file streams). */
export const RAW_RESPONSE_KEY = 'videohub:raw-response';

/**
 * Wraps every successful handler return value in the `{ success: true, data }`
 * envelope so controllers can just return domain objects.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccess<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T> | T> {
    const handler = context.getHandler();
    const isRaw = Reflect.getMetadata(RAW_RESPONSE_KEY, handler) === true;

    if (isRaw) {
      return next.handle();
    }

    return next.handle().pipe(map((data) => ({ success: true as const, data })));
  }
}
