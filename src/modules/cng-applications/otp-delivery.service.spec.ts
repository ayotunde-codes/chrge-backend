import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpDeliveryService } from './otp-delivery.service';

describe('OtpDeliveryService', () => {
  it('keeps delivery quarantined unless explicitly enabled', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'CNG_OTP_DELIVERY_ENABLED' ? 'false' : fallback,
      ),
    };
    const service = new OtpDeliveryService(config as unknown as ConfigService);

    await expect(service.send('+2348012345678', '123456')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('never returns a verification code in production without a provider', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'CNG_OTP_DELIVERY_ENABLED') return 'true';
        return key === 'NODE_ENV' ? 'production' : fallback;
      }),
    };
    const service = new OtpDeliveryService(config as unknown as ConfigService);

    await expect(service.send('+2348012345678', '123456')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns a development code only in an explicit non-production environment', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'CNG_OTP_DELIVERY_ENABLED') return 'true';
        return key === 'NODE_ENV' ? 'test' : fallback;
      }),
    };
    const service = new OtpDeliveryService(config as unknown as ConfigService);

    await expect(service.send('+2348012345678', '123456')).resolves.toEqual({
      developmentCode: '123456',
    });
  });

  it('reports provider failures without logging the phone or code', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'CNG_OTP_DELIVERY_ENABLED') return 'true';
        if (key === 'CNG_OTP_WEBHOOK_URL') return 'https://sms.example.test/send';
        if (key === 'NODE_ENV') return 'production';
        return fallback;
      }),
    };
    const service = new OtpDeliveryService(config as unknown as ConfigService);
    const errorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(service.send('+2348012345678', '123456')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const logMessage = errorSpy.mock.calls.flat().join(' ');
    expect(logMessage).toContain('status=503');
    expect(logMessage).not.toContain('+2348012345678');
    expect(logMessage).not.toContain('123456');

    fetchSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
