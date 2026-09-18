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

  it('can read old encrypted identities and OTP hashes during a key rotation', () => {
    const oldConfig = {
      get: (name: string) =>
        name === 'CNG_APPLICATION_ENCRYPTION_KEY' ? 'old-cng-key-material' : 'production',
      getOrThrow: () => 'old-cng-key-material',
    } as unknown as ConfigService;
    const oldService = new SensitiveDataService(oldConfig);
    const encrypted = oldService.encrypt('12345678901');
    const oldHash = oldService.hash('application:phone:code');

    const rotatedConfig = {
      get: (name: string) => {
        if (name === 'CNG_APPLICATION_ENCRYPTION_KEY') return 'new-cng-key-material';
        if (name === 'CNG_APPLICATION_PREVIOUS_ENCRYPTION_KEY') return 'old-cng-key-material';
        return 'production';
      },
      getOrThrow: () => 'new-cng-key-material',
    } as unknown as ConfigService;
    const rotatedService = new SensitiveDataService(rotatedConfig);

    expect(rotatedService.decrypt(encrypted)).toBe('12345678901');
    expect(rotatedService.matchesHash('application:phone:code', oldHash)).toBe(true);
    expect(oldService.matchesHash('application:phone:code', rotatedService.hash('application:phone:code'))).toBe(false);
    expect(rotatedService.decrypt(rotatedService.encrypt('98765432109'))).toBe('98765432109');
    const [iv, tag, ciphertext] = encrypted.split('.');
    const tampered = Buffer.from(ciphertext, 'base64url');
    tampered[0] ^= 1;
    expect(() => rotatedService.decrypt(`${iv}.${tag}.${tampered.toString('base64url')}`)).toThrow();
  });
});
