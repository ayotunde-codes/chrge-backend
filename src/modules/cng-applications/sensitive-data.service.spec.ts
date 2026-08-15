import { ConfigService } from '@nestjs/config';
import { SensitiveDataService } from './sensitive-data.service';

describe('SensitiveDataService', () => {
  const configService = {
    get: jest.fn().mockReturnValue('dedicated-encryption-key'),
    getOrThrow: jest.fn().mockReturnValue('jwt-fallback-key'),
  };

  it('encrypts and decrypts identity values without exposing plaintext', () => {
    const service = new SensitiveDataService(configService as unknown as ConfigService);
    const encrypted = service.encrypt('12345678901');

    expect(encrypted).not.toContain('12345678901');
    expect(service.decrypt(encrypted)).toBe('12345678901');
  });

  it('creates deterministic hashes and compares them safely', () => {
    const service = new SensitiveDataService(configService as unknown as ConfigService);
    const hash = service.hash('application-value');

    expect(service.hash('application-value')).toBe(hash);
    expect(service.matchesHash('application-value', hash)).toBe(true);
    expect(service.matchesHash('different-value', hash)).toBe(false);
  });

  it('uses a separate access-token hash', () => {
    const service = new SensitiveDataService(configService as unknown as ConfigService);
    const tokenHash = service.hashAccessToken('secret-application-token');

    expect(service.matchesAccessToken('secret-application-token', tokenHash)).toBe(true);
    expect(service.matchesAccessToken('wrong-token', tokenHash)).toBe(false);
  });
});
