import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ResendEmailService } from './resend-email.service';
import { StaffInvitationsService } from './staff-invitations.service';

describe('StaffInvitationsService staff access controls', () => {
  const update = jest.fn();
  const updateMany = jest.fn();
  const createAudit = jest.fn();
  const findUnique = jest.fn();
  const transaction = jest.fn(async (work: (client: unknown) => Promise<unknown>) =>
    work({ staffProfile: { update }, refreshToken: { updateMany } }),
  );
  const prisma = {
    staffProfile: { findUnique },
    $transaction: transaction,
  } as unknown as PrismaService;
  const audit = { create: createAudit } as unknown as AuditService;
  const service = new StaffInvitationsService(
    prisma,
    { get: jest.fn() } as unknown as ConfigService,
    audit,
    { isConfigured: jest.fn() } as unknown as ResendEmailService,
  );
  const context = {
    actorId: 'super-admin-id',
    actorRole: 'ADMIN' as const,
    requestId: 'request-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({
      userId: 'staff-id',
      status: 'ACTIVE',
      role: { id: 'OPERATOR', name: 'Operator', isTopLevel: false },
    });
  });

  it('disables non-top-level staff, clears MFA and revokes admin sessions', async () => {
    await expect(service.disableAccount('staff-id', context)).resolves.toEqual({ disabled: true });
    expect(update).toHaveBeenCalledWith({
      where: { userId: 'staff-id' },
      data: expect.objectContaining({
        status: 'DISABLED',
        mfaSecretEncrypted: null,
        mfaEnabledAt: null,
      }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'staff-id', audience: 'chrge-admin', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(createAudit).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ action: 'staff.account_disabled', targetId: 'staff-id' }),
      expect.any(Object),
    );
  });

  it('never allows a super administrator to disable their own account', async () => {
    await expect(service.disableAccount('super-admin-id', context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
