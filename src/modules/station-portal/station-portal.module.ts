import { Module } from '@nestjs/common';
import { StationPortalAdminController } from './station-portal-admin.controller';
import { StationPortalController } from './station-portal.controller';
import { StationPortalService } from './station-portal.service';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { AdminAuditInterceptor } from '../audit/admin-audit.interceptor';
import { AuthModule } from '../auth/auth.module';
import { CngEmailNotificationsService } from './cng-email-notifications.service';

@Module({
  imports: [AuthModule],
  controllers: [StationPortalController, StationPortalAdminController],
  providers: [StationPortalService, CngEmailNotificationsService, StaffAccessGuard, AdminAuditInterceptor],
  exports: [StationPortalService],
})
export class StationPortalModule {}
