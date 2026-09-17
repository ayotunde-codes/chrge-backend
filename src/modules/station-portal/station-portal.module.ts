import { Module } from '@nestjs/common';
import { StationPortalAdminController } from './station-portal-admin.controller';
import { StationPortalController } from './station-portal.controller';
import { StationPortalService } from './station-portal.service';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { AdminAuditInterceptor } from '../audit/admin-audit.interceptor';

@Module({
  controllers: [StationPortalController, StationPortalAdminController],
  providers: [StationPortalService, StaffAccessGuard, AdminAuditInterceptor],
  exports: [StationPortalService],
})
export class StationPortalModule {}
