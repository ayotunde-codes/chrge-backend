import { ConfigService } from '@nestjs/config';
import { CngNotificationKind, CngNotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendEmailService } from '../auth/resend-email.service';
import { CngEmailNotificationsService } from './cng-email-notifications.service';

describe('CngEmailNotificationsService', () => {
  const prisma = {
    stationConditionReport: { findUnique: jest.fn() },
    favorite: { findMany: jest.fn() },
    station: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    cngNotificationEvent: { create: jest.fn(), update: jest.fn() },
  };
  const config = { get: jest.fn((name: string) => name === 'CNG_TEAM_NOTIFICATION_EMAIL' ? 'team@gocharge.com' : undefined) };
  const email = {
    sendCngTeamStatusUpdate: jest.fn(),
    sendFavoriteStationAvailable: jest.fn(),
    sendCngNetworkDigest: jest.fn(),
  };
  const service = new CngEmailNotificationsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    email as unknown as ResendEmailService,
  );
  const station = {
    id: 'station-1', name: 'NIPCO Abuja', address: 'Mabushi', city: 'Abuja', state: 'FCT Abuja',
    currentCngAvailability: 'AVAILABLE', currentQueueLength: 3,
    currentPressureBar: new Prisma.Decimal(200), cngStatusUpdatedAt: new Date('2026-09-18T10:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.cngNotificationEvent.update.mockResolvedValue({});
    email.sendCngTeamStatusUpdate.mockResolvedValue({ messageId: 'team-message' });
    email.sendFavoriteStationAvailable.mockResolvedValue({ messageId: 'favorite-message' });
    email.sendCngNetworkDigest.mockResolvedValue({ messageId: 'digest-message' });
  });

  it('sends every published report to the configured internal team address', async () => {
    prisma.stationConditionReport.findUnique.mockResolvedValue({
      id: 'report-1', stationId: station.id, station,
      reporter: { firstName: 'Joshua', lastName: null, email: 'joshua@example.com' },
      notifications: [{ id: 'team-event', kind: CngNotificationKind.TEAM_STATUS_UPDATE }],
    });
    const result = await service.deliverReportNotifications('report-1');
    expect(email.sendCngTeamStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({
      to: 'team@gocharge.com', reportId: 'report-1', station: expect.objectContaining({ queueLength: 3, pressureBar: 200 }),
    }));
    expect(prisma.cngNotificationEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'team-event' }, data: expect.objectContaining({ status: CngNotificationStatus.SENT }),
    }));
    expect(result.teamEmailSent).toBe(true);
  });

  it('sends the 2 PM snapshot to every verified active CHRGE user once', async () => {
    prisma.station.findMany.mockResolvedValue([station]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', email: 'one@example.com' }, { id: 'user-2', email: 'two@example.com' },
    ]);
    prisma.cngNotificationEvent.create
      .mockResolvedValueOnce({ id: 'digest-1' })
      .mockResolvedValueOnce({ id: 'digest-2' });
    const result = await service.sendScheduledNetworkDigest(new Date('2026-09-18T13:00:00Z'));
    expect(email.sendCngNetworkDigest).toHaveBeenCalledTimes(2);
    expect(email.sendCngNetworkDigest).toHaveBeenCalledWith(expect.objectContaining({
      asOfLabel: '14:00 WAT on 18/09/2026', stations: [expect.objectContaining({ availability: 'AVAILABLE' })],
    }));
    expect(result).toMatchObject({ recipients: 2, sent: 2, failed: 0, stations: 1 });
  });
});
