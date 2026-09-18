import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { CngNotificationKind, CngNotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CngStationSnapshot, ResendEmailService } from '../auth/resend-email.service';

@Injectable()
export class CngEmailNotificationsService {
  private readonly logger = new Logger(CngEmailNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: ResendEmailService,
  ) {}

  async deliverReportNotifications(reportId: string) {
    const report = await this.prisma.stationConditionReport.findUnique({
      where: { id: reportId },
      include: {
        station: true,
        reporter: { select: { firstName: true, lastName: true, email: true } },
        notifications: true,
      },
    });
    if (!report) return { teamEmailSent: false, favoriteEmailsSent: 0 };
    const station = this.snapshot(report.station);
    const reporter = [report.reporter.firstName, report.reporter.lastName].filter(Boolean).join(' ') || report.reporter.email;
    const teamEvent = report.notifications.find((event) => event.kind === CngNotificationKind.TEAM_STATUS_UPDATE);
    let teamEmailSent = false;

    if (teamEvent) {
      try {
        const result = await this.email.sendCngTeamStatusUpdate({
          to: this.config.get<string>('CNG_TEAM_NOTIFICATION_EMAIL')?.trim() || 'team@gochrge.com',
          reportId,
          reporter,
          station,
        });
        await this.markSent(teamEvent.id, result.messageId);
        teamEmailSent = true;
      } catch (error) {
        await this.markFailed(teamEvent.id, error);
      }
    }

    let favoriteEmailsSent = 0;
    const favoriteEvent = report.notifications.find((event) => event.kind === CngNotificationKind.FAVORITE_STATION_AVAILABLE);
    if (favoriteEvent) {
      const favorites = await this.prisma.favorite.findMany({
        where: { stationId: report.stationId, user: { deletedAt: null, emailVerified: true } },
        include: { user: { select: { email: true } } },
      });
      try {
        for (const favorite of favorites) {
          await this.email.sendFavoriteStationAvailable({ to: favorite.user.email, reportId, station });
          favoriteEmailsSent += 1;
        }
        await this.markSent(favoriteEvent.id, `resend:${favoriteEmailsSent}`);
      } catch (error) {
        await this.markFailed(favoriteEvent.id, error);
      }
    }
    return { teamEmailSent, favoriteEmailsSent };
  }

  @Cron('0 0 9,14 * * *', { timeZone: 'Africa/Lagos' })
  async sendScheduledNetworkDigest(now = new Date()) {
    const lagosHour = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(now).reduce<Record<string, string>>((values, part) => ({ ...values, [part.type]: part.value }), {});
    const digestKey = `${lagosHour.year}-${lagosHour.month}-${lagosHour.day}T${lagosHour.hour}:00`;
    const asOfLabel = `${lagosHour.hour}:00 WAT on ${lagosHour.day}/${lagosHour.month}/${lagosHour.year}`;
    const [stations, users] = await Promise.all([
      this.prisma.station.findMany({
        where: { isActive: true, deletedAt: null, status: 'APPROVED', stationType: { in: ['CNG', 'HYBRID'] } },
        orderBy: [{ state: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: { deletedAt: null, emailVerified: true },
        select: { id: true, email: true },
      }),
    ]);
    const snapshots = stations.map((station) => this.snapshot(station));
    let sent = 0;
    let failed = 0;
    for (const user of users) {
      const deduplicationKey = `network-digest:${digestKey}:${user.id}`;
      let event: { id: string };
      try {
        event = await this.prisma.cngNotificationEvent.create({
          data: {
            kind: CngNotificationKind.NETWORK_DIGEST,
            recipientScope: `user:${user.id}`,
            deduplicationKey,
            status: CngNotificationStatus.PROCESSING,
            attemptCount: 1,
          },
          select: { id: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
      try {
        const result = await this.email.sendCngNetworkDigest({ to: user.email, digestKey, asOfLabel, stations: snapshots });
        await this.markSent(event.id, result.messageId);
        sent += 1;
      } catch (error) {
        await this.markFailed(event.id, error);
        failed += 1;
      }
    }
    this.logger.log(`CNG network digest ${digestKey}: sent=${sent} failed=${failed}`);
    return { digestKey, recipients: users.length, sent, failed, stations: snapshots.length };
  }

  private snapshot(station: {
    name: string; address: string; city: string; state: string;
    currentCngAvailability: string; currentQueueLength: number | null;
    currentPressureBar: Prisma.Decimal | null; cngStatusUpdatedAt: Date | null;
  }): CngStationSnapshot {
    return {
      name: station.name, address: station.address, city: station.city, state: station.state,
      availability: station.currentCngAvailability,
      queueLength: station.currentQueueLength,
      pressureBar: station.currentPressureBar == null ? null : Number(station.currentPressureBar),
      updatedAt: station.cngStatusUpdatedAt,
    };
  }

  private markSent(id: string, providerMessageId: string) {
    return this.prisma.cngNotificationEvent.update({
      where: { id },
      data: { status: CngNotificationStatus.SENT, providerMessageId, sentAt: new Date(), attemptCount: { increment: 1 }, lastError: null },
    });
  }

  private markFailed(id: string, error: unknown) {
    return this.prisma.cngNotificationEvent.update({
      where: { id },
      data: { status: CngNotificationStatus.FAILED, attemptCount: { increment: 1 }, lastError: error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed' },
    });
  }
}
