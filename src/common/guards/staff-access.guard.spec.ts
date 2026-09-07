import { UnauthorizedException } from '@nestjs/common';
import { StaffAccessGuard } from './staff-access.guard';

const context = (user: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;

describe('StaffAccessGuard', () => {
  const prisma = { staffProfile: { findUnique: jest.fn() } };
  const guard = new StaffAccessGuard(
    prisma as never,
    { get: jest.fn().mockReturnValue('test') } as never,
  );
  afterEach(() => jest.clearAllMocks());

  it.each([
    [
      'consumer audience',
      { sub: 'u1', role: 'USER', audience: 'chrge-consumer', mfa: false, environment: 'test' },
    ],
    [
      'wrong audience',
      { sub: 'u1', role: 'ADMIN', audience: 'chrge-consumer', mfa: true, environment: 'test' },
    ],
    [
      'staff without completed MFA',
      { sub: 'u1', role: 'ADMIN', audience: 'chrge-admin', mfa: false, environment: 'test' },
    ],
    [
      'cross-environment token',
      { sub: 'u1', role: 'ADMIN', audience: 'chrge-admin', mfa: true, environment: 'production' },
    ],
  ])('rejects %s', async (_label, principal) => {
    await expect(guard.canActivate(context(principal))).rejects.toThrow(UnauthorizedException);
    expect(prisma.staffProfile.findUnique).not.toHaveBeenCalled();
  });

  it('rejects suspended staff even with an admin-audience MFA token', async () => {
    prisma.staffProfile.findUnique.mockResolvedValue({
      status: 'SUSPENDED',
      mfaEnabledAt: new Date(),
      role: { id: 'ADMIN' },
    });
    await expect(
      guard.canActivate(
        context({ sub: 'u1', audience: 'chrge-admin', mfa: true, environment: 'test' }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('loads the server-controlled role for active MFA-enrolled staff', async () => {
    const principal = {
      sub: 'u1',
      role: 'USER',
      audience: 'chrge-admin',
      mfa: true,
      environment: 'test',
    };
    prisma.staffProfile.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      mfaEnabledAt: new Date(),
      role: { id: 'OPERATOR' },
    });
    await expect(guard.canActivate(context(principal))).resolves.toBe(true);
    expect(principal.role).toBe('OPERATOR');
  });
});
