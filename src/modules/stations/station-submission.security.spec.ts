import { StationsService } from './stations.service';

const baseStation = {
  id: 'a1c7e4d8-66c5-47bb-91ba-8a5c19d5f014',
  name: 'Submitted Hub',
  description: null,
  operatorName: null,
  serviceType: null,
  locationAccuracy: null,
  navigationReady: false,
  priceNote: null,
  openingHoursNote: null,
  accessNotes: null,
  operationalStatus: null,
  verificationTier: null,
  verificationConfidence: null,
  verificationBasis: null,
  verifiedAt: null,
  sourceLinks: [],
  researchMetadata: null,
  stationType: 'EV',
  address: '1 Test Road',
  area: null,
  city: 'Lagos',
  state: 'Lagos',
  postalCode: null,
  country: 'NG',
  latitude: 6.4,
  longitude: 3.4,
  timezone: 'Africa/Lagos',
  isActive: false,
  isVerified: false,
  status: 'PENDING',
  operatingHours: null,
  amenities: [],
  pricing: null,
  cngDetails: null,
  phoneNumber: null,
  networkId: null,
  totalPorts: 0,
  availablePorts: 0,
  avgRating: null,
  reviewCount: 0,
  lastStatusUpdate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  network: null,
  ports: [],
  images: [],
};
const dto = {
  name: 'Submitted Hub',
  address: '1 Test Road',
  city: 'Lagos',
  state: 'Lagos',
  latitude: 6.4,
  longitude: 3.4,
};

describe('community station publication boundary', () => {
  function makeService(prisma: Record<string, unknown>) {
    return new StationsService(
      prisma as never,
      { getPrimaryVehicleConnector: jest.fn() } as never,
      { get: jest.fn() } as never,
      { get: jest.fn(), set: jest.fn(), del: jest.fn() } as never,
      { generate: jest.fn(), fromReviewId: jest.fn() } as never,
    );
  }

  it('creates exactly one pending inactive owner submission and returns it without a public lookup', async () => {
    const tx = {
      station: {
        create: jest.fn().mockResolvedValue(baseStation),
        findUniqueOrThrow: jest.fn().mockResolvedValue(baseStation),
        update: jest.fn(),
      },
      stationImage: { create: jest.fn() },
      port: { createMany: jest.fn() },
    };
    const prisma = {
      station: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const result = await makeService(prisma).submitStation('owner-1', dto, 'retry-key');
    expect(tx.station.create).toHaveBeenCalledTimes(1);
    expect(tx.station.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submittedBy: 'owner-1',
        submissionKey: 'retry-key',
        status: 'PENDING',
        isActive: false,
        isVerified: false,
      }),
    });
    expect(result.id).toBe(baseStation.id);
  });

  it('returns the same submission for an idempotent retry without inserting again', async () => {
    const prisma = {
      station: { findFirst: jest.fn().mockResolvedValue(baseStation) },
      $transaction: jest.fn(),
    };
    const result = await makeService(prisma).submitStation('owner-1', dto, 'retry-key');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.id).toBe(baseStation.id);
  });

  it('requires approved and active status in public list queries', async () => {
    const prisma = {
      station: { findMany: jest.fn().mockResolvedValue([]) },
      favorite: { findMany: jest.fn() },
    };
    await makeService(prisma).findAll({ limit: 20 });
    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'APPROVED', isActive: true, deletedAt: null }),
      }),
    );
  });

  it('returns identical JSON-safe detail responses on consecutive cached reads', async () => {
    const approved = { ...baseStation, status: 'APPROVED', isActive: true };
    const prisma = {
      station: { findFirst: jest.fn().mockResolvedValue(approved) },
      favorite: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const values = new Map<string, unknown>();
    const cache = {
      get: jest.fn((key: string) => values.get(key)),
      set: jest.fn((key: string, value: unknown) => {
        values.set(key, value);
      }),
      del: jest.fn(),
    };
    const service = new StationsService(
      prisma as never,
      { getPrimaryVehicleConnector: jest.fn() } as never,
      { get: jest.fn() } as never,
      cache as never,
      { generate: jest.fn(), fromReviewId: jest.fn() } as never,
    );
    const first = await service.findById(approved.id);
    const second = await service.findById(approved.id);
    expect(prisma.station.findFirst).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
