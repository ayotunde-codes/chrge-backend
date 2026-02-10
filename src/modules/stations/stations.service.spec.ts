import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConnectorType, PortStatus } from '@prisma/client';

import { StationsService } from './stations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VehiclesService } from '../vehicles/vehicles.service';

describe('StationsService', () => {
  let service: StationsService;

  const mockPrismaService = {
    station: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    port: {
      findMany: jest.fn(),
    },
    stationImage: {
      findMany: jest.fn(),
    },
    favorite: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    review: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockVehiclesService = {
    getPrimaryVehicleConnector: jest.fn(),
  };

  const mockStation = {
    id: 'station-123',
    name: 'CHRGE VI Station',
    description: 'Premium charging station',
    address: '123 Victoria Island',
    city: 'Lagos',
    state: 'Lagos',
    postalCode: '101001',
    country: 'Nigeria',
    latitude: 6.4281,
    longitude: 3.4219,
    timezone: 'Africa/Lagos',
    isActive: true,
    isVerified: true,
    operatingHours: { mon: { open: '08:00', close: '22:00' } },
    amenities: ['wifi', 'restrooms'],
    pricing: { perKwh: 350, currency: 'NGN' },
    phoneNumber: '+2341234567890',
    networkId: 'network-123',
    totalPorts: 4,
    availablePorts: 2,
    avgRating: 4.5,
    reviewCount: 10,
    lastStatusUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockPort = {
    id: 'port-123',
    stationId: 'station-123',
    connectorType: ConnectorType.CCS2,
    chargerType: 'DC_FAST',
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
  };

  const mockNetwork = {
    id: 'network-123',
    name: 'CHRGE',
    logoUrl: 'https://example.com/logo.png',
    website: 'https://chrge.ng',
    phoneNumber: '+2341234567890',
  };

  const mockImage = {
    id: 'image-123',
    stationId: 'station-123',
    url: 'https://example.com/station.jpg',
    caption: 'Front view',
    isPrimary: true,
    sortOrder: 0,
  };

  const mockReview = {
    id: 'review-123',
    userId: 'user-123',
    stationId: 'station-123',
    rating: 5,
    comment: 'Great station!',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    user: {
      id: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      avatarUrl: null,
    },
  };

  const mockFavorite = {
    id: 'favorite-123',
    userId: 'user-123',
    stationId: 'station-123',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: VehiclesService, useValue: mockVehiclesService },
      ],
    }).compile();

    service = module.get<StationsService>(StationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // STATION DETAILS
  // ============================================================================

  describe('findById', () => {
    it('should return station details', async () => {
      const stationWithRelations = {
        ...mockStation,
        network: mockNetwork,
        ports: [mockPort],
        images: [mockImage],
      };
      mockPrismaService.station.findFirst.mockResolvedValue(stationWithRelations);
      mockPrismaService.favorite.findUnique.mockResolvedValue(null);

      const result = await service.findById('station-123');

      expect(mockPrismaService.station.findFirst).toHaveBeenCalledWith({
        where: { id: 'station-123', isActive: true, deletedAt: null },
        include: expect.objectContaining({
          network: expect.any(Object),
          ports: expect.any(Object),
          images: expect.any(Object),
        }),
      });
      expect(result).toHaveProperty('id', 'station-123');
      expect(result).toHaveProperty('name', mockStation.name);
      expect(result).toHaveProperty('ports');
      expect(result).toHaveProperty('images');
      expect(result.isFavorite).toBe(false);
    });

    it('should include favorite status for authenticated user', async () => {
      const stationWithRelations = {
        ...mockStation,
        network: mockNetwork,
        ports: [mockPort],
        images: [mockImage],
      };
      mockPrismaService.station.findFirst.mockResolvedValue(stationWithRelations);
      mockPrismaService.favorite.findUnique.mockResolvedValue(mockFavorite);

      const result = await service.findById('station-123', 'user-123');

      expect(mockPrismaService.favorite.findUnique).toHaveBeenCalledWith({
        where: { userId_stationId: { userId: 'user-123', stationId: 'station-123' } },
      });
      expect(result.isFavorite).toBe(true);
    });

    it('should throw NotFoundException if station not found', async () => {
      mockPrismaService.station.findFirst.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // REVIEWS
  // ============================================================================

  describe('getReviews', () => {
    it('should return paginated reviews', async () => {
      mockPrismaService.station.findFirst.mockResolvedValue(mockStation);
      mockPrismaService.review.findMany.mockResolvedValue([mockReview]);

      const result = await service.getReviews('station-123', 10);

      expect(mockPrismaService.station.findFirst).toHaveBeenCalledWith({
        where: { id: 'station-123', deletedAt: null },
      });
      expect(mockPrismaService.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stationId: 'station-123', deletedAt: null },
          take: 11, // limit + 1 for pagination
        }),
      );
      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0]).toHaveProperty('id', 'review-123');
      expect(result.reviews[0]).toHaveProperty('user');
    });

    it('should return nextCursor when more results exist', async () => {
      const manyReviews = Array(11).fill(null).map((_, i) => ({
        ...mockReview,
        id: `review-${i}`,
        createdAt: new Date(Date.now() - i * 1000),
      }));
      mockPrismaService.station.findFirst.mockResolvedValue(mockStation);
      mockPrismaService.review.findMany.mockResolvedValue(manyReviews);

      const result = await service.getReviews('station-123', 10);

      expect(result.reviews).toHaveLength(10); // Trimmed
      expect(result.nextCursor).toBeDefined();
    });

    it('should throw NotFoundException if station not found', async () => {
      mockPrismaService.station.findFirst.mockResolvedValue(null);

      await expect(service.getReviews('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createReview', () => {
    const createReviewDto = { rating: 5, comment: 'Excellent!' };

    it('should create a new review', async () => {
      mockPrismaService.station.findFirst.mockResolvedValue(mockStation);
      mockPrismaService.review.findFirst.mockResolvedValue(null); // No existing review
      mockPrismaService.review.create.mockResolvedValue(mockReview);
      mockPrismaService.review.aggregate.mockResolvedValue({
        _avg: { rating: 4.5 },
        _count: { rating: 11 },
      });
      mockPrismaService.station.update.mockResolvedValue(mockStation);

      const result = await service.createReview('user-123', 'station-123', createReviewDto);

      expect(mockPrismaService.review.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          stationId: 'station-123',
          rating: createReviewDto.rating,
          comment: createReviewDto.comment,
        },
      });
      expect(mockPrismaService.station.update).toHaveBeenCalled(); // Rating aggregation
      expect(result).toBeDefined();
    });

    it('should update existing review', async () => {
      mockPrismaService.station.findFirst.mockResolvedValue(mockStation);
      mockPrismaService.review.findFirst.mockResolvedValue(mockReview);
      mockPrismaService.review.update.mockResolvedValue({ ...mockReview, rating: 4 });
      mockPrismaService.review.aggregate.mockResolvedValue({
        _avg: { rating: 4.0 },
        _count: { rating: 10 },
      });
      mockPrismaService.station.update.mockResolvedValue(mockStation);

      await service.createReview('user-123', 'station-123', { rating: 4, comment: 'Updated' });

      expect(mockPrismaService.review.update).toHaveBeenCalledWith({
        where: { id: mockReview.id },
        data: expect.objectContaining({
          rating: 4,
          comment: 'Updated',
        }),
      });
    });

    it('should throw NotFoundException if station not found', async () => {
      mockPrismaService.station.findFirst.mockResolvedValue(null);

      await expect(
        service.createReview('user-123', 'nonexistent', createReviewDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // FAVORITES
  // ============================================================================

  describe('addFavorite', () => {
    it('should add station to favorites', async () => {
      mockPrismaService.station.findFirst.mockResolvedValue(mockStation);
      mockPrismaService.favorite.upsert.mockResolvedValue(mockFavorite);

      const result = await service.addFavorite('user-123', 'station-123');

      expect(mockPrismaService.station.findFirst).toHaveBeenCalledWith({
        where: { id: 'station-123', deletedAt: null },
      });
      expect(mockPrismaService.favorite.upsert).toHaveBeenCalledWith({
        where: { userId_stationId: { userId: 'user-123', stationId: 'station-123' } },
        create: { userId: 'user-123', stationId: 'station-123' },
        update: {},
      });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if station not found', async () => {
      mockPrismaService.station.findFirst.mockResolvedValue(null);

      await expect(service.addFavorite('user-123', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeFavorite', () => {
    it('should remove station from favorites', async () => {
      mockPrismaService.favorite.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeFavorite('user-123', 'station-123');

      expect(mockPrismaService.favorite.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', stationId: 'station-123' },
      });
    });
  });

  describe('getFavorites', () => {
    it('should return user favorite stations', async () => {
      const favoriteWithStation = {
        ...mockFavorite,
        station: {
          ...mockStation,
          ports: [mockPort],
          images: [mockImage],
        },
      };
      mockPrismaService.favorite.findMany.mockResolvedValue([favoriteWithStation]);

      const result = await service.getFavorites('user-123');

      expect(mockPrismaService.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        include: expect.objectContaining({
          station: expect.any(Object),
        }),
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id', 'station-123');
      expect(result[0].isFavorite).toBe(true);
    });

    it('should filter out inactive stations', async () => {
      const inactiveStation = {
        ...mockFavorite,
        station: {
          ...mockStation,
          isActive: false,
          ports: [],
          images: [],
        },
      };
      mockPrismaService.favorite.findMany.mockResolvedValue([inactiveStation]);

      const result = await service.getFavorites('user-123');

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================================
  // NEARBY STATIONS
  // ============================================================================

  describe('findNearby', () => {
    const nearbyDto = {
      lat: 6.4281,
      lng: 3.4219,
      radiusKm: 10,
      limit: 20,
    };

    it('should return nearby stations', async () => {
      const rawStation = {
        id: 'station-123',
        name: 'CHRGE VI Station',
        description: 'Premium charging station',
        address: '123 Victoria Island',
        city: 'Lagos',
        state: 'Lagos',
        postal_code: '101001',
        country: 'Nigeria',
        latitude: 6.4281,
        longitude: 3.4219,
        timezone: 'Africa/Lagos',
        is_active: true,
        is_verified: true,
        operating_hours: null,
        amenities: [],
        pricing: { perKwh: 350, currency: 'NGN' },
        phone_number: '+2341234567890',
        total_ports: 4,
        available_ports: 2,
        avg_rating: 4.5,
        review_count: 10,
        last_status_update: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        distance_km: 1.5,
      };

      mockPrismaService.$queryRaw.mockResolvedValue([rawStation]);
      mockPrismaService.port.findMany.mockResolvedValue([mockPort]);
      mockPrismaService.stationImage.findMany.mockResolvedValue([mockImage]);
      mockPrismaService.favorite.findMany.mockResolvedValue([]);

      const result = await service.findNearby(nearbyDto);

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
      expect(result.stations).toHaveLength(1);
      expect(result.stations[0]).toHaveProperty('id', 'station-123');
      expect(result.stations[0]).toHaveProperty('distanceKm', 1.5);
    });

    it('should use user connector type for filtering', async () => {
      mockVehiclesService.getPrimaryVehicleConnector.mockResolvedValue(ConnectorType.CCS2);
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.port.findMany.mockResolvedValue([]);
      mockPrismaService.stationImage.findMany.mockResolvedValue([]);
      mockPrismaService.favorite.findMany.mockResolvedValue([]);

      await service.findNearby(nearbyDto, 'user-123');

      expect(mockVehiclesService.getPrimaryVehicleConnector).toHaveBeenCalledWith('user-123');
    });

    it('should return nextCursor when more results exist', async () => {
      const rawStations = Array(21).fill(null).map((_, i) => ({
        id: `station-${i}`,
        name: `Station ${i}`,
        description: null,
        address: 'Address',
        city: 'Lagos',
        state: 'Lagos',
        postal_code: null,
        country: 'Nigeria',
        latitude: 6.4281,
        longitude: 3.4219,
        timezone: 'Africa/Lagos',
        is_active: true,
        is_verified: false,
        operating_hours: null,
        amenities: [],
        pricing: null,
        phone_number: null,
        total_ports: 2,
        available_ports: 1,
        avg_rating: null,
        review_count: 0,
        last_status_update: null,
        created_at: new Date(),
        updated_at: new Date(),
        distance_km: i * 0.5,
      }));

      mockPrismaService.$queryRaw.mockResolvedValue(rawStations);
      mockPrismaService.port.findMany.mockResolvedValue([]);
      mockPrismaService.stationImage.findMany.mockResolvedValue([]);
      mockPrismaService.favorite.findMany.mockResolvedValue([]);

      const result = await service.findNearby(nearbyDto);

      expect(result.stations).toHaveLength(20);
      expect(result.nextCursor).toBeDefined();
    });
  });

  // ============================================================================
  // TOP PICKS
  // ============================================================================

  describe('findTopPicks', () => {
    it('should return top picks stations', async () => {
      const rawStation = {
        id: 'station-123',
        name: 'CHRGE VI Station',
        description: 'Premium',
        address: '123 VI',
        city: 'Lagos',
        state: 'Lagos',
        postal_code: null,
        country: 'Nigeria',
        latitude: 6.4281,
        longitude: 3.4219,
        timezone: 'Africa/Lagos',
        is_active: true,
        is_verified: true,
        operating_hours: null,
        amenities: [],
        pricing: null,
        phone_number: null,
        total_ports: 4,
        available_ports: 2,
        avg_rating: 4.8,
        review_count: 50,
        last_status_update: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        distance_km: 2.0,
        score: 45,
      };

      mockPrismaService.$queryRaw.mockResolvedValue([rawStation]);
      mockPrismaService.port.findMany.mockResolvedValue([mockPort]);
      mockPrismaService.stationImage.findMany.mockResolvedValue([mockImage]);
      mockPrismaService.favorite.findMany.mockResolvedValue([]);

      const result = await service.findTopPicks(6.4281, 3.4219);

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('avgRating', 4.8);
    });
  });
});
