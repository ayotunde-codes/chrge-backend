import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Legacy refresh token. Web clients use the secure HTTP-only cookie.',
    example: 'a1b2c3d4e5f6...',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
