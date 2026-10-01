import { IsEmail, IsIn, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
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

export class StaffLogoutDto {
  @IsString()
  @MinLength(32)
  refreshToken: string;
}

export class StaffStepUpDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a six-digit authenticator code' })
  code: string;

  @IsIn([
    'EDIT_APPLICATION',
    'REPLACE_DOCUMENT',
    'EXPORT_APPLICATION',
    'PUBLISH_FINANCING_CONFIG',
    'TOGGLE_FINANCING_PLAN',
  ])
  action:
    | 'EDIT_APPLICATION'
    | 'REPLACE_DOCUMENT'
    | 'EXPORT_APPLICATION'
    | 'PUBLISH_FINANCING_CONFIG'
    | 'TOGGLE_FINANCING_PLAN';

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  resourceId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
