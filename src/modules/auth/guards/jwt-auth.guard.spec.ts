import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const context = (path: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ path }) }) }) as never;

describe('JwtAuthGuard audience isolation', () => {
  const guard = new JwtAuthGuard({ getAllAndOverride: jest.fn() } as never);
  it('rejects a consumer token on an admin route', () => {
    expect(() =>
      guard.handleRequest(
        null,
        { sub: 'u1', audience: 'chrge-consumer' },
        undefined,
        context('/api/v1/admin/stations'),
      ),
    ).toThrow(UnauthorizedException);
  });
  it('rejects an admin token on a consumer mutation', () => {
    expect(() =>
      guard.handleRequest(
        null,
        { sub: 's1', audience: 'chrge-admin' },
        undefined,
        context('/api/v1/stations/submit'),
      ),
    ).toThrow(UnauthorizedException);
  });
  it('accepts matching audiences', () => {
    const principal = { sub: 's1', audience: 'chrge-admin' };
    expect(guard.handleRequest(null, principal, undefined, context('/api/v1/admin/stations'))).toBe(
      principal,
    );
  });
});
