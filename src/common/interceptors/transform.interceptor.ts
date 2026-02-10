import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the response is already in our standard format, return as-is
        if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
          return data as ApiResponse<T>;
        }

        return {
          success: true,
          data,
        };
      }),
    );
  }
}




