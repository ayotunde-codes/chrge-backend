import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

export type OtpDeliveryResult = {
  developmentCode?: string;
};

@Injectable()
export class OtpDeliveryService {
  private readonly logger = new Logger(OtpDeliveryService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(phone: string, code: string): Promise<OtpDeliveryResult> {
    const deliveryEnabled =
      this.configService.get<string>('CNG_OTP_DELIVERY_ENABLED', 'false') === 'true';
    if (!deliveryEnabled) {
      this.logger.warn('CNG OTP delivery is disabled');
      throw new ServiceUnavailableException('Phone verification is temporarily unavailable');
    }

    const termiiBaseUrl = this.configService.get<string>('TERMII_BASE_URL')?.replace(/\/$/, '');
    const termiiApiKey = this.configService.get<string>('TERMII_API_KEY');
    if (termiiBaseUrl && termiiApiKey) {
      await this.sendWithTermii(termiiBaseUrl, termiiApiKey, phone, code);
      return {};
    }
    const webhookUrl = this.configService.get<string>('CNG_OTP_WEBHOOK_URL');
    const webhookToken = this.configService.get<string>('CNG_OTP_WEBHOOK_TOKEN');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (!webhookUrl) {
      const testRecipients = (this.configService.get<string>('CNG_OTP_TEST_RECIPIENTS') || '')
        .split(',')
        .map((recipient) => recipient.trim())
        .filter(Boolean);
      if (
        this.configService.get<string>('CHRGE_ENV') === 'staging' &&
        testRecipients.includes(phone)
      ) {
        this.logger.warn('CNG OTP delivery is using the staging QA allowlist');
        return { developmentCode: code };
      }

      if (nodeEnv === 'production') {
        throw new ServiceUnavailableException('Phone verification delivery is not configured');
      }

      this.logger.warn('CNG OTP delivery is in development mode');
      return { developmentCode: code };
    }

    const requestId = randomUUID();
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': requestId,
          ...(webhookToken ? { authorization: `Bearer ${webhookToken}` } : {}),
        },
        body: JSON.stringify({
          phone,
          code,
          purpose: 'cng_application_phone_verification',
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
      this.logger.error(
        `CNG OTP delivery failed requestId=${requestId} reason=${reason} durationMs=${Date.now() - startedAt}`,
      );
      throw new ServiceUnavailableException('Could not send the verification code');
    }

    if (!response.ok) {
      this.logger.error(
        `CNG OTP delivery failed requestId=${requestId} status=${response.status} durationMs=${Date.now() - startedAt}`,
      );
      throw new ServiceUnavailableException('Could not send the verification code');
    }

    this.logger.log(
      `CNG OTP delivery succeeded requestId=${requestId} durationMs=${Date.now() - startedAt}`,
    );

    return {};
  }

  private async sendWithTermii(
    baseUrl: string,
    apiKey: string,
    phone: string,
    code: string,
  ): Promise<void> {
    if (!baseUrl.startsWith('https://')) {
      throw new ServiceUnavailableException('SMS delivery endpoint must use HTTPS');
    }

    const response = await fetch(`${baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to: phone.replace(/^\+/, ''),
        from: this.configService.get<string>('TERMII_SENDER_ID', 'CHRGE'),
        sms: `Your CHRGE verification code is ${code}. It expires in 10 minutes. Do not share it.`,
        type: 'plain',
        channel: this.configService.get<string>('TERMII_CHANNEL', 'dnd'),
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((error: unknown) => {
      this.logger.error('Termii OTP request failed');
      throw new ServiceUnavailableException('Could not send the verification code', {
        cause: error,
      });
    });

    if (!response.ok) {
      this.logger.error(`Termii OTP request failed with status ${response.status}`);
      throw new ServiceUnavailableException('Could not send the verification code');
    }
  }
}
