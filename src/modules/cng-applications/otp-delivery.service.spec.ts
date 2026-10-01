import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpDeliveryService } from './otp-delivery.service';

describe('OtpDeliveryService', () => {
  const values: Record<string, string | undefined> = {};
  const config = {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(values).forEach((key) => delete values[key]);
  });

  it('keeps delivery quarantined unless explicitly enabled', async () => {
    const service = new OtpDeliveryService(config as unknown as ConfigService);

    await expect(service.send('+2348012345678', '123456')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns the code only for an explicitly allow-listed staging recipient', async () => {
    values.CNG_OTP_DELIVERY_ENABLED = 'true';
    values.NODE_ENV = 'production';
    values.CHRGE_ENV = 'staging';
    values.CNG_OTP_TEST_RECIPIENTS = '+2348012345678,+2348098765432';
    const service = new OtpDeliveryService(config as unknown as ConfigService);

    await expect(service.send('+2348012345678', '123456')).resolves.toEqual({
      developmentCode: '123456',
    });
    await expect(service.send('+2347000000000', '123456')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('sends the generated code through the configured Termii transactional route', async () => {
    values.CNG_OTP_DELIVERY_ENABLED = 'true';
    values.TERMII_BASE_URL = 'https://example.termii.test';
    values.TERMII_API_KEY = 'secret-api-key';
    values.TERMII_SENDER_ID = 'CHRGE';
    values.TERMII_CHANNEL = 'dnd';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    const service = new OtpDeliveryService(config as unknown as ConfigService);

    await expect(service.send('+2348012345678', '654321')).resolves.toEqual({});
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.termii.test/api/sms/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('654321'),
      }),
    );
    expect(fetchMock.mock.calls[0][1]?.body).toContain('2348012345678');
    expect(fetchMock.mock.calls[0][1]?.body).toContain('"channel":"dnd"');
    fetchMock.mockRestore();
  });

  it('reports provider failures without logging the phone or code', async () => {
    values.CNG_OTP_DELIVERY_ENABLED = 'true';
    values.CNG_OTP_WEBHOOK_URL = 'https://sms.example.test/send';
    values.NODE_ENV = 'production';
    const service = new OtpDeliveryService(config as unknown as ConfigService);
    const errorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 503 } as Response);

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
