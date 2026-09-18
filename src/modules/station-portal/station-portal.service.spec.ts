import { ForbiddenException } from '@nestjs/common';
import { CngAvailabilityStatus, Prisma, StationAssociationStatus, StationConditionSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StationPortalService } from './station-portal.service';
import { CngEmailNotificationsService } from './cng-email-notifications.service';

describe('StationPortalService', () => {
  const prisma = {
    station: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    stationAssociation: { findFirst: jest.fn(), findMany: jest.fn() },
    stationConditionReport: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const notifications = { deliverReportNotifications: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const service = new StationPortalService(
    prisma as unknown as PrismaService,
    notifications as unknown as CngEmailNotificationsService,
    cache as unknown as import('cache-manager').Cache,
  );

  afterEach(() => jest.clearAllMocks());

  it('returns the approved representative station and its current conditions', async () => {
    prisma.stationAssociation.findFirst.mockResolvedValue({
      id: 'association-1',
      status: StationAssociationStatus.APPROVED,
      role: 'EMPLOYEE',
      approvedAt: new Date(),
      station: {
        id: 'station-1',
        name: 'Ewekoro CNG Station',
        address: 'Lagos–Abeokuta Expressway',
        city: 'Ewekoro',
        state: 'Ogun',
        timezone: 'Africa/Lagos',
        isActive: true,
        deletedAt: null,
        currentCngAvailability: CngAvailabilityStatus.AVAILABLE,
        currentQueueLength: 12,
        currentPressureBar: new Prisma.Decimal(205),
        cngStatusUpdatedAt: new Date('2026-09-17T08:42:00Z'),
        cngStatusUpdatedBy: 'user-1',
      },
    });

    const result = await service.getMyStation('user-1');

    expect(result.association.status).toBe(StationAssociationStatus.APPROVED);
    expect(result.station.currentCondition).toMatchObject({
      availability: CngAvailabilityStatus.AVAILABLE,
      estimatedQueueLength: 12,
      pumpPressureBar: 205,
    });
  });

  it('rejects station access when the representative is not approved', async () => {
    prisma.stationAssociation.findFirst.mockResolvedValue(null);

    await expect(service.getMyStation('user-1')).rejects.toThrow(ForbiddenException);
  });

  it('lists the signed-in representative own access requests', async () => {
    prisma.stationAssociation.findMany.mockResolvedValue([{ id: 'association-1', status: 'PENDING' }]);

    const result = await service.getMyAssociations('user-1');

    expect(result).toEqual([{ id: 'association-1', status: 'PENDING' }]);
    expect(prisma.stationAssociation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
    }));
  });

  it('returns the original report for a retried idempotent submission', async () => {
    prisma.stationAssociation.findFirst.mockResolvedValue({
      status: StationAssociationStatus.APPROVED,
      station: { isActive: true, deletedAt: null },
    });
    prisma.stationConditionReport.findUnique.mockResolvedValue({
      id: 'report-1',
      availability: CngAvailabilityStatus.UNAVAILABLE,
      estimatedQueueLength: 0,
      pumpPressureBar: new Prisma.Decimal(0),
      reportedAt: new Date('2026-09-17T09:00:00Z'),
      reporter: { firstName: 'Adeola', lastName: 'Musa', email: 'adeola@example.com' },
    });

    const result = await service.submitReport('user-1', 'station-1', {
      availability: 'UNAVAILABLE',
      estimatedQueueLength: 0,
      pumpPressureBar: 0,
      idempotencyKey: 'retry-key-123',
    });

    expect(result).toMatchObject({ changed: true, duplicate: true, report: { id: 'report-1' } });
  });

  it('marks an administrator report as admin-sourced', async () => {
    prisma.stationConditionReport.findUnique.mockResolvedValue({
      id: 'report-admin',
      availability: CngAvailabilityStatus.AVAILABLE,
      estimatedQueueLength: 3,
      pumpPressureBar: new Prisma.Decimal(200),
      source: StationConditionSource.ADMIN,
      reportedAt: new Date('2026-09-17T10:00:00Z'),
      reporter: { firstName: 'Admin', lastName: 'QA', email: 'admin@example.com' },
    });

    const result = await service.submitAdminReport('admin-1', 'station-1', {
      availability: 'AVAILABLE',
      estimatedQueueLength: 3,
      pumpPressureBar: 200,
      idempotencyKey: 'admin-key-123',
    });

    expect(result).toMatchObject({ report: { id: 'report-admin', source: StationConditionSource.ADMIN } });
  });

  it('replaces the active station manager and immediately approves the selected user', async () => {
    prisma.station.findFirst.mockResolvedValue({ id: 'station-1' });
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const upsert = jest.fn().mockResolvedValue({ id: 'association-2', status: 'APPROVED' });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      stationAssociation: { updateMany, upsert },
    }));

    const result = await service.assignManager('admin-1', 'station-1', 'user-2');

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ stationId: 'station-1', userId: { not: 'user-2' } }),
      data: { status: StationAssociationStatus.SUSPENDED },
    }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: StationAssociationStatus.APPROVED, approvedBy: 'admin-1' }),
    }));
    expect(result).toMatchObject({ id: 'association-2', status: 'APPROVED' });
  });
});
