import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'John' })
  firstName: string | null;

  @ApiPropertyOptional({ example: 'Doe' })
  lastName: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  avatarUrl: string | null;

  @ApiProperty({ example: 'EMAIL', enum: ['EMAIL', 'GOOGLE', 'APPLE'] })
  provider: 'EMAIL' | 'GOOGLE' | 'APPLE';

  @ApiProperty({ example: true })
  emailVerified: boolean;

  @ApiProperty({ example: 'USER', enum: ['USER', 'ADMIN'] })
  role: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;
}




