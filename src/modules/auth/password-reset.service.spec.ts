import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendEmailService } from './resend-email.service';

describe('PasswordResetService', () => {
  const user = { id: 'user-1', email: 'user@example.com', firstName: 'Ada', deletedAt: null };
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    passwordResetChallenge: {
      deleteMany: jest.fn(), create: jest.fn(), delete: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const config = { getOrThrow: jest.fn(() => 'test-secret') };
  const email = { sendPasswordResetCode: jest.fn() };
  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === 'function') return operation(prisma);
      return Promise.all(operation as Promise<unknown>[]);
    });
    prisma.passwordResetChallenge.deleteMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    prisma.passwordResetChallenge.delete.mockResolvedValue({});
    prisma.passwordResetChallenge.update.mockResolvedValue({});
    prisma.passwordResetChallenge.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    email.sendPasswordResetCode.mockResolvedValue({ messageId: 'mail-1' });
    service = new PasswordResetService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      email as unknown as ResendEmailService,
    );
  });

  it('returns the same generic response for an unknown email without sending mail', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.request({ email: 'missing@example.com' })).resolves.toEqual({
      message: 'If an account exists for that email, a reset code has been sent.',
    });
    expect(email.sendPasswordResetCode).not.toHaveBeenCalled();
  });

  it('creates a short-lived challenge and sends a six-digit code', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    await service.request({ email: 'USER@example.com' });
    expect(prisma.passwordResetChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: user.id, codeHash: expect.any(String), expiresAt: expect.any(Date) }),
    });
    expect(email.sendPasswordResetCode).toHaveBeenCalledWith(expect.objectContaining({
      to: user.email,
      code: expect.stringMatching(/^\d{6}$/),
    }));
  });

  it('changes the password, consumes the challenge, and revokes all sessions', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: user.id, deletedAt: null });
    prisma.passwordResetChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1', userId: user.id,
      codeHash: createHmac('sha256', 'test-secret').update(`${user.id}:123456`).digest('hex'),
      attempts: 0, expiresAt: new Date(Date.now() + 60_000), consumedAt: null, createdAt: new Date(),
    });
    await expect(service.confirm({ email: user.email, code: '123456', newPassword: 'NewSecure8' }))
      .resolves.toEqual({ message: 'Password reset successfully. Sign in with your new password.' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { passwordHash: expect.stringContaining('$argon2id$') } });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it('rejects an invalid code after counting the attempt', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: user.id, deletedAt: null });
    prisma.passwordResetChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1', userId: user.id, codeHash: 'wrong', attempts: 0,
      expiresAt: new Date(Date.now() + 60_000), consumedAt: null, createdAt: new Date(),
    });
    await expect(service.confirm({ email: user.email, code: '123456', newPassword: 'NewSecure8' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.passwordResetChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' }, data: { attempts: { increment: 1 } },
    });
  });
});
