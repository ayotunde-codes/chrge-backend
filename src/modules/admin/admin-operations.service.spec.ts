import { AdminOperationsService } from './admin-operations.service';

describe('AdminOperationsService notifications', () => {
  const readAt = new Date('2026-09-08T08:00:00.000Z');
  const prisma = {
    staffProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    station: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    cngApplication: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const audit = { create: jest.fn() };
  const service = new AdminOperationsService(prisma as never, audit as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a merged, newest-first actionable feed with an unread count', async () => {
    prisma.staffProfile.findUnique.mockResolvedValue({ notificationsReadAt: readAt });
    prisma.station.findMany.mockResolvedValue([
      {
        id: 'station-1',
        name: 'Lekki CNG',
        city: 'Lekki',
        state: 'Lagos',
        createdAt: new Date('2026-09-08T08:03:00.000Z'),
      },
    ]);
    prisma.cngApplication.findMany.mockResolvedValue([
      {
        id: 'application-1',
        reference: 'CNG-2026-001',
        status: 'SUBMITTED',
        submittedAt: new Date('2026-09-08T08:05:00.000Z'),
        createdAt: new Date('2026-09-08T07:00:00.000Z'),
      },
    ]);
    prisma.station.count.mockResolvedValue(1);
    prisma.cngApplication.count.mockResolvedValue(1);

    const result = await service.notifications('staff-1');

    expect(result.unreadCount).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(['cng:application-1', 'station:station-1']);
    expect(result.items.every((item) => item.unread)).toBe(true);
  });

  it('stores the staff read cursor and records an audit event', async () => {
    prisma.staffProfile.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    audit.create.mockResolvedValue({});

    const result = await service.markNotificationsRead('staff-1', {
      actorId: 'staff-1',
      requestId: 'request-1',
    });

    expect(result.readAt).toBeInstanceOf(Date);
    expect(prisma.staffProfile.update).toHaveBeenCalledWith({
      where: { userId: 'staff-1' },
      data: { notificationsReadAt: result.readAt },
    });
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'staff-1' }),
      expect.objectContaining({ action: 'staff.notifications_read' }),
      prisma,
    );
  });
});
