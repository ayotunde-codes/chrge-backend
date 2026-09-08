import { IsEmail, IsString, IsUUID, Matches } from 'class-validator';
export class StaffLoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}
export class StaffMfaDto {
  @IsUUID() challengeId: string;
  @IsString()
  @Matches(/^(?:\d{6}|[a-f0-9]{8}-[a-f0-9]{8})$/i, {
    message: 'code must be a six-digit authenticator code or a recovery code',
  })
  code: string;
}
