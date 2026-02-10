import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VehicleModelResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'uuid' })
  brandId: string;

  @ApiProperty({ example: 'Model 3 Long Range' })
  name: string;

  @ApiPropertyOptional({ example: 2024 })
  year: number | null;

  @ApiProperty({ example: 'CCS2', enum: ['CCS1', 'CCS2', 'CHADEMO', 'TESLA', 'J1772', 'TYPE2', 'NACS', 'GB_T'] })
  connectorType: string;

  @ApiPropertyOptional({ example: 82 })
  batteryCapacityKwh: number | null;

  @ApiPropertyOptional({ example: 560 })
  rangeKm: number | null;

  @ApiPropertyOptional({ example: 'https://example.com/model3.png' })
  imageUrl: string | null;
}




