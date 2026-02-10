import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ConnectorType, PortStatus, ChargerType } from '@prisma/client';

import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminService', () => {
  let service: AdminService;

  const mockPrismaService = {
    vehicleBrand: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    vehicleModel: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    station: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    stationImage: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    port: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockBrand = {
    id: 'brand-123',
    name: 'Tesla',
    logoUrl: 'https://example.com/tesla.png',
    country: 'US',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockModel = {
    id: 'model-123',
    brandId: 'brand-123',
    name: 'Model 3',
    year: 2024,
    connectorType: ConnectorType.CCS2,
    batteryCapacityKwh: 75,
    rangeKm: 500,
    imageUrl: 'https://example.com/model3.png',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStation = {
    id: 'station-123',
    name: 'CHRGE VI Station',
    description: 'Premium charging',
    address: '123 VI',
    city: 'Lagos',
    state: 'Lagos',
    postalCode: '101001',
    country: 'NG',
    latitude: 6.4281,
    longitude: 3.4219,
    timezone: 'Africa/Lagos',
    isActive: true,
    isVerified: false,
    operatingHours: null,
    amenities: [],
    pricing: null,
    phoneNumber: null,
    email: null,
    networkId: null,
    totalPorts: 0,
    availablePorts: 0,
    avgRating: null,
    reviewCount: 0,
    lastStatusUpdate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockPort = {
    id: 'port-123',
    stationId: 'station-123',
    connectorType: ConnectorType.CCS2,
    chargerType: ChargerType.DCFC,
    powerKw: 150,
    status: PortStatus.AVAILABLE,
    portNumber: 'A1',
    pricePerKwh: 350,
    pricePerMinute: null,
    pricePerSession: 500,
    estimatedAvailableAt: null,
    lastStatusUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    station: mockStation,
  };

  const mockImage = {
    id: 'image-123',
    stationId: 'station-123',
    url: 'https://example.com/station.jpg',
    caption: 'Front view',
    isPrimary: true,
    sortOrder: 1,
    uploadedBy: 'admin-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // VEHICLE BRANDS
  // ============================================================================

  describe('createBrand', () => {
    const createBrandDto = {
      name: 'Tesla',
      logoUrl: 'https://example.com/tesla.png',
      country: 'US',
    };

    it('should create a new vehicle brand', async () => {
      mockPrismaService.vehicleBrand.findUnique.mockResolvedValue(null);
      mockPrismaService.vehicleBrand.create.mockResolvedValue(mockBrand);

      const result = await service.createBrand(createBrandDto);

      expect(mockPrismaService.vehicleBrand.findUnique).toHaveBeenCalledWith({
        where: { name: 'Tesla' },
      });
      expect(mockPrismaService.vehicleBrand.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Tesla',
          logoUrl: createBrandDto.logoUrl,
          country: 'US',
          isActive: true,
        }),
      });
      expect(result).toEqual(mockBrand);
    });

    it('should throw ConflictException if brand already exists', async () => {
      mockPrismaService.vehicleBrand.findUnique.mockResolvedValue(mockBrand);

      await expect(service.createBrand(createBrandDto)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.vehicleBrand.create).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // VEHICLE MODELS
  // ============================================================================

  describe('createModel', () => {
    const createModelDto = {
      brandId: 'brand-123',
      name: 'Model 3',
      year: 2024,
      connectorType: ConnectorType.CCS2,
      batteryCapacityKwh: 75,
      rangeKm: 500,
    };

    it('should create a new vehicle model', async () => {
      mockPrismaService.vehicleBrand.findUnique.mockResolvedValue(mockBrand);
      mockPrismaService.vehicleModel.findFirst.mockResolvedValue(null);
      mockPrismaService.vehicleModel.create.mockResolvedValue(mockModel);

      const result = await service.createModel(createModelDto);

      expect(mockPrismaService.vehicleBrand.findUnique).toHaveBeenCalledWith({
        where: { id: 'brand-123' },
      });
      expect(mockPrismaService.vehicleModel.findFirst).toHaveBeenCalledWith({
        where: {
          brandId: 'brand-123',
          name: 'Model 3',
          year: 2024,
        },
      });
      expect(mockPrismaService.vehicleModel.create).toHaveBeenCalled();
      expect(result).toEqual(mockModel);
    });

    it('should throw NotFoundException if brand not found', async () => {
      mockPrismaService.vehicleBrand.findUnique.mockResolvedValue(null);

      await expect(service.createModel(createModelDto)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.vehicleModel.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if model already exists', async () => {
      mockPrismaService.vehicleBrand.findUnique.mockResolvedValue(mockBrand);
      mockPrismaService.vehicleModel.findFirst.mockResolvedValue(mockModel);

      await expect(service.createModel(createModelDto)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.vehicleModel.create).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // STATIONS
  // ============================================================================

  describe('createStation', () => {
    const createStationDto = {
      name: 'CHRGE VI Station',
      description: 'Premium charging',
      address: '123 VI',
      city: 'Lagos',
      state: 'Lagos',
      latitude: 6.4281,
      longitude: 3.4219,
    };

    it('should create a new station', async () => {
      mockPrismaService.station.create.mockResolvedValue(mockStation);

      const result = await service.createStation(createStationDto);

      expect(mockPrismaService.station.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: createStationDto.name,
          city: createStationDto.city,
          country: 'NG',
          timezone: 'Africa/Lagos',
          isActive: true,
          isVerified: false,
        }),
      });
      expect(result).toEqual(mockStation);
    });

    it('should use provided country and timezone', async () => {
      const dtoWithOverrides = {
        ...createStationDto,
        country: 'GH',
        timezone: 'Africa/Accra',
      };
      mockPrismaService.station.create.mockResolvedValue({
        ...mockStation,
        country: 'GH',
        timezone: 'Africa/Accra',
      });

      await service.createStation(dtoWithOverrides);

      expect(mockPrismaService.station.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          country: 'GH',
          timezone: 'Africa/Accra',
        }),
      });
    });
  });

  describe('updateStation', () => {
    const updateDto = {
      name: 'Updated Station Name',
      isVerified: true,
    };

    it('should update a station', async () => {
      mockPrismaService.station.findUnique.mockResolvedValue(mockStation);
      mockPrismaService.station.update.mockResolvedValue({ ...mockStation, ...updateDto });

      const result = await service.updateStation('station-123', updateDto);

      expect(mockPrismaService.station.findUnique).toHaveBeenCalledWith({
        where: { id: 'station-123' },
      });
      expect(mockPrismaService.station.update).toHaveBeenCalledWith({
        where: { id: 'station-123' },
        data: expect.objectContaining({
          name: updateDto.name,
          isVerified: updateDto.isVerified,
        }),
      });
      expect(result.name).toBe(updateDto.name);
    });

    it('should throw NotFoundException if station not found', async () => {
      mockPrismaService.station.findUnique.mockResolvedValue(null);

      await expect(service.updateStation('nonexistent', updateDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.station.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // STATION IMAGES
  // ============================================================================

  describe('addStationImage', () => {
    const createImageDto = {
      url: 'https://example.com/new-image.jpg',
      caption: 'New image',
      isPrimary: true,
    };

    it('should add an image to a station', async () => {
      mockPrismaService.station.findUnique.mockResolvedValue(mockStation);
      mockPrismaService.stationImage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.stationImage.findFirst.mockResolvedValue({ sortOrder: 2 });
      mockPrismaService.stationImage.create.mockResolvedValue(mockImage);

      const result = await service.addStationImage('station-123', createImageDto, 'admin-123');

      expect(mockPrismaService.station.findUnique).toHaveBeenCalledWith({
        where: { id: 'station-123' },
      });
      expect(mockPrismaService.stationImage.updateMany).toHaveBeenCalledWith({
        where: { stationId: 'station-123', isPrimary: true },
        data: { isPrimary: false },
      });
      expect(mockPrismaService.stationImage.create).toHaveBeenCalled();
      expect(result).toEqual(mockImage);
    });

    it('should throw NotFoundException if station not found', async () => {
      mockPrismaService.station.findUnique.mockResolvedValue(null);

      await expect(service.addStationImage('nonexistent', createImageDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not update other primaries if not setting as primary', async () => {
      const nonPrimaryDto = { ...createImageDto, isPrimary: false };
      mockPrismaService.station.findUnique.mockResolvedValue(mockStation);
      mockPrismaService.stationImage.findFirst.mockResolvedValue({ sortOrder: 1 });
      mockPrismaService.stationImage.create.mockResolvedValue({ ...mockImage, isPrimary: false });

      await service.addStationImage('station-123', nonPrimaryDto);

      expect(mockPrismaService.stationImage.updateMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // PORTS
  // ============================================================================

  describe('addPort', () => {
    const createPortDto = {
      connectorType: ConnectorType.CCS2,
      chargerType: ChargerType.DCFC,
      powerKw: 150,
      status: PortStatus.AVAILABLE,
      portNumber: 'A1',
      pricePerKwh: 350,
    };

    it('should add a port to a station', async () => {
      mockPrismaService.station.findUnique.mockResolvedValue(mockStation);
      mockPrismaService.port.create.mockResolvedValue(mockPort);
      mockPrismaService.port.count.mockResolvedValue(1);
      mockPrismaService.station.update.mockResolvedValue({ ...mockStation, totalPorts: 1 });

      const result = await service.addPort('station-123', createPortDto);

      expect(mockPrismaService.station.findUnique).toHaveBeenCalledWith({
        where: { id: 'station-123' },
      });
      expect(mockPrismaService.port.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stationId: 'station-123',
          connectorType: ConnectorType.CCS2,
          powerKw: 150,
        }),
      });
      expect(mockPrismaService.station.update).toHaveBeenCalled(); // Port count update
      expect(result).toEqual(mockPort);
    });

    it('should throw NotFoundException if station not found', async () => {
      mockPrismaService.station.findUnique.mockResolvedValue(null);

      await expect(service.addPort('nonexistent', createPortDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.port.create).not.toHaveBeenCalled();
    });
  });

  describe('updatePort', () => {
    const updatePortDto = {
      status: PortStatus.IN_USE,
      estimatedAvailableAt: new Date(Date.now() + 3600000).toISOString(),
    };

    it('should update a port', async () => {
      mockPrismaService.port.findUnique.mockResolvedValue(mockPort);
      mockPrismaService.port.update.mockResolvedValue({ ...mockPort, status: PortStatus.IN_USE });
      mockPrismaService.port.count.mockResolvedValue(1);
      mockPrismaService.station.update.mockResolvedValue(mockStation);

      const result = await service.updatePort('port-123', updatePortDto);

      expect(mockPrismaService.port.findUnique).toHaveBeenCalledWith({
        where: { id: 'port-123' },
        include: { station: true },
      });
      expect(mockPrismaService.port.update).toHaveBeenCalledWith({
        where: { id: 'port-123' },
        data: expect.objectContaining({
          status: PortStatus.IN_USE,
          lastStatusUpdate: expect.any(Date),
        }),
      });
      expect(mockPrismaService.station.update).toHaveBeenCalled(); // Port count update
      expect(result.status).toBe(PortStatus.IN_USE);
    });

    it('should throw NotFoundException if port not found', async () => {
      mockPrismaService.port.findUnique.mockResolvedValue(null);

      await expect(service.updatePort('nonexistent', updatePortDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.port.update).not.toHaveBeenCalled();
    });

    it('should not update station port counts if status not changed', async () => {
      const updateNicknameDto = { portNumber: 'B2' };
      mockPrismaService.port.findUnique.mockResolvedValue(mockPort);
      mockPrismaService.port.update.mockResolvedValue({ ...mockPort, portNumber: 'B2' });

      await service.updatePort('port-123', updateNicknameDto);

      expect(mockPrismaService.station.update).not.toHaveBeenCalled();
    });
  });
});
