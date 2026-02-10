import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { Public } from '../../common/decorators/public.decorator';
import { VehicleBrandResponseDto } from './dto/vehicle-brand-response.dto';
import { VehicleModelResponseDto } from './dto/vehicle-model-response.dto';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get('brands')
  @Public()
  @ApiOperation({ summary: 'Get all vehicle brands' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by brand name' })
  @ApiResponse({ status: 200, type: [VehicleBrandResponseDto] })
  async getBrands(@Query('search') search?: string): Promise<VehicleBrandResponseDto[]> {
    const brands = await this.vehiclesService.findAllBrands(search);
    return brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      logoUrl: brand.logoUrl,
      country: brand.country,
    }));
  }

  @Get('brands/:brandId/models')
  @Public()
  @ApiOperation({ summary: 'Get all models for a brand' })
  @ApiResponse({ status: 200, type: [VehicleModelResponseDto] })
  async getModels(
    @Param('brandId', ParseUUIDPipe) brandId: string,
  ): Promise<VehicleModelResponseDto[]> {
    const models = await this.vehiclesService.findModelsByBrand(brandId);
    return models.map((model) => ({
      id: model.id,
      brandId: model.brandId,
      name: model.name,
      year: model.year,
      connectorType: model.connectorType,
      batteryCapacityKwh: model.batteryCapacityKwh,
      rangeKm: model.rangeKm,
      imageUrl: model.imageUrl,
    }));
  }
}
