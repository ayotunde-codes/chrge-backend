import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { AdminOperationsService } from './admin-operations.service';
import { AuditService } from '../audit/audit.service';
import { AdminAuditInterceptor } from '../audit/admin-audit.interceptor';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import {
  CreateVehicleBrandDto,
  CreateVehicleModelDto,
  CreateStationDto,
  UpdateStationDto,
  CreatePortDto,
  UpdatePortDto,
  CreateStationImageDto,
  VehicleBrandResponseDto,
  VehicleModelResponseDto,
  StationResponseDto,
  PortResponseDto,
  StationImageResponseDto,
  AdminStationQueryDto,
} from './dto/admin.dto';
import { ReviewStationDto } from '../stations/dto/submit-station.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, StaffAccessGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
@ApiBearerAuth('access-token')
@UseInterceptors(AdminAuditInterceptor)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly operations: AdminOperationsService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.operations.dashboard();
  }

  @Get('notifications')
  notifications(@CurrentUser() user: JwtPayload) {
    return this.operations.notifications(user.sub);
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  markNotificationsRead(@CurrentUser() user: JwtPayload, @Req() request: Request) {
    return this.operations.markNotificationsRead(user.sub, {
      actorId: user.sub,
      actorRole: user.role === 'OPERATOR' ? 'OPERATOR' : 'ADMIN',
      requestId: request.get('x-request-id') ?? randomUUID(),
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Get('vehicles')
  vehicles() {
    return this.operations.vehicleCatalog();
  }

  @Get('users')
  @Roles('ADMIN')
  users(@Query() query: { cursor?: string; search?: string; limit?: number }) {
    return this.operations.users(query);
  }

  @Get('reviews')
  reviews(@Query() query: { cursor?: string; limit?: number }) {
    return this.operations.reviews(query);
  }

  @Get('settings')
  settings() {
    return this.operations.settings();
  }

  @Get('audit-log')
  @Roles('ADMIN')
  auditLog(
    @Query()
    query: {
      cursor?: string;
      limit?: number;
      action?: string;
      actorId?: string;
      targetType?: string;
    },
  ) {
    return this.audit.list(query);
  }

  // ============================================================================
  // VEHICLE BRANDS
  // ============================================================================

  @Post('vehicle-brands')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a new vehicle brand' })
  @ApiResponse({ status: 201, type: VehicleBrandResponseDto })
  async createBrand(@Body() dto: CreateVehicleBrandDto): Promise<VehicleBrandResponseDto> {
    const brand = await this.adminService.createBrand(dto);
    return {
      id: brand.id,
      name: brand.name,
      logoUrl: brand.logoUrl,
      darkLogo: brand.darkLogo ?? null,
      country: brand.country,
      isActive: brand.isActive,
      createdAt: brand.createdAt,
    };
  }

  // ============================================================================
  // VEHICLE MODELS
  // ============================================================================

  @Post('vehicle-models')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a new vehicle model' })
  @ApiResponse({ status: 201, type: VehicleModelResponseDto })
  async createModel(@Body() dto: CreateVehicleModelDto): Promise<VehicleModelResponseDto> {
    const model = await this.adminService.createModel(dto);
    const connectors = Array.isArray(model.connectors) ? (model.connectors as string[]) : [];
    return {
      id: model.id,
      brandId: model.brandId,
      name: model.name,
      powertrain: model.powertrain,
      connectors,
      connectorType: model.connectorType,
      year: model.year,
      batteryCapacityKwh: model.batteryCapacityKwh,
      rangeKm: model.rangeKm,
      imageUrl: model.imageUrl,
      isActive: model.isActive,
      createdAt: model.createdAt,
    };
  }

  // ============================================================================
  // STATIONS
  // ============================================================================

  @Get('stations')
  @ApiOperation({ summary: 'List every station, including inactive submissions' })
  async listStations(@Query() dto: AdminStationQueryDto) {
    return this.adminService.listStations(dto);
  }

  @Get('stations/:id')
  @ApiOperation({ summary: 'Get admin station detail, including inactive submissions' })
  async getStation(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getStationForAdmin(id);
  }

  @Post('stations')
  @ApiOperation({ summary: 'Create a new charging station' })
  @ApiResponse({ status: 201, type: StationResponseDto })
  async createStation(@Body() dto: CreateStationDto): Promise<StationResponseDto> {
    const station = await this.adminService.createStation(dto);
    return this.mapStation(station);
  }

  @Patch('stations/:id')
  @ApiOperation({ summary: 'Update a charging station' })
  @ApiResponse({ status: 200, type: StationResponseDto })
  async updateStation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStationDto,
  ): Promise<StationResponseDto> {
    const station = await this.adminService.updateStation(id, dto);
    return this.mapStation(station);
  }

  @Patch('stations/:id/review')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a submitted station' })
  @ApiResponse({ status: 200, type: StationResponseDto })
  async reviewStation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewStationDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<StationResponseDto & { status: string; rejectionReason: string | null }> {
    const station = await this.adminService.reviewStation(
      id,
      {
        actorId: user.sub,
        actorRole: user.role === 'OPERATOR' ? 'OPERATOR' : 'ADMIN',
        requestId: request.get('x-request-id') ?? randomUUID(),
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
      },
      dto,
    );
    return {
      ...this.mapStation(station),
      status: (station as unknown as { status: string }).status,
      rejectionReason: (station as unknown as { rejectionReason: string | null }).rejectionReason,
    };
  }

  // ============================================================================
  // STATION IMAGES
  // ============================================================================

  @Post('stations/:id/images')
  @ApiOperation({ summary: 'Add an image to a station' })
  @ApiResponse({ status: 201, type: StationImageResponseDto })
  async addStationImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStationImageDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<StationImageResponseDto> {
    const image = await this.adminService.addStationImage(id, dto, user.sub);
    return {
      id: image.id,
      stationId: image.stationId,
      url: image.url,
      caption: image.caption,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
      createdAt: image.createdAt,
    };
  }

  // ============================================================================
  // PORTS
  // ============================================================================

  @Post('stations/:id/ports')
  @ApiOperation({ summary: 'Add a port to a station' })
  @ApiResponse({ status: 201, type: PortResponseDto })
  async addPort(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePortDto,
  ): Promise<PortResponseDto> {
    const port = await this.adminService.addPort(id, dto);
    return this.mapPort(port);
  }

  @Patch('ports/:id')
  @ApiOperation({ summary: 'Update a port' })
  @ApiResponse({ status: 200, type: PortResponseDto })
  async updatePort(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePortDto,
  ): Promise<PortResponseDto> {
    const port = await this.adminService.updatePort(id, dto);
    return this.mapPort(port);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private mapStation(station: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    country: string;
    latitude: number;
    longitude: number;
    isActive: boolean;
    isVerified: boolean;
    stationType?: string;
    cngDetails?: unknown;
    createdAt: Date;
  }): StationResponseDto {
    return {
      id: station.id,
      name: station.name,
      address: station.address,
      city: station.city,
      state: station.state,
      country: station.country,
      latitude: station.latitude,
      longitude: station.longitude,
      isActive: station.isActive,
      isVerified: station.isVerified,
      stationType: station.stationType ?? 'EV',
      cngDetails: (station.cngDetails as Record<string, unknown> | null) ?? null,
      createdAt: station.createdAt,
    };
  }

  private mapPort(port: {
    id: string;
    stationId: string;
    connectorType: string;
    chargerType: string;
    powerKw: number | null;
    status: string;
    portNumber: string | null;
    createdAt: Date;
  }): PortResponseDto {
    return {
      id: port.id,
      stationId: port.stationId,
      connectorType: port.connectorType,
      chargerType: port.chargerType,
      powerKw: port.powerKw,
      status: port.status,
      portNumber: port.portNumber,
      createdAt: port.createdAt,
    };
  }
}
