import { ForbiddenException } from '@nestjs/common';
import { CngAvailabilityStatus, Prisma, StationAssociationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StationPortalService } from './station-portal.service';

describe('StationPortalService', () => {
  const prisma = {
    stationAssociation: { findFirst: jest.fn() },
    stationConditionReport: { findUnique: jest.fn() },
  };
  const service = new StationPortalService(prisma as unknown as PrismaService);

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
});
