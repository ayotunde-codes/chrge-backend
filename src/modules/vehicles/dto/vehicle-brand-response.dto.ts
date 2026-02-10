import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VehicleBrandResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Tesla' })
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/tesla-logo.png' })
  logoUrl: string | null;

  @ApiPropertyOptional({ example: 'USA' })
  country: string | null;
}




