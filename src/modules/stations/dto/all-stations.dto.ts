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
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConnectorType, PortStatus } from '@prisma/client';

export class AllStationsDto {
  @ApiPropertyOptional({ example: 'Lagos', description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Lekki', description: 'Filter by area / neighbourhood' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ example: 'CHRGE', description: 'Search by station name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: ['CCS2', 'TYPE_2'],
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

  @ApiPropertyOptional({ example: 20, description: 'Max results per page (default 20, max 50)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor (offset from previous response)' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
