import { Injectable } from '@nestjs/common';
import { AuditSensitivity, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditContext {
  actorId?: string;
  actorRole?: UserRole;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditRecord {
  action: string;
  targetType: string;
  targetId?: string;
  reason?: string;
  sensitivity?: AuditSensitivity;
  beforeSummary?: Prisma.InputJsonValue;
  afterSummary?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  create(context: AuditContext, record: AuditRecord, tx: Prisma.TransactionClient = this.prisma) {
    return tx.auditEvent.create({
      data: {
        actorId: context.actorId,
        actorRole: context.actorRole,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        action: record.action,
        targetType: record.targetType,
        targetId: record.targetId,
        reason: record.reason,
        sensitivity: record.sensitivity ?? AuditSensitivity.STANDARD,
        beforeSummary: record.beforeSummary,
        afterSummary: record.afterSummary,
        metadata: record.metadata,
      },
    });
  }

  list(params: {
    cursor?: string;
    limit?: number;
    action?: string;
    actorId?: string;
    targetType?: string;
  }) {
    const limit = Math.min(params.limit ?? 50, 100);
    return this.prisma.auditEvent.findMany({
      where: {
        action: params.action,
        actorId: params.actorId,
        targetType: params.targetType,
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        actorId: true,
        actorRole: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
        requestId: true,
        sensitivity: true,
        occurredAt: true,
      },
    });
  }
}
