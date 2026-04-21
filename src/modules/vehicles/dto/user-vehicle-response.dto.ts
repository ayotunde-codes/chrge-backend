import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class BrandInfo {
  @ApiProperty({ example: 'tesla' })
  id: string;

  @ApiProperty({ example: 'Tesla' })
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  logoUrl: string | null;

  @ApiPropertyOptional({ example: true })
  darkLogo: boolean | null;
}

class ModelInfo {
  @ApiProperty({ example: 'model-3' })
  id: string;

  @ApiProperty({ example: 'Model 3' })
  name: string;

  @ApiProperty({ example: 'BEV', enum: ['BEV', 'PHEV', 'EREV'] })
  powertrain: string;

  @ApiProperty({ example: ['NACS', 'CCS2'] })
  connectors: string[];

  @ApiPropertyOptional({ example: 'CCS2' })
  connectorType: string | null;

  @ApiPropertyOptional({ example: 2024 })
  year: number | null;

  @ApiPropertyOptional({ example: 82 })
  batteryCapacityKwh: number | null;

  @ApiPropertyOptional({ example: 560 })
  rangeKm: number | null;

  @ApiPropertyOptional({ example: 'https://example.com/model3.png' })
  imageUrl: string | null;
}

export class UserVehicleResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiPropertyOptional({ example: 'My Tesla' })
  nickname: string | null;

  @ApiProperty({ example: true })
  isPrimary: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: ModelInfo })
  model: ModelInfo;

  @ApiProperty({ type: BrandInfo })
  brand: BrandInfo;
}




