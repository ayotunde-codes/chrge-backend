import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CreateUserVehicleDto } from './dto/create-user-vehicle.dto';
import { UpdateUserVehicleDto } from './dto/update-user-vehicle.dto';
import { UserVehicleResponseDto } from './dto/user-vehicle-response.dto';

@ApiTags('me')
@Controller('me/vehicles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class UserVehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user vehicles' })
  @ApiResponse({ status: 200, type: [UserVehicleResponseDto] })
  async getMyVehicles(@CurrentUser() user: JwtPayload): Promise<UserVehicleResponseDto[]> {
    const vehicles = await this.vehiclesService.getUserVehicles(user.sub);
    return vehicles.map((v) => this.mapToResponse(v));
  }

  @Post()
  @ApiOperation({ summary: 'Add a vehicle to your garage' })
  @ApiResponse({ status: 201, type: UserVehicleResponseDto })
  async addVehicle(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateUserVehicleDto,
  ): Promise<UserVehicleResponseDto> {
    const vehicle = await this.vehiclesService.createUserVehicle(user.sub, dto);
    return this.mapToResponse(vehicle);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a vehicle (nickname, primary status)' })
  @ApiResponse({ status: 200, type: UserVehicleResponseDto })
  async updateVehicle(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserVehicleDto,
  ): Promise<UserVehicleResponseDto> {
    const vehicle = await this.vehiclesService.updateUserVehicle(user.sub, id, dto);
    return this.mapToResponse(vehicle);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a vehicle from your garage' })
  @ApiResponse({ status: 200, description: 'Vehicle removed' })
  async removeVehicle(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.vehiclesService.deleteUserVehicle(user.sub, id);
    return { message: 'Vehicle removed successfully' };
  }

  private mapToResponse(vehicle: {
    id: string;
    nickname: string | null;
    isPrimary: boolean;
    createdAt: Date;
    model: {
      id: string;
      name: string;
      powertrain: string;
      connectors: unknown;
      connectorType: string | null;
      year: number | null;
      batteryCapacityKwh: number | null;
      rangeKm: number | null;
      imageUrl: string | null;
      brand: {
        id: string;
        name: string;
        logoUrl: string | null;
        darkLogo: boolean | null;
      };
    };
  }): UserVehicleResponseDto {
    const connectors = Array.isArray(vehicle.model.connectors) ? vehicle.model.connectors : [];
    return {
      id: vehicle.id,
      nickname: vehicle.nickname,
      isPrimary: vehicle.isPrimary,
      createdAt: vehicle.createdAt,
      model: {
        id: vehicle.model.id,
        name: vehicle.model.name,
        powertrain: vehicle.model.powertrain,
        connectors: connectors as string[],
        connectorType: vehicle.model.connectorType,
        year: vehicle.model.year,
        batteryCapacityKwh: vehicle.model.batteryCapacityKwh,
        rangeKm: vehicle.model.rangeKm,
        imageUrl: vehicle.model.imageUrl,
      },
      brand: {
        id: vehicle.model.brand.id,
        name: vehicle.model.brand.name,
        logoUrl: vehicle.model.brand.logoUrl,
        darkLogo: vehicle.model.brand.darkLogo ?? null,
      },
    };
  }
}




