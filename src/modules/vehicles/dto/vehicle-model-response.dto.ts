import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VehicleModelResponseDto {
  @ApiProperty({ example: 'model-3' })
  id: string;

  @ApiProperty({ example: 'tesla' })
  brandId: string;

  @ApiProperty({ example: 'Model 3' })
  name: string;

  @ApiProperty({ example: 'BEV', enum: ['BEV', 'PHEV', 'EREV'] })
  powertrain: string;

  @ApiProperty({ example: ['NACS', 'CCS2'], description: 'Supported connector types' })
  connectors: string[];

  @ApiPropertyOptional({ example: 'CCS2', description: 'Legacy single connector (first of connectors)' })
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




