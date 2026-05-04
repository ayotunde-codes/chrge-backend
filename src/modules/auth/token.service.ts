import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { hashRefreshToken, generateSecureToken } from '../../common/utils/hash.util';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly refreshTokenPepper: string;
  private readonly refreshTokenExpirationDays: number;
  private readonly accessTokenExpirationMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshTokenPepper = this.configService.getOrThrow<string>('REFRESH_TOKEN_PEPPER');

    // Parse refresh token expiration (e.g., "30d" -> 30)
    const refreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '30d');
    this.refreshTokenExpirationDays = parseInt(refreshExpiration.replace('d', ''), 10) || 30;

    // Parse access token expiration (e.g., "15m" -> 15)
    const accessExpiration = this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m');
    this.accessTokenExpirationMinutes = parseInt(accessExpiration.replace('m', ''), 10) || 15;
  }

  /**
   * Generate access and refresh tokens for a user
   */
  async generateTokens(user: User, meta: RequestMeta): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    // Generate access token
    const accessToken = this.jwtService.sign(payload);

    // Generate refresh token (random 256-bit token)
    const refreshToken = generateSecureToken();
    const tokenHash = hashRefreshToken(refreshToken, this.refreshTokenPepper);

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenExpirationDays);

    // Store hashed refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        userAgent: meta.userAgent,
        ipAddress: meta.ip,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpirationMinutes * 60, // in seconds
    };
  }

  /**
   * Validate and rotate a refresh token
   */
  async rotateRefreshToken(
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<TokenPair & { user: User }> {
    const tokenHash = hashRefreshToken(refreshToken, this.refreshTokenPepper);

    // Find the token in database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    // Validate token
    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.revokedAt) {
      // Token reuse detected - potentially compromised
      this.logger.warn(`Refresh token reuse detected for user: ${storedToken.userId}`);
      // Revoke all tokens for this user as a security measure
      await this.revokeAllUserTokens(storedToken.userId);
      throw new UnauthorizedException('Token has been revoked. Please login again.');
    }

    if (storedToken.expiresAt < new Date()) {
      // Delete expired token
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Check if user is active
    if (storedToken.user.deletedAt) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    // Revoke old token (mark as used)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(storedToken.user, meta);

    return {
      ...tokens,
      user: storedToken.user,
    };
  }

  /**
   * Revoke a specific refresh token
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken, this.refreshTokenPepper);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Clean up expired tokens (can be run as a cron job)
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired/revoked tokens`);
    return result.count;
  }
}
