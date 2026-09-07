import { ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';

const station = {
  id: '8e9f1d31-d82d-41eb-a0c7-280944db2051',
  name: 'Community Station',
  latitude: 6.45,
  longitude: 3.4,
  status: 'PENDING',
  isActive: false,
  submissionRevision: 1,
};
const reviewer = {
  actorId: 'a026fd2a-8eb7-4283-adb4-c338b55bc5cf',
  actorRole: 'ADMIN' as const,
  requestId: 'request-1',
};

function setup(updateCount = 1) {
  const tx = {
    station: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ ...station, status: 'APPROVED', isActive: true }),
    },
  };
  const prisma = {
    station: { findUnique: jest.fn().mockResolvedValue(station) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { create: jest.fn() };
  const cache = { del: jest.fn() };
  return {
    service: new AdminService(prisma as never, audit as never, cache as never),
    prisma,
    tx,
    audit,
  };
}

describe('station moderation security', () => {
  it('approves once, rechecks duplicates, activates, and audits in one transaction', async () => {
    const { service, prisma, tx, audit } = setup();
    const result = await service.reviewStation(station.id, reviewer, {
      action: 'APPROVE',
      reason: 'Location and source evidence verified',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.station.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'APPROVED', isActive: true }),
      }),
    );
    expect(tx.station.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING', isActive: false }),
        data: expect.objectContaining({
          status: 'APPROVED',
          isActive: true,
          reviewedBy: reviewer.actorId,
        }),
      }),
    );
    expect(audit.create).toHaveBeenCalledWith(
      reviewer,
      expect.objectContaining({ action: 'station.approve', targetId: station.id }),
      tx,
    );
    expect(result.isActive).toBe(true);
  });

  it('fails a losing concurrent moderation attempt without a second audit', async () => {
    const { service, audit } = setup(0);
    await expect(
      service.reviewStation(station.id, reviewer, {
        action: 'APPROVE',
        reason: 'Verified evidence',
      }),
    ).rejects.toThrow(ConflictException);
    expect(audit.create).not.toHaveBeenCalled();
  });

  it('keeps rejection non-public', async () => {
    const { service, tx } = setup();
    await service.reviewStation(station.id, reviewer, {
      action: 'REJECT',
      reason: 'Duplicate evidence',
      rejectionReason: 'Already listed',
    });
    expect(tx.station.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', isActive: false }),
      }),
    );
  });
});
