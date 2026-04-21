import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsObject,
  IsUUID,
  ValidateNested,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConnectorType, ChargerType } from '@prisma/client';

export class SubmitPortDto {
  @ApiProperty({ example: 'CCS2', enum: ConnectorType })
  @IsEnum(ConnectorType)
  connectorType: ConnectorType;

  @ApiProperty({ example: 'DCFC', enum: ChargerType })
  @IsEnum(ChargerType)
  chargerType: ChargerType;

  @ApiProperty({ example: 50, description: 'Power output in kW' })
  @IsNumber()
  @Min(1)
  powerKw: number;

  @ApiPropertyOptional({ example: 'A1', description: 'Port label at the station' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  portNumber?: string;

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
}

export class SubmitStationDto {
  @ApiProperty({ example: 'GridPower Yaba Tech' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Fast charging hub near Yaba tech cluster' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: '14 Herbert Macaulay Way' })
  @IsString()
  @MaxLength(500)
  address: string;

  @ApiPropertyOptional({ example: 'Yaba', description: 'Neighbourhood or district' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @MaxLength(100)
  state: string;

  @ApiPropertyOptional({ example: '100001' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ example: 'NG', default: 'NG' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiProperty({ example: 6.5095 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 3.3711 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 'Africa/Lagos', default: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    example: { mon: { open: '08:00', close: '22:00' }, tue: { open: '08:00', close: '22:00' } },
    description: 'Operating hours per day. Omit for 24/7.',
  })
  @IsOptional()
  @IsObject()
  operatingHours?: Record<string, { open: string; close: string }>;

  @ApiPropertyOptional({ example: ['restrooms', 'wifi', 'parking'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({
    example: { perKwh: 350, sessionFee: 500, currency: 'NGN' },
  })
  @IsOptional()
  @IsObject()
  pricing?: { perKwh?: number; perMinute?: number; sessionFee?: number; currency: string };

  @ApiPropertyOptional({ example: '+234 801 234 5678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'uuid-of-network' })
  @IsOptional()
  @IsUUID()
  networkId?: string;

  @ApiPropertyOptional({
    type: [SubmitPortDto],
    description: 'Optional charging ports to create with the station',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitPortDto)
  ports?: SubmitPortDto[];
}

export class ReviewStationDto {
  @ApiProperty({ example: 'APPROVE', enum: ['APPROVE', 'REJECT'] })
  @IsEnum(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ example: 'Location could not be verified' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}
