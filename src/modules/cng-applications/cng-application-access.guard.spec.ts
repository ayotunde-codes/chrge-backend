import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CngApplicationAccessGuard } from './cng-application-access.guard';

describe('CngApplicationAccessGuard', () => {
  const application = {
    id: '4ca36a47-793c-4e20-8ceb-199a99de9c80',
    userId: 'user-123',
  };
  const prisma = {
    cngApplication: { findUnique: jest.fn() },
  };
  let guard: CngApplicationAccessGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.cngApplication.findUnique.mockResolvedValue(application);
    guard = new CngApplicationAccessGuard(prisma as unknown as PrismaService);
  });

  it('allows the authenticated application owner', async () => {
    const request = makeRequest({ user: { sub: 'user-123', role: 'USER' } });

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('rejects a different authenticated user, including an administrator', async () => {
    const request = makeRequest({ user: { sub: 'admin-123', role: 'ADMIN' } });

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
  });

  it('rejects an application token when the signed-in user is not the owner', async () => {
    const request = makeRequest({
      user: { sub: 'other-user', role: 'USER' },
      headers: { 'x-application-token': 'legacy-application-token' },
    });

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
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
