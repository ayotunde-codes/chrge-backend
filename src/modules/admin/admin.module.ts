import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { AdminOperationsService } from './admin-operations.service';
import { AdminAuditInterceptor } from '../audit/admin-audit.interceptor';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminOperationsService, StaffAccessGuard, AdminAuditInterceptor],
  exports: [AdminService],
})
export class AdminModule {}
