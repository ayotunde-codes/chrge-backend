import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';

import { TokenService } from './token.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as hashUtil from '../../common/utils/hash.util';

// Mock hash utilities
jest.mock('../../common/utils/hash.util');

describe('TokenService', () => {
  let service: TokenService;

  const mockPrismaService = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('jwt-access-token'),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('pepper-secret'),
    get: jest.fn().mockImplementation((key: string, defaultValue: string) => defaultValue),
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: UserRole.USER,
    passwordHash: 'hashed',
    firstName: 'John',
    lastName: 'Doe',
    avatarUrl: null,
    provider: 'EMAIL',
    providerId: null,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockRequestMeta = {
    userAgent: 'Mozilla/5.0',
    ip: '127.0.0.1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);

    // Setup hash util mocks
    (hashUtil.generateSecureToken as jest.Mock).mockReturnValue('secure-random-token');
    (hashUtil.hashRefreshToken as jest.Mock).mockReturnValue('hashed-token');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      mockPrismaService.refreshToken.create.mockResolvedValue({
        id: 'token-id',
        tokenHash: 'hashed-token',
        userId: mockUser.id,
        expiresAt: new Date(),
        createdAt: new Date(),
        userAgent: mockRequestMeta.userAgent,
        ipAddress: mockRequestMeta.ip,
        revokedAt: null,
      });

      const result = await service.generateTokens(mockUser as any, mockRequestMeta);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
      expect(hashUtil.generateSecureToken).toHaveBeenCalled();
      expect(hashUtil.hashRefreshToken).toHaveBeenCalledWith(
        'secure-random-token',
        'pepper-secret',
      );
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokenHash: 'hashed-token',
          userId: mockUser.id,
          userAgent: mockRequestMeta.userAgent,
          ipAddress: mockRequestMeta.ip,
        }),
      });
      expect(result).toEqual({
        accessToken: 'jwt-access-token',
        refreshToken: 'secure-random-token',
        expiresIn: 900, // 15 minutes in seconds
      });
    });
  });

  describe('rotateRefreshToken', () => {
    const mockStoredToken = {
      id: 'token-id',
      tokenHash: 'hashed-token',
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 86400000), // Tomorrow
      createdAt: new Date(),
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
      revokedAt: null,
      user: mockUser,
    };

    it('should rotate refresh token successfully', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(mockStoredToken);
      mockPrismaService.refreshToken.update.mockResolvedValue({
        ...mockStoredToken,
        revokedAt: new Date(),
      });
      mockPrismaService.refreshToken.create.mockResolvedValue(mockStoredToken);

      const result = await service.rotateRefreshToken('valid-refresh-token', mockRequestMeta);

      expect(hashUtil.hashRefreshToken).toHaveBeenCalledWith(
        'valid-refresh-token',
        'pepper-secret',
      );
      expect(mockPrismaService.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: 'hashed-token' },
        include: { user: true },
      });
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: mockStoredToken.id },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotateRefreshToken('invalid-token', mockRequestMeta)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should revoke all tokens on token reuse detection', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...mockStoredToken,
        revokedAt: new Date(), // Already revoked = reuse!
      });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 5 });

      await expect(service.rotateRefreshToken('reused-token', mockRequestMeta)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should throw UnauthorizedException for expired token', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...mockStoredToken,
        expiresAt: new Date(Date.now() - 1000), // Expired
      });
      mockPrismaService.refreshToken.delete.mockResolvedValue(mockStoredToken);

      await expect(service.rotateRefreshToken('expired-token', mockRequestMeta)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrismaService.refreshToken.delete).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for deactivated user', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...mockStoredToken,
        user: { ...mockUser, deletedAt: new Date() },
      });

      await expect(service.rotateRefreshToken('valid-token', mockRequestMeta)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke a specific refresh token', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.revokeRefreshToken('token-to-revoke');

      expect(hashUtil.hashRefreshToken).toHaveBeenCalledWith('token-to-revoke', 'pepper-secret');
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'hashed-token', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for a user', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 5 });

      await service.revokeAllUserTokens('user-123');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired and revoked tokens', async () => {
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 10 });

      const result = await service.cleanupExpiredTokens();

      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ expiresAt: { lt: expect.any(Date) } }, { revokedAt: { not: null } }],
        },
      });
      expect(result).toBe(10);
    });
  });
});
