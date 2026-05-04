import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GoogleUserInfo {
  sub: string; // Google user ID
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

interface GoogleUserinfoResponse {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(private readonly configService: ConfigService) {
    const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!webClientId) {
      this.logger.warn('No Google client ID configured. Google login will not work.');
    }
  }

  async verifyAccessToken(accessToken: string): Promise<GoogleUserInfo> {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new UnauthorizedException('Invalid or expired Google access token');
      }

      const payload = (await response.json()) as GoogleUserinfoResponse;

      if (!payload.email) {
        throw new UnauthorizedException('Google account must have an email address');
      }

      if (!payload.email_verified) {
        throw new UnauthorizedException('Google email address is not verified');
      }

      return {
        sub: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified,
        name: payload.name,
        given_name: payload.given_name,
        family_name: payload.family_name,
        picture: payload.picture,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(`Google token verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid or expired Google token');
    }
  }
}
