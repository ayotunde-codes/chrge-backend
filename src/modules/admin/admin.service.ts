import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { VehicleBrand, VehicleModel, Station, Port, StationImage, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateVehicleBrandDto,
  CreateVehicleModelDto,
  CreateStationDto,
  UpdateStationDto,
  CreatePortDto,
  UpdatePortDto,
  CreateStationImageDto,
  AdminStationQueryDto,
} from './dto/admin.dto';
import { ReviewStationDto } from '../stations/dto/submit-station.dto';
import { AuditContext, AuditService } from '../audit/audit.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private async invalidateStationCaches(stationId: string): Promise<void> {
    const version = (await this.cache.get<number>('stations:top-picks:version')) ?? 0;
    await Promise.all([
      this.cache.del(`stations:detail:${stationId}`),
      this.cache.del(`stations:reviews:${stationId}:10:`),
      this.cache.del('stations:list'),
      this.cache.del('stations:map'),
      this.cache.del('stations:top-picks'),
      this.cache.set('stations:top-picks:version', version + 1),
    ]);
  }

  // ============================================================================
  // VEHICLE BRANDS
  // ============================================================================

  async createBrand(dto: CreateVehicleBrandDto): Promise<VehicleBrand> {
    const existing = await this.prisma.vehicleBrand.findUnique({
      where: { id: dto.id },
    });
    if (existing) {
      throw new ConflictException('Brand with this id already exists');
    }

    return this.prisma.vehicleBrand.create({
      data: {
        id: dto.id,
        name: dto.name,
        logoUrl: dto.logoUrl,
        darkLogo: dto.darkLogo ?? false,
        country: dto.country,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // ============================================================================
  // VEHICLE MODELS
  // ============================================================================

  async createModel(dto: CreateVehicleModelDto): Promise<VehicleModel> {
    // Verify brand exists
    const brand = await this.prisma.vehicleBrand.findUnique({
      where: { id: dto.brandId },
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    // Check for duplicate (unique on brandId + name)
    const existing = await this.prisma.vehicleModel.findFirst({
      where: { brandId: dto.brandId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Model already exists');
    }

    const connectors = dto.connectors as string[];
    const connectorType = connectors.length > 0 ? dto.connectors[0] : null;

    return this.prisma.vehicleModel.create({
      data: {
        id: dto.id,
        brandId: dto.brandId,
        name: dto.name,
        powertrain: dto.powertrain,
        connectors,
        connectorType,
        year: dto.year,
        batteryCapacityKwh: dto.batteryCapacityKwh,
        rangeKm: dto.rangeKm,
        imageUrl: dto.imageUrl,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // ============================================================================
  // STATIONS
  // ============================================================================

  async createStation(dto: CreateStationDto): Promise<Station> {
    const station = await this.prisma.station.create({
      data: {
        name: dto.name,
        description: dto.description,
        stationType: dto.stationType ?? 'EV',
        operatorName: dto.operatorName,
        serviceType: dto.serviceType,
        address: dto.address,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country || 'NG',
        latitude: dto.latitude,
        longitude: dto.longitude,
        timezone: dto.timezone || 'Africa/Lagos',
        isActive: dto.isActive ?? true,
        isVerified: dto.isVerified ?? false,
        locationAccuracy: dto.locationAccuracy,
        navigationReady: dto.navigationReady ?? false,
        // Admin-created stations are always approved
        status: 'APPROVED',
        operatingHours: dto.operatingHours,
        openingHoursNote: dto.openingHoursNote,
        amenities: dto.amenities || [],
        pricing: dto.pricing,
        priceNote: dto.priceNote,
        cngDetails: dto.cngDetails as Prisma.InputJsonValue | undefined,
        phoneNumber: dto.phoneNumber,
        email: dto.email,
        networkId: dto.networkId,
        accessNotes: dto.accessNotes,
        operationalStatus: dto.operationalStatus,
        verificationTier: dto.verificationTier,
        verificationConfidence: dto.verificationConfidence,
        verificationBasis: dto.verificationBasis,
        verifiedAt: dto.verifiedAt,
        sourceLinks: dto.sourceLinks as Prisma.InputJsonValue | undefined,
        researchMetadata: dto.researchMetadata as Prisma.InputJsonValue | undefined,
      },
    });
    await this.invalidateStationCaches(station.id);
    return station;
  }

  async listStations(
    dto: AdminStationQueryDto,
  ): Promise<{ stations: unknown[]; nextCursor: string | null }> {
    const limit = Math.min(dto.limit ?? 25, 100);
    const stations = await this.prisma.station.findMany({
      where: {
        status: dto.status,
        stationType: dto.stationType,
        deletedAt: null,
        ...(dto.search
          ? {
              OR: [
                { name: { contains: dto.search, mode: 'insensitive' as const } },
                { address: { contains: dto.search, mode: 'insensitive' as const } },
                { city: { contains: dto.search, mode: 'insensitive' as const } },
                { operatorName: { contains: dto.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      // StationType is defined as EV, CNG, HYBRID in PostgreSQL. Descending
      // keeps CNG-capable stations ahead of EV across every paginated admin list.
      orderBy: [
        { stationType: 'desc' },
        { createdAt: dto.order === 'oldest' ? 'asc' : 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        stationType: true,
        operatorName: true,
        address: true,
        area: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        isActive: true,
        isVerified: true,
        status: true,
        submittedBy: true,
        reviewedBy: true,
        reviewReason: true,
        submissionRevision: true,
        verificationTier: true,
        verifiedAt: true,
        createdAt: true,
        updatedAt: true,
        submitter: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    const hasMore = stations.length > limit;
    if (hasMore) stations.pop();
    return {
      stations: stations.map((station) => ({
        ...station,
        submitter: station.submitter
          ? { ...station.submitter, email: this.maskEmail(station.submitter.email) }
          : null,
      })),
      nextCursor: hasMore ? (stations[stations.length - 1]?.id ?? null) : null,
    };
  }

  async getStationForAdmin(stationId: string): Promise<Record<string, unknown>> {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
      include: {
        network: true,
        ports: true,
        images: true,
        submitter: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!station) throw new NotFoundException('Station not found');
    return {
      ...station,
      submitter: station.submitter
        ? { ...station.submitter, email: this.maskEmail(station.submitter.email) }
        : null,
    };
  }

  async reviewStation(
    stationId: string,
    reviewer: AuditContext,
    dto: ReviewStationDto,
  ): Promise<Station> {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    if ((dto.action === 'REJECT' || dto.action === 'REQUEST_CHANGES') && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason is required when rejecting a station');
    }
    if (station.status === 'APPROVED' && dto.action === 'APPROVE') return station;
    if (station.status !== 'PENDING')
      throw new ConflictException(
        `Cannot ${dto.action.toLowerCase()} a ${station.status} submission`,
      );

    const result = await this.prisma.$transaction(
      async (tx) => {
        if (dto.action === 'APPROVE') {
          const duplicate = await tx.station.findFirst({
            where: {
              id: { not: stationId },
              status: 'APPROVED',
              isActive: true,
              deletedAt: null,
              OR: [
                { name: { equals: station.name, mode: 'insensitive' } },
                {
                  latitude: { gte: station.latitude - 0.0005, lte: station.latitude + 0.0005 },
                  longitude: { gte: station.longitude - 0.0005, lte: station.longitude + 0.0005 },
                },
              ],
            },
            select: { id: true },
          });
          if (duplicate)
            throw new ConflictException(`Potential duplicate station: ${duplicate.id}`);
        }

        const nextStatus =
          dto.action === 'APPROVE'
            ? 'APPROVED'
            : dto.action === 'REJECT'
              ? 'REJECTED'
              : 'CHANGES_REQUESTED';
        const updated = await tx.station.updateMany({
          where: { id: stationId, status: 'PENDING', isActive: false },
          data: {
            status: nextStatus,
            isActive: dto.action === 'APPROVE',
            isVerified: dto.action === 'APPROVE',
            rejectionReason: dto.action === 'REJECT' ? dto.rejectionReason : null,
            reviewReason: dto.reason,
            reviewedBy: reviewer.actorId,
            reviewedAt: new Date(),
            changesRequestedAt: dto.action === 'REQUEST_CHANGES' ? new Date() : null,
          },
        });
        if (updated.count !== 1)
          throw new ConflictException('Submission changed during moderation');
        const reviewed = await tx.station.findUniqueOrThrow({ where: { id: stationId } });
        await this.audit.create(
          reviewer,
          {
            action: `station.${dto.action.toLowerCase()}`,
            targetType: 'station',
            targetId: stationId,
            reason: dto.reason,
            beforeSummary: { status: station.status, isActive: station.isActive },
            afterSummary: {
              status: reviewed.status,
              isActive: reviewed.isActive,
              revision: reviewed.submissionRevision,
            },
          },
          tx,
        );
        return reviewed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.invalidateStationCaches(stationId);
    return result;
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
  }

  async updateStation(id: string, dto: UpdateStationDto): Promise<Station> {
    const station = await this.prisma.station.findUnique({ where: { id } });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    const updated = await this.prisma.station.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        stationType: dto.stationType,
        operatorName: dto.operatorName,
        serviceType: dto.serviceType,
        address: dto.address,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country,
        latitude: dto.latitude,
        longitude: dto.longitude,
        timezone: dto.timezone,
        isActive: dto.isActive,
        isVerified: dto.isVerified,
        locationAccuracy: dto.locationAccuracy,
        navigationReady: dto.navigationReady,
        operatingHours: dto.operatingHours,
        openingHoursNote: dto.openingHoursNote,
        amenities: dto.amenities,
        pricing: dto.pricing,
        priceNote: dto.priceNote,
        cngDetails: dto.cngDetails as Prisma.InputJsonValue | undefined,
        phoneNumber: dto.phoneNumber,
        email: dto.email,
        networkId: dto.networkId,
        accessNotes: dto.accessNotes,
        operationalStatus: dto.operationalStatus,
        verificationTier: dto.verificationTier,
        verificationConfidence: dto.verificationConfidence,
        verificationBasis: dto.verificationBasis,
        verifiedAt: dto.verifiedAt,
        sourceLinks: dto.sourceLinks as Prisma.InputJsonValue | undefined,
        researchMetadata: dto.researchMetadata as Prisma.InputJsonValue | undefined,
      },
    });
    await this.invalidateStationCaches(id);
    return updated;
  }

  // ============================================================================
  // STATION IMAGES
  // ============================================================================

  async addStationImage(
    stationId: string,
    dto: CreateStationImageDto,
    uploadedBy?: string,
  ): Promise<StationImage> {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    // If setting as primary, unset other primaries
    if (dto.isPrimary) {
      await this.prisma.stationImage.updateMany({
        where: { stationId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Get max sort order
    const maxOrder = await this.prisma.stationImage.findFirst({
      where: { stationId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const image = await this.prisma.stationImage.create({
      data: {
        stationId,
        url: dto.url,
        caption: dto.caption,
        sortOrder: dto.sortOrder ?? (maxOrder?.sortOrder ?? 0) + 1,
        isPrimary: dto.isPrimary ?? false,
        uploadedBy,
      },
    });
    await this.invalidateStationCaches(stationId);
    return image;
  }

  // ============================================================================
  // PORTS
  // ============================================================================

  async addPort(stationId: string, dto: CreatePortDto): Promise<Port> {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    const port = await this.prisma.port.create({
      data: {
        stationId,
        connectorType: dto.connectorType,
        chargerType: dto.chargerType,
        powerKw: dto.powerKw,
        status: dto.status || 'UNKNOWN',
        pricePerKwh: dto.pricePerKwh,
        pricePerMinute: dto.pricePerMinute,
        pricePerSession: dto.pricePerSession,
        portNumber: dto.portNumber,
      },
    });

    // Update station port count
    await this.updateStationPortCounts(stationId);
    await this.invalidateStationCaches(stationId);

    return port;
  }

  async updatePort(portId: string, dto: UpdatePortDto): Promise<Port> {
    const port = await this.prisma.port.findUnique({
      where: { id: portId },
      include: { station: true },
    });
    if (!port) {
      throw new NotFoundException('Port not found');
    }

    const updated = await this.prisma.port.update({
      where: { id: portId },
      data: {
        connectorType: dto.connectorType,
        chargerType: dto.chargerType,
        powerKw: dto.powerKw,
        status: dto.status,
        pricePerKwh: dto.pricePerKwh,
        pricePerMinute: dto.pricePerMinute,
        pricePerSession: dto.pricePerSession,
        portNumber: dto.portNumber,
        estimatedAvailableAt: dto.estimatedAvailableAt,
        lastStatusUpdate: dto.status ? new Date() : undefined,
      },
    });

    // Update station port counts if status changed
    if (dto.status) {
      await this.updateStationPortCounts(port.stationId);
    }
    await this.invalidateStationCaches(port.stationId);

    return updated;
  }

  private async updateStationPortCounts(stationId: string): Promise<void> {
    const [totalPorts, availablePorts] = await Promise.all([
      this.prisma.port.count({ where: { stationId } }),
      this.prisma.port.count({ where: { stationId, status: 'AVAILABLE' } }),
    ]);

    await this.prisma.station.update({
      where: { id: stationId },
      data: {
        totalPorts,
        availablePorts,
        lastStatusUpdate: new Date(),
      },
    });
  }
}
