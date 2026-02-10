import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Specific refresh token to revoke',
    example: 'a1b2c3d4e5f6...',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'Revoke all refresh tokens for the user (logout from all devices)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  revokeAll?: boolean;
}




