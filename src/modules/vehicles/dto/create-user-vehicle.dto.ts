import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserVehicleDto {
  @ApiProperty({ example: 'model-3', description: 'The vehicle model ID' })
  @IsString()
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




