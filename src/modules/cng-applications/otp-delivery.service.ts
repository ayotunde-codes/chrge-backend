import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OtpDeliveryResult = {
  developmentCode?: string;
};

@Injectable()
export class OtpDeliveryService {
  private readonly logger = new Logger(OtpDeliveryService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(phone: string, code: string): Promise<OtpDeliveryResult> {
    const webhookUrl = this.configService.get<string>('CNG_OTP_WEBHOOK_URL');
    const webhookToken = this.configService.get<string>('CNG_OTP_WEBHOOK_TOKEN');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (!webhookUrl) {
      if (nodeEnv === 'production') {
        throw new ServiceUnavailableException('Phone verification delivery is not configured');
      }

      this.logger.warn('CNG OTP delivery is in development mode');
      return { developmentCode: code };
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(webhookToken ? { authorization: `Bearer ${webhookToken}` } : {}),
      },
      body: JSON.stringify({
        phone,
        code,
        purpose: 'cng_application_phone_verification',
      }),
    });

    if (!response.ok) {
      this.logger.error(`CNG OTP webhook failed with status ${response.status}`);
      throw new ServiceUnavailableException('Could not send the verification code');
    }

    return {};
  }
}
