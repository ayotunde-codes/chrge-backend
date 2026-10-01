import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { AuditSensitivity } from '@prisma/client';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { from, Observable } from 'rxjs';
import { concatMap, map } from 'rxjs/operators';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    // Station moderation and CNG document reads write richer, transaction-aware events.
    if (/\/stations\/[^/]+\/review$/.test(request.path) || request.path.includes('/documents/')) {
      return next.handle();
    }
    return next.handle().pipe(
      concatMap((value) =>
        from(
          this.audit.create(
            {
              actorId: request.user?.sub,
              actorRole: request.user?.role === 'OPERATOR' ? 'OPERATOR' : 'ADMIN',
              requestId: request.get('x-request-id') ?? randomUUID(),
              ipAddress: request.ip,
              userAgent: request.get('user-agent'),
            },
            {
              action: `admin.${request.method.toLowerCase()}.${request.route?.path ?? request.path}`,
              targetType: 'admin_api',
              targetId: typeof request.params.id === 'string' ? request.params.id : undefined,
              reason: typeof request.body?.reason === 'string' ? request.body.reason : undefined,
              sensitivity:
                request.method === 'GET' ? AuditSensitivity.SENSITIVE : AuditSensitivity.STANDARD,
              metadata: { method: request.method },
            },
          ),
        ).pipe(map(() => value)),
      ),
    );
  }
}
