import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CngApplicationAccessGuard } from './cng-application-access.guard';
import { SensitiveDataService } from './sensitive-data.service';

describe('CngApplicationAccessGuard', () => {
  const application = {
    id: '4ca36a47-793c-4e20-8ceb-199a99de9c80',
    userId: 'user-123',
    accessTokenHash: 'stored-hash',
  };
  const prisma = {
    cngApplication: { findUnique: jest.fn() },
  };
  const sensitiveData = {
    matchesAccessToken: jest.fn(),
  };

  let guard: CngApplicationAccessGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.cngApplication.findUnique.mockResolvedValue(application);
    guard = new CngApplicationAccessGuard(
      prisma as unknown as PrismaService,
      sensitiveData as unknown as SensitiveDataService,
    );
  });

  it('allows the authenticated application owner', async () => {
    const request = makeRequest({ user: { sub: 'user-123', role: 'USER' } });

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('allows anonymous access with the one-time application token', async () => {
    sensitiveData.matchesAccessToken.mockReturnValue(true);
    const request = makeRequest({ headers: { 'x-application-token': 'application-token' } });

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('allows administrative reviewers', async () => {
    const request = makeRequest({ user: { sub: 'admin-123', role: 'ADMIN' } });

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('rejects requests without ownership or a valid application token', async () => {
    sensitiveData.matchesAccessToken.mockReturnValue(false);
    const request = makeRequest({});

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(UnauthorizedException);
  });
});

function makeRequest(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    params: { id: '4ca36a47-793c-4e20-8ceb-199a99de9c80' },
    headers: {},
    ...overrides,
  };
}

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
