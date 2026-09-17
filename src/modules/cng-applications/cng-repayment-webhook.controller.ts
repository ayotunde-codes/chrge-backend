import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { CngApplicationsService } from './cng-applications.service';
import { CngRepaymentWebhookDto } from './dto/cng-application.dto';

@ApiTags('webhooks')
@Controller('webhooks/cng-repayments')
export class CngRepaymentWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly applications: CngApplicationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Record a completed CNG financing installment' })
  async recordPayment(
    @Headers('x-webhook-secret') suppliedSecret: string | undefined,
    @Body() dto: CngRepaymentWebhookDto,
  ) {
    const expectedSecret = this.config.get<string>('CNG_REPAYMENT_WEBHOOK_SECRET');
    if (!this.matchesSecret(suppliedSecret, expectedSecret)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
    return this.applications.recordInstallmentPayment(dto);
  }

  private matchesSecret(supplied: string | undefined, expected: string | undefined): boolean {
    if (!supplied || !expected) return false;
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    return (
      suppliedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(suppliedBuffer, expectedBuffer)
    );
  }
}
