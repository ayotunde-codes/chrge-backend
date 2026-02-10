import { IsString, IsOptional, IsBoolean, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserVehicleDto {
  @ApiProperty({ example: 'uuid', description: 'The vehicle model ID' })
  @IsUUID()
  modelId: string;

  @ApiPropertyOptional({ example: 'My Tesla', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ default: false, description: 'Set as primary vehicle' })
  @IsOptional()
  @IsBoolean()
  setPrimary?: boolean;
}




