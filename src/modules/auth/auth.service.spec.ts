import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthProvider, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { GoogleAuthService } from './google-auth.service';
import { UsersService } from '../users/users.service';

// Mock argon2
jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockTokenService = {
    generateTokens: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  const mockGoogleAuthService = {
    verifyIdToken: jest.fn(),
  };

  const mockUsersService = {
    findById: jest.fn(),
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    avatarUrl: null,
    provider: AuthProvider.EMAIL,
    providerId: null,
    emailVerified: false,
    role: UserRole.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockTokens = {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-123',
    expiresIn: 900,
  };

  const mockRequestMeta = {
    userAgent: 'Mozilla/5.0',
    ip: '127.0.0.1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: GoogleAuthService, useValue: mockGoogleAuthService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: 'new@example.com',
      password: 'Password123!',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    it('should register a new user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
      });
      mockTokenService.generateTokens.mockResolvedValue(mockTokens);

      const result = await service.register(registerDto, mockRequestMeta);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerDto.email.toLowerCase() },
      });
      expect(argon2.hash).toHaveBeenCalledWith(registerDto.password, expect.any(Object));
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: registerDto.email.toLowerCase(),
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          provider: AuthProvider.EMAIL,
          emailVerified: false,
        }),
      });
      expect(mockTokenService.generateTokens).toHaveBeenCalled();
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', mockTokens.accessToken);
      expect(result).toHaveProperty('refreshToken', mockTokens.refreshToken);
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.register(registerDto, mockRequestMeta)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('should lowercase the email', async () => {
      const upperCaseDto = { ...registerDto, email: 'NEW@EXAMPLE.COM' };
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockTokenService.generateTokens.mockResolvedValue(mockTokens);

      await service.register(upperCaseDto, mockRequestMeta);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'new@example.com' },
      });
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login successfully with valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      mockTokenService.generateTokens.mockResolvedValue(mockTokens);

      const result = await service.login(loginDto, mockRequestMeta);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginDto.email.toLowerCase() },
      });
      expect(argon2.verify).toHaveBeenCalledWith(mockUser.passwordHash, loginDto.password);
      expect(mockTokenService.generateTokens).toHaveBeenCalledWith(mockUser, mockRequestMeta);
      expect(result).toHaveProperty('accessToken', mockTokens.accessToken);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto, mockRequestMeta)).rejects.toThrow(UnauthorizedException);
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto, mockRequestMeta)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user has no password (OAuth user)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: null,
      });

      await expect(service.login(loginDto, mockRequestMeta)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is soft deleted', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginDto, mockRequestMeta)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('googleLogin', () => {
    const googleLoginDto = { idToken: 'google-id-token' };
    const googleUserInfo = {
      sub: 'google-user-123',
      email: 'google@example.com',
      given_name: 'Google',
      family_name: 'User',
      picture: 'https://example.com/avatar.jpg',
      email_verified: true,
    };

    it('should create new user for first-time Google login', async () => {
      mockGoogleAuthService.verifyIdToken.mockResolvedValue(googleUserInfo);
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: googleUserInfo.email,
        provider: AuthProvider.GOOGLE,
        providerId: googleUserInfo.sub,
      });
      mockTokenService.generateTokens.mockResolvedValue(mockTokens);

      const result = await service.googleLogin(googleLoginDto, mockRequestMeta);

      expect(mockGoogleAuthService.verifyIdToken).toHaveBeenCalledWith(googleLoginDto.idToken);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: googleUserInfo.email.toLowerCase(),
          firstName: googleUserInfo.given_name,
          lastName: googleUserInfo.family_name,
          provider: AuthProvider.GOOGLE,
          providerId: googleUserInfo.sub,
          emailVerified: true,
        }),
      });
      expect(result).toHaveProperty('accessToken');
    });

    it('should link Google to existing email user', async () => {
      const existingEmailUser = {
        ...mockUser,
        provider: AuthProvider.EMAIL,
      };
      mockGoogleAuthService.verifyIdToken.mockResolvedValue(googleUserInfo);
      mockPrismaService.user.findFirst.mockResolvedValue(existingEmailUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...existingEmailUser,
        provider: AuthProvider.GOOGLE,
        providerId: googleUserInfo.sub,
      });
      mockTokenService.generateTokens.mockResolvedValue(mockTokens);

      await service.googleLogin(googleLoginDto, mockRequestMeta);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: existingEmailUser.id },
        data: expect.objectContaining({
          provider: AuthProvider.GOOGLE,
          providerId: googleUserInfo.sub,
          emailVerified: true,
        }),
      });
    });

    it('should login existing Google user', async () => {
      const existingGoogleUser = {
        ...mockUser,
        provider: AuthProvider.GOOGLE,
        providerId: googleUserInfo.sub,
      };
      mockGoogleAuthService.verifyIdToken.mockResolvedValue(googleUserInfo);
      mockPrismaService.user.findFirst.mockResolvedValue(existingGoogleUser);
      mockTokenService.generateTokens.mockResolvedValue(mockTokens);

      const result = await service.googleLogin(googleLoginDto, mockRequestMeta);

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException if Google user is deactivated', async () => {
      mockGoogleAuthService.verifyIdToken.mockResolvedValue(googleUserInfo);
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...mockUser,
        provider: AuthProvider.GOOGLE,
        deletedAt: new Date(),
      });

      await expect(service.googleLogin(googleLoginDto, mockRequestMeta)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens successfully', async () => {
      const refreshToken = 'valid-refresh-token';
      mockTokenService.rotateRefreshToken.mockResolvedValue({
        ...mockTokens,
        user: mockUser,
      });

      const result = await service.refreshTokens(refreshToken, mockRequestMeta);

      expect(mockTokenService.rotateRefreshToken).toHaveBeenCalledWith(
        refreshToken,
        mockRequestMeta,
      );
      expect(result).toHaveProperty('accessToken', mockTokens.accessToken);
      expect(result).toHaveProperty('refreshToken', mockTokens.refreshToken);
      expect(result).toHaveProperty('user');
    });
  });

  describe('logout', () => {
    it('should revoke all tokens when revokeAll is true', async () => {
      await service.logout('user-123', { revokeAll: true });

      expect(mockTokenService.revokeAllUserTokens).toHaveBeenCalledWith('user-123');
      expect(mockTokenService.revokeRefreshToken).not.toHaveBeenCalled();
    });

    it('should revoke specific token when refreshToken is provided', async () => {
      const refreshToken = 'specific-token';
      await service.logout('user-123', { refreshToken });

      expect(mockTokenService.revokeRefreshToken).toHaveBeenCalledWith(refreshToken);
      expect(mockTokenService.revokeAllUserTokens).not.toHaveBeenCalled();
    });

    it('should do nothing if neither revokeAll nor refreshToken is provided', async () => {
      await service.logout('user-123', {});

      expect(mockTokenService.revokeAllUserTokens).not.toHaveBeenCalled();
      expect(mockTokenService.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user profile', async () => {
      mockUsersService.findById.mockResolvedValue(mockUser);

      const result = await service.getCurrentUser('user-123');

      expect(mockUsersService.findById).toHaveBeenCalledWith('user-123');
      expect(result).toHaveProperty('id', mockUser.id);
      expect(result).toHaveProperty('email', mockUser.email);
      expect(result).not.toHaveProperty('passwordHash');
    });
  });
});
