import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CngApplicationsController } from './cng-applications.controller';
import { AdminCngApplicationsController } from './admin-cng-applications.controller';
import { CngApplicationsService } from './cng-applications.service';
import { CngApplicationAccessGuard } from './cng-application-access.guard';
import { SensitiveDataService } from './sensitive-data.service';
import { OtpDeliveryService } from './otp-delivery.service';
import { DocumentStorageService } from './document-storage.service';

@Module({
  imports: [ConfigModule],
  controllers: [CngApplicationsController, AdminCngApplicationsController],
  providers: [
    CngApplicationsService,
    CngApplicationAccessGuard,
    SensitiveDataService,
    OtpDeliveryService,
    DocumentStorageService,
  ],
  exports: [CngApplicationsService],
})
export class CngApplicationsModule {}
