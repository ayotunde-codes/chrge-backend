import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleUserInfo {
  sub: string; // Google user ID
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
  private readonly oauthClient: OAuth2Client;
  private readonly clientIds: string[];

  constructor(private readonly configService: ConfigService) {
    const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const iosClientId = this.configService.get<string>('GOOGLE_CLIENT_ID_IOS');
    const androidClientId = this.configService.get<string>('GOOGLE_CLIENT_ID_ANDROID');

    this.oauthClient = new OAuth2Client(webClientId);

    // Collect all valid client IDs (filter out undefined)
    this.clientIds = [webClientId, iosClientId, androidClientId].filter((id): id is string => !!id);

    if (this.clientIds.length === 0) {
      this.logger.warn('No Google client IDs configured. Google login will not work.');
    }
  }

  /**
   * Verify a Google ID token and extract user information
   */
  async verifyIdToken(idToken: string): Promise<GoogleUserInfo> {
    if (this.clientIds.length === 0) {
      throw new UnauthorizedException('Google login is not configured');
    }

    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken,
        audience: this.clientIds,
      });

      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Invalid Google token: no payload');
      }

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
