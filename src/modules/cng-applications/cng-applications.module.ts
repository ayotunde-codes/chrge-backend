import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CngApplicationsController } from './cng-applications.controller';
import { AdminCngApplicationsController } from './admin-cng-applications.controller';
import { CngApplicationsService } from './cng-applications.service';
import { CngApplicationAccessGuard } from './cng-application-access.guard';
import { SensitiveDataService } from './sensitive-data.service';
import { OtpDeliveryService } from './otp-delivery.service';
import { DocumentStorageService } from './document-storage.service';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { AdminCngReviewService } from './admin-cng-review.service';
import { AdminAuditInterceptor } from '../audit/admin-audit.interceptor';
import { CngRepaymentWebhookController } from './cng-repayment-webhook.controller';
import { AuthModule } from '../auth/auth.module';
import { CngApplicationOperationsService } from './cng-application-operations.service';
import { AdminCngFinancingController } from './admin-cng-financing.controller';
import { CngFinancingConfigurationService } from './cng-financing-configuration.service';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [
    CngApplicationsController,
    AdminCngApplicationsController,
    AdminCngFinancingController,
    CngRepaymentWebhookController,
  ],
  providers: [
    CngApplicationsService,
    CngApplicationAccessGuard,
    SensitiveDataService,
    OtpDeliveryService,
    DocumentStorageService,
    StaffAccessGuard,
    AdminCngReviewService,
    AdminAuditInterceptor,
    CngApplicationOperationsService,
    CngFinancingConfigurationService,
  ],
  exports: [CngApplicationsService],
})
export class CngApplicationsModule {}
