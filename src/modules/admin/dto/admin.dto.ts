import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsUUID,
  IsInt,
  IsUrl,
  IsObject,
  IsArray,
  Min,
  Max,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ConnectorType, ChargerType, PortStatus, PowertrainType } from '@prisma/client';

// ============================================================================
// VEHICLE BRAND DTOs
// ============================================================================

export class CreateVehicleBrandDto {
  @ApiProperty({ example: 'tesla', description: 'Stable id for frontend (e.g. tesla, audi)' })
  @IsString()
  @MaxLength(50)
  id: string;

  @ApiProperty({ example: 'Tesla' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/tesla-logo.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ example: false, description: 'Prefer dark logo variant' })
  @IsOptional()
  @IsBoolean()
  darkLogo?: boolean;

  @ApiPropertyOptional({ example: 'USA' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class VehicleBrandResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() logoUrl: string | null;
  @ApiPropertyOptional() darkLogo: boolean | null;
  @ApiPropertyOptional() country: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() createdAt: Date;
}

// ============================================================================
// VEHICLE MODEL DTOs
// ============================================================================

export class CreateVehicleModelDto {
  @ApiProperty({ example: 'model-3', description: 'Stable id for frontend' })
  @IsString()
  @MaxLength(80)
  id: string;

  @ApiProperty({ example: 'tesla' })
  @IsString()
  brandId: string;

  @ApiProperty({ example: 'Model 3' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'BEV', enum: PowertrainType })
  @IsEnum(PowertrainType)
  powertrain: PowertrainType;

  @ApiProperty({ example: ['NACS', 'CCS2'], description: 'Supported connector types', enum: ConnectorType, isArray: true })
  @IsArray()
  @IsEnum(ConnectorType, { each: true })
  connectors: ConnectorType[];

  @ApiPropertyOptional({ example: 2024 })
  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ example: 82 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  batteryCapacityKwh?: number;

  @ApiPropertyOptional({ example: 560 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rangeKm?: number;

  @ApiPropertyOptional({ example: 'https://example.com/model3.png' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class VehicleModelResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() brandId: string;
  @ApiProperty() name: string;
  @ApiProperty() powertrain: string;
  @ApiProperty() connectors: string[];
  @ApiPropertyOptional() connectorType: string | null;
  @ApiPropertyOptional() year: number | null;
  @ApiPropertyOptional() batteryCapacityKwh: number | null;
  @ApiPropertyOptional() rangeKm: number | null;
  @ApiPropertyOptional() imageUrl: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() createdAt: Date;
}

// ============================================================================
// STATION DTOs
// ============================================================================

export class CreateStationDto {
  @ApiProperty({ example: 'Lekki Phase 1 Charging Hub' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Fast charging station with 6 ports' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: '123 Admiralty Way' })
  @IsString()
  @MaxLength(500)
  address: string;

  @ApiProperty({ example: 'Lekki' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @MaxLength(100)
  state: string;

  @ApiPropertyOptional({ example: '101233' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ example: 'NG', default: 'NG' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiProperty({ example: 6.4541 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 3.4725 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 'Africa/Lagos', default: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({
    example: { mon: { open: '08:00', close: '22:00' }, tue: { open: '08:00', close: '22:00' } },
    description: 'Operating hours by day. Use "24h" for always open.',
  })
  @IsOptional()
  @IsObject()
  operatingHours?: Record<string, { open: string; close: string }>;

  @ApiPropertyOptional({ example: ['restrooms', 'wifi', 'food'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({
    example: { perKwh: 350, sessionFee: 500, currency: 'NGN' },
    description: 'Pricing structure',
  })
  @IsOptional()
  @IsObject()
  pricing?: { perKwh?: number; perMinute?: number; sessionFee?: number; currency: string };

  @ApiPropertyOptional({ example: '+234 801 234 5678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'support@station.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'uuid' })
  @IsOptional()
  @IsUUID()
  networkId?: string;
}

export class UpdateStationDto extends PartialType(CreateStationDto) {}

export class StationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() address: string;
  @ApiProperty() city: string;
  @ApiProperty() state: string;
  @ApiProperty() country: string;
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty() isVerified: boolean;
  @ApiProperty() createdAt: Date;
}

// ============================================================================
// STATION IMAGE DTOs
// ============================================================================

export class CreateStationImageDto {
  @ApiProperty({ example: 'https://example.com/station-image.jpg' })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ example: 'Front view of the charging station' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class StationImageResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() stationId: string;
  @ApiProperty() url: string;
  @ApiPropertyOptional() caption: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isPrimary: boolean;
  @ApiProperty() createdAt: Date;
}

// ============================================================================
// PORT DTOs
// ============================================================================

export class CreatePortDto {
  @ApiProperty({ example: 'CCS2', enum: ConnectorType })
  @IsEnum(ConnectorType)
  connectorType: ConnectorType;

  @ApiProperty({ example: 'DCFC', enum: ChargerType })
  @IsEnum(ChargerType)
  chargerType: ChargerType;

  @ApiProperty({ example: 150 })
  @IsNumber()
  @Min(1)
  powerKw: number;

  @ApiPropertyOptional({ example: 'UNKNOWN', enum: PortStatus, default: 'UNKNOWN' })
  @IsOptional()
  @IsEnum(PortStatus)
  status?: PortStatus;

  @ApiPropertyOptional({ example: 350 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerKwh?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerMinute?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerSession?: number;

  @ApiPropertyOptional({ example: 'A1' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  portNumber?: string;
}

export class UpdatePortDto extends PartialType(CreatePortDto) {
  @ApiPropertyOptional({ description: 'When the port might become available (ISO date)' })
  @IsOptional()
  @IsDateString()
  estimatedAvailableAt?: string;
}

export class PortResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() stationId: string;
  @ApiProperty() connectorType: string;
  @ApiProperty() chargerType: string;
  @ApiProperty() powerKw: number;
  @ApiProperty() status: string;
  @ApiPropertyOptional() portNumber: string | null;
  @ApiProperty() createdAt: Date;
}




