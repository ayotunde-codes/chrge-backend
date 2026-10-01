import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, path } = request;
    const authContext = (request as Request & { user?: { sub: string } }).user?.sub
      ? 'authenticated'
      : 'anonymous';

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const contentLength = response.get('content-length') || 0;
          const duration = Date.now() - now;

          this.logger.log(
            `${method} ${path} ${statusCode} ${contentLength} - ${duration}ms - ${authContext}`,
          );
        },
        error: (error: unknown) => {
          const duration = Date.now() - now;
          const errorName = error instanceof Error ? error.name : 'RequestError';
          this.logger.error(
            `${method} ${path} - ${duration}ms - ${authContext} - Error: ${errorName}`,
          );
        },
      }),
    );
  }
}
