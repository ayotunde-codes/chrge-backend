import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ResendEmailService } from './resend-email.service';
import { StaffInvitationsService } from './staff-invitations.service';

describe('StaffInvitationsService staff access controls', () => {
  const update = jest.fn();
  const updateMany = jest.fn();
  const deleteMany = jest.fn();
  const deleteUser = jest.fn();
  const count = jest.fn();
  const findUser = jest.fn();
  const createAudit = jest.fn();
  const findUnique = jest.fn();
  const transaction = jest.fn(async (work: (client: unknown) => Promise<unknown>) =>
    work({
      staffProfile: { update },
      refreshToken: { updateMany },
      staffInvitation: { deleteMany },
      user: { delete: deleteUser },
    }),
  );
  const prisma = {
    staffProfile: { findUnique },
    staffInvitation: { count },
    user: { findUnique: findUser },
    $transaction: transaction,
  } as unknown as PrismaService;
  const audit = { create: createAudit } as unknown as AuditService;
  const getConfig = jest.fn((name: string) => (name === 'CHRGE_ENV' ? 'staging' : undefined));
  const service = new StaffInvitationsService(
    prisma,
    { get: getConfig } as unknown as ConfigService,
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
    findUser.mockResolvedValue({
      id: 'staff-id',
      email: 'team@gochrge.com',
      staffProfile: {
        status: 'DISABLED',
        role: { id: 'OPERATOR', name: 'Operator', isTopLevel: false },
      },
    });
    count.mockResolvedValue(0);
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

  it('permanently deletes only a disabled staging test account and its invitation history', async () => {
    await expect(service.deleteStagingAccount('staff-id', context)).resolves.toEqual({
      deleted: true,
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { email: 'team@gochrge.com' } });
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: 'staff-id' } });
    expect(createAudit).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ action: 'staff.test_account_deleted', targetId: 'staff-id' }),
      expect.any(Object),
    );
  });

  it('never permanently deletes an active staff account', async () => {
    findUser.mockResolvedValueOnce({
      id: 'staff-id',
      email: 'team@gochrge.com',
      staffProfile: {
        status: 'ACTIVE',
        role: { id: 'OPERATOR', name: 'Operator', isTopLevel: false },
      },
    });
    await expect(service.deleteStagingAccount('staff-id', context)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
