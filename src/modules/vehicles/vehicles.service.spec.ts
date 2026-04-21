import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ConnectorType } from '@prisma/client';

import { VehiclesService } from './vehicles.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('VehiclesService', () => {
  let service: VehiclesService;

  const mockPrismaService = {
    vehicleBrand: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    vehicleModel: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    userVehicle: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockBrand = {
    id: 'brand-123',
    name: 'Tesla',
    logoUrl: 'https://example.com/tesla.png',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockModel = {
    id: 'model-3',
    brandId: 'tesla',
    name: 'Model 3',
    powertrain: 'BEV',
    connectors: ['CCS2'],
    connectorType: ConnectorType.CCS2,
    year: 2024,
    batteryCapacityKwh: 75,
    imageUrl: 'https://example.com/model3.png',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    brand: mockBrand,
  };

  const mockUserVehicle = {
    id: 'user-vehicle-123',
    userId: 'user-123',
    modelId: 'model-3',
    nickname: 'My Tesla',
    isPrimary: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    model: mockModel,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VehiclesService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // BRANDS
  // ============================================================================

  describe('findAllBrands', () => {
    it('should return all active brands', async () => {
      const brands = [mockBrand, { ...mockBrand, id: 'brand-456', name: 'BMW' }];
      mockPrismaService.vehicleBrand.findMany.mockResolvedValue(brands);

      const result = await service.findAllBrands();

      expect(mockPrismaService.vehicleBrand.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(brands);
    });

    it('should filter brands by search term', async () => {
      mockPrismaService.vehicleBrand.findMany.mockResolvedValue([mockBrand]);

      const result = await service.findAllBrands('tes');

      expect(mockPrismaService.vehicleBrand.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          name: { contains: 'tes', mode: 'insensitive' },
        },
        orderBy: { name: 'asc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findBrandById', () => {
    it('should return brand by id', async () => {
      mockPrismaService.vehicleBrand.findFirst.mockResolvedValue(mockBrand);

      const result = await service.findBrandById('brand-123');

      expect(mockPrismaService.vehicleBrand.findFirst).toHaveBeenCalledWith({
        where: { id: 'brand-123', isActive: true },
      });
      expect(result).toEqual(mockBrand);
    });

    it('should throw NotFoundException if brand not found', async () => {
      mockPrismaService.vehicleBrand.findFirst.mockResolvedValue(null);

      await expect(service.findBrandById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // MODELS
  // ============================================================================

  describe('findModelsByBrand', () => {
    it('should return all models for a brand', async () => {
      const models = [mockModel, { ...mockModel, id: 'model-456', name: 'Model Y' }];
      mockPrismaService.vehicleBrand.findFirst.mockResolvedValue(mockBrand);
      mockPrismaService.vehicleModel.findMany.mockResolvedValue(models);

      const result = await service.findModelsByBrand('brand-123');

      expect(mockPrismaService.vehicleBrand.findFirst).toHaveBeenCalledWith({
        where: { id: 'brand-123', isActive: true },
      });
      expect(mockPrismaService.vehicleModel.findMany).toHaveBeenCalledWith({
        where: { brandId: 'brand-123', isActive: true },
        orderBy: [{ year: 'desc' }, { name: 'asc' }],
      });
      expect(result).toEqual(models);
    });

    it('should throw NotFoundException if brand not found', async () => {
      mockPrismaService.vehicleBrand.findFirst.mockResolvedValue(null);

      await expect(service.findModelsByBrand('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findModelById', () => {
    it('should return model with brand', async () => {
      mockPrismaService.vehicleModel.findFirst.mockResolvedValue(mockModel);

      const result = await service.findModelById('model-123');

      expect(mockPrismaService.vehicleModel.findFirst).toHaveBeenCalledWith({
        where: { id: 'model-123', isActive: true },
        include: { brand: true },
      });
      expect(result).toEqual(mockModel);
      expect(result.brand).toBeDefined();
    });

    it('should throw NotFoundException if model not found', async () => {
      mockPrismaService.vehicleModel.findFirst.mockResolvedValue(null);

      await expect(service.findModelById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // USER VEHICLES
  // ============================================================================

  describe('getUserVehicles', () => {
    it('should return all user vehicles ordered by primary first', async () => {
      const vehicles = [mockUserVehicle, { ...mockUserVehicle, id: 'uv-456', isPrimary: false }];
      mockPrismaService.userVehicle.findMany.mockResolvedValue(vehicles);

      const result = await service.getUserVehicles('user-123');

      expect(mockPrismaService.userVehicle.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', deletedAt: null },
        include: { model: { include: { brand: true } } },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toEqual(vehicles);
    });
  });

  describe('createUserVehicle', () => {
    const createDto = {
      modelId: 'model-123',
      nickname: 'My New Tesla',
      setPrimary: false,
    };

    it('should create a new user vehicle', async () => {
      mockPrismaService.vehicleModel.findFirst.mockResolvedValue(mockModel);
      mockPrismaService.userVehicle.findFirst.mockResolvedValue(null);
      mockPrismaService.userVehicle.count.mockResolvedValue(1); // User has other vehicles
      mockPrismaService.userVehicle.create.mockResolvedValue(mockUserVehicle);

      const result = await service.createUserVehicle('user-123', createDto);

      expect(mockPrismaService.vehicleModel.findFirst).toHaveBeenCalledWith({
        where: { id: 'model-123', isActive: true },
        include: { brand: true },
      });
      expect(mockPrismaService.userVehicle.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          modelId: 'model-123',
          nickname: createDto.nickname,
        }),
        include: { model: { include: { brand: true } } },
      });
      expect(result).toBeDefined();
    });

    it('should set first vehicle as primary automatically', async () => {
      mockPrismaService.vehicleModel.findFirst.mockResolvedValue(mockModel);
      mockPrismaService.userVehicle.findFirst.mockResolvedValue(null);
      mockPrismaService.userVehicle.count.mockResolvedValue(0); // No existing vehicles
      mockPrismaService.userVehicle.create.mockResolvedValue({
        ...mockUserVehicle,
        isPrimary: true,
      });

      await service.createUserVehicle('user-123', createDto);

      expect(mockPrismaService.userVehicle.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isPrimary: true,
        }),
        include: { model: { include: { brand: true } } },
      });
    });

    it('should unset other primaries when setPrimary is true', async () => {
      mockPrismaService.vehicleModel.findFirst.mockResolvedValue(mockModel);
      mockPrismaService.userVehicle.findFirst.mockResolvedValue(null);
      mockPrismaService.userVehicle.count.mockResolvedValue(2);
      mockPrismaService.userVehicle.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.userVehicle.create.mockResolvedValue(mockUserVehicle);

      await service.createUserVehicle('user-123', { ...createDto, setPrimary: true });

      expect(mockPrismaService.userVehicle.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', isPrimary: true },
        data: { isPrimary: false },
      });
    });

    it('should throw ConflictException if vehicle already added', async () => {
      mockPrismaService.vehicleModel.findFirst.mockResolvedValue(mockModel);
      mockPrismaService.userVehicle.findFirst.mockResolvedValue(mockUserVehicle);

      await expect(service.createUserVehicle('user-123', createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException if model not found', async () => {
      mockPrismaService.vehicleModel.findFirst.mockResolvedValue(null);

      await expect(service.createUserVehicle('user-123', createDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateUserVehicle', () => {
    const updateDto = {
      nickname: 'Updated Name',
      isPrimary: true,
    };

    it('should update a user vehicle', async () => {
      mockPrismaService.userVehicle.findFirst.mockResolvedValue(mockUserVehicle);
      mockPrismaService.userVehicle.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.userVehicle.update.mockResolvedValue({ ...mockUserVehicle, ...updateDto });

      const result = await service.updateUserVehicle('user-123', 'user-vehicle-123', updateDto);

      expect(mockPrismaService.userVehicle.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-vehicle-123', userId: 'user-123', deletedAt: null },
      });
      expect(mockPrismaService.userVehicle.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', isPrimary: true, id: { not: 'user-vehicle-123' } },
        data: { isPrimary: false },
      });
      expect(result.nickname).toBe(updateDto.nickname);
    });

    it('should throw NotFoundException if vehicle not found', async () => {
      mockPrismaService.userVehicle.findFirst.mockResolvedValue(null);

      await expect(service.updateUserVehicle('user-123', 'nonexistent', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteUserVehicle', () => {
    it('should soft delete a user vehicle', async () => {
      mockPrismaService.userVehicle.findFirst
        .mockResolvedValueOnce(mockUserVehicle)
        .mockResolvedValueOnce(null); // No other vehicle to make primary
      mockPrismaService.userVehicle.update.mockResolvedValue({
        ...mockUserVehicle,
        deletedAt: new Date(),
      });

      await service.deleteUserVehicle('user-123', 'user-vehicle-123');

      expect(mockPrismaService.userVehicle.update).toHaveBeenCalledWith({
        where: { id: 'user-vehicle-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should set next vehicle as primary when deleting primary', async () => {
      const nextVehicle = { ...mockUserVehicle, id: 'next-vehicle', isPrimary: false };
      mockPrismaService.userVehicle.findFirst
        .mockResolvedValueOnce(mockUserVehicle)
        .mockResolvedValueOnce(nextVehicle);
      mockPrismaService.userVehicle.update.mockResolvedValue(mockUserVehicle);

      await service.deleteUserVehicle('user-123', 'user-vehicle-123');

      expect(mockPrismaService.userVehicle.update).toHaveBeenCalledWith({
        where: { id: 'next-vehicle' },
        data: { isPrimary: true },
      });
    });

    it('should throw NotFoundException if vehicle not found', async () => {
      mockPrismaService.userVehicle.findFirst.mockResolvedValue(null);

      await expect(service.deleteUserVehicle('user-123', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPrimaryVehicleConnector', () => {
    it('should return connector type of primary vehicle', async () => {
      mockPrismaService.userVehicle.findFirst.mockResolvedValue(mockUserVehicle);

      const result = await service.getPrimaryVehicleConnector('user-123');

      expect(mockPrismaService.userVehicle.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-123', isPrimary: true, deletedAt: null },
        include: { model: true },
      });
      expect(result).toBe(ConnectorType.CCS2);
    });

    it('should return null if no primary vehicle', async () => {
      mockPrismaService.userVehicle.findFirst.mockResolvedValue(null);

      const result = await service.getPrimaryVehicleConnector('user-123');

      expect(result).toBeNull();
    });
  });
});
