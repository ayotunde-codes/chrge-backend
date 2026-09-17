import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StationAssociationStatus } from '@prisma/client';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StationPortalService } from './station-portal.service';

@ApiTags('admin-station-associations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
@Controller('admin/station-associations')
export class StationPortalAdminController {
  constructor(private readonly service: StationPortalService) {}

  @Get()
  @ApiOperation({ summary: 'List station representative association requests' })
  list(@Query('status') status?: StationAssociationStatus) {
    return this.service.listAssociations(status);
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
