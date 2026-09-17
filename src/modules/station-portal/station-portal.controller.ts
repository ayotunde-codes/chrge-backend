import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ListEligibleStationsDto,
  ReportHistoryQueryDto,
  RequestStationAssociationDto,
  SubmitStationConditionDto,
} from './dto/station-portal.dto';
import { StationPortalService } from './station-portal.service';

@ApiTags('station-portal')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('station-portal')
export class StationPortalController {
  constructor(private readonly service: StationPortalService) {}

  @Get('stations')
  @ApiOperation({ summary: 'List active CNG stations eligible for representative association' })
  listStations(@Query() query: ListEligibleStationsDto) {
    return this.service.listEligibleStations(query);
  }

  @Post('associations')
  @ApiOperation({ summary: 'Request access to manage a station' })
  requestAssociation(@CurrentUser() user: JwtPayload, @Body() dto: RequestStationAssociationDto) {
    return this.service.requestAssociation(user.sub, dto);
  }

  @Get('me/station')
  @ApiOperation({ summary: 'Get the signed-in representative approved station and current conditions' })
  getMyStation(@CurrentUser() user: JwtPayload) {
    return this.service.getMyStation(user.sub);
  }

  @Get('stations/:stationId/reports')
  @ApiOperation({ summary: 'Get station condition report history' })
  getHistory(
    @CurrentUser() user: JwtPayload,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Query() query: ReportHistoryQueryDto,
  ) {
    return this.service.getHistory(user.sub, stationId, query);
  }

  @Post('stations/:stationId/reports')
  @ApiOperation({ summary: 'Publish gas availability, queue length, and pump pressure' })
  submitReport(
    @CurrentUser() user: JwtPayload,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Body() dto: SubmitStationConditionDto,
  ) {
    return this.service.submitReport(user.sub, stationId, dto);
  }
}
