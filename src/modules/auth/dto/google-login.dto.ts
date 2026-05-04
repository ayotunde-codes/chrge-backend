import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google OAuth2 access token obtained from Google Sign-In',
    example: 'ya29.a0AfH6SMC...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Google access token is required' })
  accessToken: string;
}




