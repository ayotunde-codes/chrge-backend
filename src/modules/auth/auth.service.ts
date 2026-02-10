import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthProvider } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { GoogleAuthService, GoogleUserInfo } from './google-auth.service';
import { UsersService } from '../users/users.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Register a new user with email and password
   */
  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResponseDto> {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      // Prevent user enumeration: return generic error
      throw new ConflictException('Unable to create account. Please try a different email.');
    }

    // Hash password
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        provider: AuthProvider.EMAIL,
        emailVerified: false, // Would send verification email in production
      },
    });

    this.logger.log(`New user registered: ${user.id}`);

    // Generate tokens
    const tokens = await this.tokenService.generateTokens(user, meta);

    return {
      user: this.mapUserToResponse(user),
      ...tokens,
    };
  }

  /**
   * Login with email and password
   */
  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResponseDto> {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Prevent user enumeration: use same error for missing user and wrong password
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if user is soft deleted
    if (user.deletedAt) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    this.logger.log(`User logged in: ${user.id}`);

    // Generate tokens
    const tokens = await this.tokenService.generateTokens(user, meta);

    return {
      user: this.mapUserToResponse(user),
      ...tokens,
    };
  }

  /**
   * Login or register with Google ID token
   */
  async googleLogin(dto: GoogleLoginDto, meta: RequestMeta): Promise<AuthResponseDto> {
    // Verify Google ID token
    const googleUser: GoogleUserInfo = await this.googleAuthService.verifyIdToken(dto.idToken);

    // Try to find existing user by Google ID or email
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { providerId: googleUser.sub, provider: AuthProvider.GOOGLE },
          { email: googleUser.email.toLowerCase() },
        ],
      },
    });

    if (user) {
      // If user exists with email but different provider, link Google account
      if (user.provider !== AuthProvider.GOOGLE) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            provider: AuthProvider.GOOGLE,
            providerId: googleUser.sub,
            emailVerified: true,
            avatarUrl: user.avatarUrl || googleUser.picture,
          },
        });
        this.logger.log(`Linked Google account to existing user: ${user.id}`);
      }

      // Check if user is soft deleted
      if (user.deletedAt) {
        throw new UnauthorizedException('Account has been deactivated');
      }
    } else {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          email: googleUser.email.toLowerCase(),
          firstName: googleUser.given_name,
          lastName: googleUser.family_name,
          avatarUrl: googleUser.picture,
          provider: AuthProvider.GOOGLE,
          providerId: googleUser.sub,
          emailVerified: true,
        },
      });
      this.logger.log(`New user created via Google: ${user.id}`);
    }

    // Generate tokens
    const tokens = await this.tokenService.generateTokens(user, meta);

    return {
      user: this.mapUserToResponse(user),
      ...tokens,
    };
  }

  /**
   * Refresh tokens using a valid refresh token
   */
  async refreshTokens(refreshToken: string, meta: RequestMeta): Promise<AuthResponseDto> {
    // Validate and rotate refresh token
    const { user, accessToken, refreshToken: newRefreshToken, expiresIn } =
      await this.tokenService.rotateRefreshToken(refreshToken, meta);

    return {
      user: this.mapUserToResponse(user),
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
    };
  }

  /**
   * Logout user by revoking refresh token(s)
   */
  async logout(userId: string, dto: LogoutDto): Promise<void> {
    if (dto.revokeAll) {
      // Revoke all refresh tokens for user
      await this.tokenService.revokeAllUserTokens(userId);
      this.logger.log(`All tokens revoked for user: ${userId}`);
    } else if (dto.refreshToken) {
      // Revoke specific refresh token
      await this.tokenService.revokeRefreshToken(dto.refreshToken);
      this.logger.log(`Token revoked for user: ${userId}`);
    }
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(userId: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);
    return this.mapUserToResponse(user);
  }

  /**
   * Map user entity to response DTO
   */
  private mapUserToResponse(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    provider: AuthProvider;
    emailVerified: boolean;
    role: string;
    createdAt: Date;
  }): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      provider: user.provider,
      emailVerified: user.emailVerified,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}




