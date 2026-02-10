import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserVehicleDto {
  @ApiPropertyOptional({ example: 'My Daily Driver', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ description: 'Set as primary vehicle' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}




