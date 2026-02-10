import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuthProvider, UserRole } from '@prisma/client';

import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    avatarUrl: 'https://example.com/avatar.jpg',
    provider: AuthProvider.EMAIL,
    providerId: null,
    emailVerified: true,
    role: UserRole.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return user by id', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findById('user-123');

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123', deletedAt: null },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should not return soft-deleted users', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('deleted-user')).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'deleted-user', deletedAt: null },
      });
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', deletedAt: null },
      });
      expect(result).toEqual(mockUser);
    });

    it('should lowercase email before searching', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await service.findByEmail('TEST@EXAMPLE.COM');

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', deletedAt: null },
      });
    });

    it('should return null if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    const updateDto = {
      firstName: 'Jane',
      lastName: 'Smith',
      avatarUrl: 'https://example.com/new-avatar.jpg',
    };

    it('should update user profile', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, ...updateDto });

      const result = await service.update('user-123', updateDto);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123', deletedAt: null },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          firstName: updateDto.firstName,
          lastName: updateDto.lastName,
          avatarUrl: updateDto.avatarUrl,
        },
      });
      expect(result.firstName).toBe(updateDto.firstName);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', updateDto)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should allow partial updates', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, firstName: 'Jane' });

      await service.update('user-123', { firstName: 'Jane' });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          firstName: 'Jane',
          lastName: undefined,
          avatarUrl: undefined,
        },
      });
    });
  });

  describe('softDelete', () => {
    it('should soft delete a user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, deletedAt: new Date() });

      await service.softDelete('user-123');

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123', deletedAt: null },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.softDelete('nonexistent')).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });
});
