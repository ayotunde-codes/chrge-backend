import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StationAssociationStatus } from '@prisma/client';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { AdminAuditInterceptor } from '../audit/admin-audit.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssignStationManagerDto, SubmitStationConditionDto } from './dto/station-portal.dto';
import { StationPortalService } from './station-portal.service';

@ApiTags('admin-station-associations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, StaffAccessGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
@Controller('admin/station-associations')
@UseInterceptors(AdminAuditInterceptor)
export class StationPortalAdminController {
  constructor(private readonly service: StationPortalService) {}

  @Get()
  @ApiOperation({ summary: 'List station representative association requests' })
  list(@Query('status') status?: StationAssociationStatus) {
    return this.service.listAssociations(status);
  }

  @Get('stations/:stationId')
  @ApiOperation({ summary: 'Get station manager and current CNG reporting context' })
  stationContext(@Param('stationId', ParseUUIDPipe) stationId: string) {
    return this.service.getStationManagement(stationId);
  }

  @Post('stations/:stationId/manager')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Assign a CHRGE user as the station manager' })
  assignManager(
    @CurrentUser() user: JwtPayload,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Body() dto: AssignStationManagerDto,
  ) {
    return this.service.assignManager(user.sub, stationId, dto.userId);
  }

  @Post('stations/:stationId/reports')
  @ApiOperation({ summary: 'Publish station CNG conditions as an administrator' })
  submitReport(
    @CurrentUser() user: JwtPayload,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Body() dto: SubmitStationConditionDto,
  ) {
    return this.service.submitAdminReport(user.sub, stationId, dto);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a station representative association' })
  approve(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reviewAssociation(user.sub, id, 'APPROVED');
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a station representative association' })
  reject(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reviewAssociation(user.sub, id, 'REJECTED');
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend a station representative association' })
  suspend(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reviewAssociation(user.sub, id, 'SUSPENDED');
  }
}
