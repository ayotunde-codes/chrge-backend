import { Module } from '@nestjs/common';
import { StationPortalAdminController } from './station-portal-admin.controller';
import { StationPortalController } from './station-portal.controller';
import { StationPortalService } from './station-portal.service';

@Module({
  controllers: [StationPortalController, StationPortalAdminController],
  providers: [StationPortalService],
  exports: [StationPortalService],
})
export class StationPortalModule {}
