import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const userId = (request as Request & { user?: { sub: string } }).user?.sub || 'anonymous';

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const contentLength = response.get('content-length') || 0;
          const duration = Date.now() - now;

          this.logger.log(
            `${method} ${url} ${statusCode} ${contentLength} - ${duration}ms - ${userId} - ${ip} - ${userAgent}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          this.logger.error(
            `${method} ${url} - ${duration}ms - ${userId} - ${ip} - ${userAgent} - Error: ${error.message}`,
          );
        },
      }),
    );
  }
}




