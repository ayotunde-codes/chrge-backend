import { ConfigService } from '@nestjs/config';
import {
  decryptStaffMfaSecret,
  encryptStaffMfaSecret,
  generateRecoveryCodes,
  generateStaffMfaSecret,
  staffOtpAuthUri,
  verifyStaffTotp,
} from './staff-mfa';

describe('staff MFA helpers', () => {
  const values: Record<string, string> = {
    ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    RECOVERY_CODE_PEPPER: 'test-recovery-pepper-that-is-not-production',
  };
  const config = { getOrThrow: (name: string) => values[name] } as ConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('encrypts secrets with an authenticated envelope', () => {
    const secret = generateStaffMfaSecret();
    const encrypted = encryptStaffMfaSecret(config, secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptStaffMfaSecret(config, encrypted)).toBe(secret);
    expect(staffOtpAuthUri('admin@example.com', secret)).toContain(`secret=${secret}&issuer=CHRGE`);
  });

  it('verifies a known RFC 6238 TOTP vector with the six-digit policy', () => {
    jest.spyOn(Date, 'now').mockReturnValue(59_000);
    expect(verifyStaffTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082')).toBe(true);
    expect(verifyStaffTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '000000')).toBe(false);
  });

  it('returns ten one-time recovery codes and stores only hashes', () => {
    const recovery = generateRecoveryCodes(config);
    expect(recovery.plain).toHaveLength(10);
    expect(recovery.hashes).toHaveLength(10);
    expect(recovery.hashes[0]).not.toContain(recovery.plain[0]);
  });
});
