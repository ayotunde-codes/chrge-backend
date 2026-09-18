import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CngAvailabilityStatus,
  Prisma,
  StationAssociationRole,
  StationAssociationStatus,
  StationConditionSource,
  StationType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ListEligibleStationsDto,
  ReportHistoryQueryDto,
  RequestStationAssociationDto,
  SubmitStationConditionDto,
} from './dto/station-portal.dto';
import { CngEmailNotificationsService } from './cng-email-notifications.service';

@Injectable()
export class StationPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: CngEmailNotificationsService,
  ) {}

  async listEligibleStations(dto: ListEligibleStationsDto) {
    const where: Prisma.StationWhereInput = {
      isActive: true,
      deletedAt: null,
      status: 'APPROVED',
      stationType: { in: [StationType.CNG, StationType.HYBRID] },
      ...(dto.state ? { state: { equals: dto.state, mode: 'insensitive' } } : {}),
      ...(dto.city ? { city: { equals: dto.city, mode: 'insensitive' } } : {}),
      ...(dto.search
        ? {
            OR: [
              { name: { contains: dto.search, mode: 'insensitive' } },
              { address: { contains: dto.search, mode: 'insensitive' } },
              { city: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [stations, total] = await this.prisma.$transaction([
      this.prisma.station.findMany({
        where,
        select: { id: true, name: true, address: true, city: true, state: true },
        orderBy: { name: 'asc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
      this.prisma.station.count({ where }),
    ]);
    return { data: stations, pagination: { page: dto.page, limit: dto.limit, total } };
  }

  async requestAssociation(userId: string, dto: RequestStationAssociationDto) {
    const station = await this.prisma.station.findFirst({
      where: {
        id: dto.stationId,
        isActive: true,
        deletedAt: null,
        status: 'APPROVED',
        stationType: { in: [StationType.CNG, StationType.HYBRID] },
      },
    });
    if (!station) throw new NotFoundException('Eligible CNG station not found');

    const existing = await this.prisma.stationAssociation.findUnique({
      where: { stationId_userId: { stationId: dto.stationId, userId } },
    });
    if (existing?.status === StationAssociationStatus.PENDING) {
      throw new ConflictException('A pending association request already exists');
    }
    if (existing?.status === StationAssociationStatus.APPROVED) {
      throw new ConflictException('You are already approved for this station');
    }
    if (existing?.status === StationAssociationStatus.SUSPENDED) {
      throw new ForbiddenException('Your station access is suspended');
    }

    return this.prisma.stationAssociation.upsert({
      where: { stationId_userId: { stationId: dto.stationId, userId } },
      create: { stationId: dto.stationId, userId },
      update: { status: StationAssociationStatus.PENDING, approvedAt: null, approvedBy: null },
      select: { id: true, stationId: true, userId: true, role: true, status: true, createdAt: true },
    });
  }

  async getMyStation(userId: string) {
    const association = await this.getApprovedAssociation(userId);
    const { station } = association;
    return {
      station: this.mapStation(station),
      association: { id: association.id, status: association.status, role: association.role },
    };
  }

  async getMyAssociations(userId: string) {
    return this.prisma.stationAssociation.findMany({
      where: { userId },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        approvedAt: true,
        station: {
          select: { id: true, name: true, address: true, city: true, state: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getHistory(userId: string, stationId: string, query: ReportHistoryQueryDto) {
    await this.assertApprovedStationAccess(userId, stationId);
    const where = { stationId };
    const [reports, total] = await this.prisma.$transaction([
      this.prisma.stationConditionReport.findMany({
        where,
        include: { reporter: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { reportedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.stationConditionReport.count({ where }),
    ]);
    return {
      data: reports.map((report) => this.mapReport(report)),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async submitReport(userId: string, stationId: string, dto: SubmitStationConditionDto) {
    await this.assertApprovedStationAccess(userId, stationId);
    return this.persistReport(userId, stationId, dto, StationConditionSource.STATION_PORTAL);
  }

  async submitAdminReport(adminId: string, stationId: string, dto: SubmitStationConditionDto) {
    return this.persistReport(adminId, stationId, dto, StationConditionSource.ADMIN);
  }

  async getStationManagement(stationId: string) {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, deletedAt: null },
    });
    if (!station) throw new NotFoundException('Station not found');
    const [manager, reports] = await Promise.all([
      this.prisma.stationAssociation.findFirst({
        where: {
          stationId,
          role: StationAssociationRole.MANAGER,
          status: StationAssociationStatus.APPROVED,
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, emailVerified: true } },
        },
        orderBy: { approvedAt: 'desc' },
      }),
      this.prisma.stationConditionReport.findMany({
        where: { stationId },
        include: { reporter: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { reportedAt: 'desc' },
        take: 10,
      }),
    ]);
    return {
      station: this.mapStation(station),
      manager,
      recentReports: reports.map((report) => this.mapReport(report)),
    };
  }

  async assignManager(adminId: string, stationId: string, userId: string) {
    const [station, user] = await Promise.all([
      this.prisma.station.findFirst({
        where: {
          id: stationId,
          deletedAt: null,
          isActive: true,
          status: 'APPROVED',
          stationType: { in: [StationType.CNG, StationType.HYBRID] },
        },
      }),
      this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } }),
    ]);
    if (!station) throw new BadRequestException('Only approved active CNG stations can have a manager');
    if (!user) throw new NotFoundException('CHRGE user not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.stationAssociation.updateMany({
        where: {
          stationId,
          role: StationAssociationRole.MANAGER,
          status: StationAssociationStatus.APPROVED,
          userId: { not: userId },
        },
        data: { status: StationAssociationStatus.SUSPENDED },
      });
      return tx.stationAssociation.upsert({
        where: { stationId_userId: { stationId, userId } },
        create: {
          stationId,
          userId,
          role: StationAssociationRole.MANAGER,
          status: StationAssociationStatus.APPROVED,
          approvedBy: adminId,
          approvedAt: new Date(),
        },
        update: {
          role: StationAssociationRole.MANAGER,
          status: StationAssociationStatus.APPROVED,
          approvedBy: adminId,
          approvedAt: new Date(),
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, emailVerified: true } },
        },
      });
    });
  }

  private async persistReport(
    userId: string,
    stationId: string,
    dto: SubmitStationConditionDto,
    source: StationConditionSource,
  ) {
    const existing = await this.prisma.stationConditionReport.findUnique({
      where: { reportedBy_idempotencyKey: { reportedBy: userId, idempotencyKey: dto.idempotencyKey } },
      include: { reporter: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (existing) return { changed: true, duplicate: true, report: this.mapReport(existing) };

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "stations" WHERE "id" = ${stationId} FOR UPDATE`;
      const station = await tx.station.findUnique({ where: { id: stationId } });
      if (!station || !station.isActive || station.deletedAt) {
        throw new BadRequestException('Station reporting is disabled');
      }

      const availability = dto.availability as CngAvailabilityStatus;
      const sameState =
        station.currentCngAvailability === availability &&
        station.currentQueueLength === dto.estimatedQueueLength &&
        Number(station.currentPressureBar) === dto.pumpPressureBar;
      if (sameState) {
        return {
          changed: false,
          duplicate: false,
          message: 'Station conditions are already current',
          station: this.mapStation(station),
        };
      }

      const availabilityChanged = station.currentCngAvailability !== availability;
      const now = new Date();
      const report = await tx.stationConditionReport.create({
        data: {
          stationId,
          availability,
          estimatedQueueLength: dto.estimatedQueueLength,
          pumpPressureBar: new Prisma.Decimal(dto.pumpPressureBar),
          reportedBy: userId,
          source,
          idempotencyKey: dto.idempotencyKey,
        },
        include: { reporter: { select: { firstName: true, lastName: true, email: true } } },
      });

      if (availabilityChanged) {
        await tx.stationAvailabilityEvent.updateMany({
          where: { stationId, endedAt: null },
          data: { endedAt: now },
        });
        await tx.stationAvailabilityEvent.create({
          data: { stationId, status: availability, startedAt: now, updatedBy: userId, source },
        });
      }

      const updatedStation = await tx.station.update({
        where: { id: stationId },
        data: {
          currentCngAvailability: availability,
          currentQueueLength: dto.estimatedQueueLength,
          currentPressureBar: new Prisma.Decimal(dto.pumpPressureBar),
          cngStatusUpdatedAt: now,
          cngStatusUpdatedBy: userId,
          lastStatusUpdate: now,
        },
      });

      await tx.cngNotificationEvent.create({
        data: {
          conditionReportId: report.id,
          kind: 'TEAM_STATUS_UPDATE',
          recipientScope: 'team',
          deduplicationKey: `team-status:${report.id}`,
        },
      });

      if (availabilityChanged && availability === CngAvailabilityStatus.AVAILABLE) {
        await tx.cngNotificationEvent.create({
          data: {
            conditionReportId: report.id,
            kind: 'FAVORITE_STATION_AVAILABLE',
            recipientScope: `station-favorites:${stationId}`,
            deduplicationKey: `favorite-available:${report.id}`,
          },
        });
      }

      return {
        changed: true,
        duplicate: false,
        report: this.mapReport(report),
        station: this.mapStation(updatedStation),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.changed && !result.duplicate && result.report?.id) {
      return { ...result, notifications: await this.notifications.deliverReportNotifications(result.report.id) };
    }
    return result;
  }

  async listAssociations(status?: StationAssociationStatus) {
    return this.prisma.stationAssociation.findMany({
      where: status ? { status } : undefined,
      include: {
        station: { select: { id: true, name: true, address: true, city: true, state: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewAssociation(adminId: string, associationId: string, decision: 'APPROVED' | 'REJECTED' | 'SUSPENDED') {
    const association = await this.prisma.stationAssociation.findUnique({ where: { id: associationId } });
    if (!association) throw new NotFoundException('Station association not found');
    return this.prisma.stationAssociation.update({
      where: { id: associationId },
      data: {
        status: decision,
        approvedBy: decision === 'APPROVED' ? adminId : association.approvedBy,
        approvedAt: decision === 'APPROVED' ? new Date() : association.approvedAt,
      },
    });
  }

  private async getApprovedAssociation(userId: string) {
    const association = await this.prisma.stationAssociation.findFirst({
      where: { userId, status: StationAssociationStatus.APPROVED },
      include: { station: true },
      orderBy: { approvedAt: 'asc' },
    });
    if (!association) throw new ForbiddenException('No approved station association');
    if (!association.station.isActive || association.station.deletedAt) {
      throw new ForbiddenException('Station reporting is disabled');
    }
    return association;
  }

  private async assertApprovedStationAccess(userId: string, stationId: string) {
    const association = await this.prisma.stationAssociation.findFirst({
      where: { userId, stationId, status: StationAssociationStatus.APPROVED },
      include: { station: true },
    });
    if (!association) throw new ForbiddenException('You cannot manage this station');
    if (!association.station.isActive || association.station.deletedAt) {
      throw new ForbiddenException('Station reporting is disabled');
    }
    return association;
  }

  private mapStation(station: {
    id: string; name: string; address: string; city: string; state: string; timezone: string;
    currentCngAvailability: CngAvailabilityStatus; currentQueueLength: number | null;
    currentPressureBar: Prisma.Decimal | null; cngStatusUpdatedAt: Date | null; cngStatusUpdatedBy: string | null;
  }) {
    return {
      id: station.id,
      name: station.name,
      address: station.address,
      city: station.city,
      state: station.state,
      timezone: station.timezone,
      currentCondition: {
        availability: station.currentCngAvailability,
        estimatedQueueLength: station.currentQueueLength,
        pumpPressureBar: station.currentPressureBar === null ? null : Number(station.currentPressureBar),
        reportedAt: station.cngStatusUpdatedAt,
        reportedById: station.cngStatusUpdatedBy,
      },
    };
  }

  private mapReport(report: {
    id: string; availability: CngAvailabilityStatus; estimatedQueueLength: number;
    pumpPressureBar: Prisma.Decimal; reportedAt: Date;
    source?: StationConditionSource;
    reporter: { firstName: string | null; lastName: string | null; email: string };
  }) {
    const fullName = [report.reporter.firstName, report.reporter.lastName].filter(Boolean).join(' ');
    return {
      id: report.id,
      availability: report.availability,
      estimatedQueueLength: report.estimatedQueueLength,
      pumpPressureBar: Number(report.pumpPressureBar),
      reportedAt: report.reportedAt,
      reportedBy: fullName || report.reporter.email,
      source: report.source ?? StationConditionSource.STATION_PORTAL,
    };
  }
}
