import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditContext, AuditService } from '../audit/audit.service';

@Injectable()
export class AdminOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async dashboard() {
    const now = new Date();
    const [pendingStations, cngInReview, oldestStation, oldestCng, activeStations] =
      await Promise.all([
        this.prisma.station.count({
          where: { status: 'PENDING', isActive: false, deletedAt: null },
        }),
        this.prisma.cngApplication.count({
          where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        }),
        this.prisma.station.findFirst({
          where: { status: 'PENDING', isActive: false },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.cngApplication.findFirst({
          where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.station.count({
          where: { status: 'APPROVED', isActive: true, deletedAt: null },
        }),
      ]);
    const oldest = [oldestStation?.createdAt, oldestCng?.createdAt]
      .filter(Boolean)
      .sort((a, b) => a!.getTime() - b!.getTime())[0];
    return {
      pendingStations,
      cngInReview,
      oldestQueueHours: oldest ? Math.floor((now.getTime() - oldest.getTime()) / 3600000) : 0,
      activeStations,
      failedOperations: 0,
    };
  }

  vehicleCatalog() {
    return Promise.all([
      this.prisma.vehicleBrand.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { models: true } } },
      }),
      this.prisma.vehicleModel.findMany({
        orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }],
        include: { brand: { select: { name: true } } },
      }),
    ]).then(([brands, models]) => ({ brands, models }));
  }

  async users(params: { cursor?: string; search?: string; limit?: number }) {
    const limit = Math.min(params.limit ?? 25, 100);
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(params.search
          ? {
              OR: [
                { email: { contains: params.search, mode: 'insensitive' } },
                { firstName: { contains: params.search, mode: 'insensitive' } },
                { lastName: { contains: params.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        accountType: true,
        createdAt: true,
        staffProfile: { select: { status: true, role: { select: { id: true, name: true } } } },
        _count: {
          select: {
            refreshTokens: true,
            submittedStations: true,
            cngApplications: true,
            reviews: true,
          },
        },
      },
    });
    const hasMore = users.length > limit;
    if (hasMore) users.pop();
    return {
      users: users.map((user) => ({ ...user, email: this.maskEmail(user.email) })),
      nextCursor: hasMore ? (users[users.length - 1]?.id ?? null) : null,
    };
  }

  async reviews(params: { cursor?: string; limit?: number }) {
    const limit = Math.min(params.limit ?? 25, 100);
    const rows = await this.prisma.review.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: { station: { select: { id: true, name: true } } },
    });
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    return { reviews: rows, nextCursor: hasMore ? (rows[rows.length - 1]?.id ?? null) : null };
  }

  async moderateReview(id: string, restore: boolean, reason: string, context: AuditContext) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.review.update({
        where: { id },
        data: { deletedAt: restore ? null : new Date() },
      });
      await this.audit.create(
        context,
        {
          action: restore ? 'review.restored' : 'review.soft_deleted',
          targetType: 'review',
          targetId: id,
          reason,
          beforeSummary: { deleted: Boolean(review.deletedAt) },
          afterSummary: { deleted: Boolean(updated.deletedAt) },
        },
        tx,
      );
      return updated;
    });
  }

  settings() {
    return {
      timezone: 'Africa/Lagos',
      paymentsEnabled: false,
      documentAccessMode: 'AUDITED_STEP_UP',
      publicStationRule: 'APPROVED_AND_ACTIVE',
      secretsVisible: false,
    };
  }
  private maskEmail(email: string) {
    const [name, domain] = email.split('@');
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
  }
}
