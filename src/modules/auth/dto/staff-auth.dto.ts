import { IsEmail, IsString, Length, IsUUID } from 'class-validator';
export class StaffLoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}
export class StaffMfaDto {
  @IsUUID() challengeId: string;
  @IsString() @Length(6, 6) code: string;
}
