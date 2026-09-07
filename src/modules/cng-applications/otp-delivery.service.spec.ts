import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpDeliveryService } from './otp-delivery.service';

describe('OtpDeliveryService', () => {
  it('never returns a verification code in production without a provider', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'NODE_ENV' ? 'production' : fallback,
      ),
    };
    const service = new OtpDeliveryService(config as unknown as ConfigService);

    await expect(service.send('+2348012345678', '123456')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns a development code only in an explicit non-production environment', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'NODE_ENV' ? 'test' : fallback,
      ),
    };
    const service = new OtpDeliveryService(config as unknown as ConfigService);

    await expect(service.send('+2348012345678', '123456')).resolves.toEqual({
      developmentCode: '123456',
    });
  });
});
