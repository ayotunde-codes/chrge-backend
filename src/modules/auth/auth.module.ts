import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  StaffInvitationEnrollmentController,
  StaffInvitationsController,
} from './staff-invitations.controller';
import { StaffInvitationsService } from './staff-invitations.service';
import { ResendEmailService } from './resend-email.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService): Promise<JwtModuleOptions> => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRATION', '15m') as NonNullable<
            JwtModuleOptions['signOptions']
          >['expiresIn'],
        },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'auth',
        ttl: 60000,
        limit: 10,
      },
    ]),
  ],
  controllers: [
    AuthController,
    StaffAuthController,
    StaffInvitationsController,
    StaffInvitationEnrollmentController,
  ],
  providers: [
    AuthService,
    StaffAuthService,
    TokenService,
    GoogleAuthService,
    JwtStrategy,
    JwtAuthGuard,
    StaffAccessGuard,
    RolesGuard,
    StaffInvitationsService,
    ResendEmailService,
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
