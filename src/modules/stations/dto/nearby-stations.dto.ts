import {
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConnectorType, PortStatus } from '@prisma/client';

export class NearbyStationsDto {
  @ApiProperty({ example: 6.5244, description: 'Latitude' })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 3.3792, description: 'Longitude' })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ example: 10, description: 'Search radius in kilometers', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  radiusKm?: number;

  @ApiPropertyOptional({ example: 20, description: 'Maximum results', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    example: ['CCS2', 'TYPE2'],
    description: 'Filter by connector types',
    enum: ConnectorType,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsEnum(ConnectorType, { each: true })
  connectors?: ConnectorType[];

  @ApiPropertyOptional({ example: true, description: 'Only show stations open now' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  openNow?: boolean;

  @ApiPropertyOptional({
    example: ['AVAILABLE'],
    description: 'Filter by port status',
    enum: PortStatus,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsEnum(PortStatus, { each: true })
  status?: PortStatus[];

  @ApiPropertyOptional({ example: 50, description: 'Minimum charger power in kW' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  minPowerKw?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}




