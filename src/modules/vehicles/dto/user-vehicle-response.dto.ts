import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class BrandInfo {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Tesla' })
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  logoUrl: string | null;
}

class ModelInfo {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Model 3 Long Range' })
  name: string;

  @ApiPropertyOptional({ example: 2024 })
  year: number | null;

  @ApiProperty({ example: 'CCS2' })
  connectorType: string;

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




