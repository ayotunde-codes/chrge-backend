import { Injectable, NotFoundException } from '@nestjs/common';
import { Station, Favorite, Review, ConnectorType, PortStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { NearbyStationsDto } from './dto/nearby-stations.dto';
import { AllStationsDto } from './dto/all-stations.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { SubmitStationDto } from './dto/submit-station.dto';

// Operating hours structure
interface DayHours {
  open: string; // "08:00" or "24h"
  close: string; // "22:00" or "24h"
}

interface OperatingHours {
  mon?: DayHours;
  tue?: DayHours;
  wed?: DayHours;
  thu?: DayHours;
  fri?: DayHours;
  sat?: DayHours;
  sun?: DayHours;
}

// Pricing structure
interface StationPricing {
  perKwh?: number;
  perMinute?: number;
  sessionFee?: number;
  currency: string;
}

@Injectable()
export class StationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehiclesService: VehiclesService,
    private readonly configService: ConfigService,
  ) {}

  // ============================================================================
  // NEARBY STATIONS
  // ============================================================================

  async findNearby(
    dto: NearbyStationsDto,
    userId?: string,
  ): Promise<{
    stations: StationCardResult[];
    nextCursor: string | null;
  }> {
    const radiusKm = dto.radiusKm || 10;
    const limit = Math.min(dto.limit || 20, 50);

    // Get user's primary vehicle connector type for filtering
    let userConnector: ConnectorType | null = null;
    if (userId) {
      userConnector = await this.vehiclesService.getPrimaryVehicleConnector(userId);
    }

    // Build where clause
    const where: Prisma.StationWhereInput = {
      isActive: true,
      deletedAt: null,
    };

    // Connector filtering
    const connectorFilter = dto.connectors?.length
      ? dto.connectors
      : userConnector
        ? [userConnector]
        : null;

    if (connectorFilter) {
      where.ports = {
        some: {
          connectorType: { in: connectorFilter },
        },
      };
    }

    // Status filtering
    if (dto.status?.length) {
      where.ports = {
        ...where.ports,
        some: {
          ...((where.ports as Prisma.PortListRelationFilter)?.some || {}),
          status: { in: dto.status },
        },
      };
    }

    // Power filtering
    if (dto.minPowerKw) {
      where.ports = {
        ...where.ports,
        some: {
          ...((where.ports as Prisma.PortListRelationFilter)?.some || {}),
          powerKw: { gte: dto.minPowerKw },
        },
      };
    }

    // Fetch stations with Haversine distance calculation
    // Using raw query for distance ordering
    // Note: Column names are camelCase in PostgreSQL (Prisma default)
    const stations = await this.prisma.$queryRaw<StationWithDistance[]>`
      SELECT 
        s.id,
        s.name,
        s.description,
        s.address,
        s.area,
        s.city,
        s.state,
        s."postalCode" as postal_code,
        s.country,
        s.latitude,
        s.longitude,
        s.timezone,
        s."isActive" as is_active,
        s."isVerified" as is_verified,
        s."operatingHours" as operating_hours,
        s.amenities,
        s.pricing,
        s."phoneNumber" as phone_number,
        s."totalPorts" as total_ports,
        s."availablePorts" as available_ports,
        s."avgRating" as avg_rating,
        s."reviewCount" as review_count,
        s."lastStatusUpdate" as last_status_update,
        s."createdAt" as created_at,
        s."updatedAt" as updated_at,
        (
          6371 * acos(
            cos(radians(${dto.lat})) * cos(radians(s.latitude)) *
            cos(radians(s.longitude) - radians(${dto.lng})) +
            sin(radians(${dto.lat})) * sin(radians(s.latitude))
          )
        ) AS distance_km
      FROM stations s
      WHERE s."isActive" = true
        AND s."deletedAt" IS NULL
        AND (
          6371 * acos(
            cos(radians(${dto.lat})) * cos(radians(s.latitude)) *
            cos(radians(s.longitude) - radians(${dto.lng})) +
            sin(radians(${dto.lat})) * sin(radians(s.latitude))
          )
        ) <= ${radiusKm}
      ORDER BY distance_km ASC
      LIMIT ${limit + 1}
      ${dto.cursor ? Prisma.sql`OFFSET ${parseInt(dto.cursor, 10)}` : Prisma.sql``}
    `;

    // Check if there are more results
    const hasMore = stations.length > limit;
    if (hasMore) stations.pop();

    // Get station IDs for related data
    const stationIds = stations.map((s) => s.id);

    // Fetch related data
    const [ports, images, favorites] = await Promise.all([
      this.prisma.port.findMany({
        where: { stationId: { in: stationIds } },
        select: {
          stationId: true,
          connectorType: true,
          status: true,
          powerKw: true,
        },
      }),
      this.prisma.stationImage.findMany({
        where: { stationId: { in: stationIds }, isPrimary: true },
        select: { stationId: true, url: true },
      }),
      userId
        ? this.prisma.favorite.findMany({
            where: { userId, stationId: { in: stationIds } },
            select: { stationId: true },
          })
        : [],
    ]);

    // Group data by station
    const portsByStation = this.groupBy(ports, 'stationId');
    const imagesByStation = this.groupBy(images, 'stationId');
    const favoriteStationIds = new Set(favorites.map((f) => f.stationId));

    // Filter by openNow if requested
    let filteredStations = stations;
    if (dto.openNow) {
      filteredStations = stations.filter((s) => this.isStationOpen(s));
    }

    // Map to response format
    const result: StationCardResult[] = filteredStations.map((station) => {
      const stationPorts = portsByStation[station.id] || [];
      const primaryImage = imagesByStation[station.id]?.[0];

      return this.mapToStationCard(
        station,
        stationPorts,
        primaryImage?.url,
        favoriteStationIds.has(station.id),
      );
    });

    return {
      stations: result,
      nextCursor: hasMore ? String((parseInt(dto.cursor || '0', 10) || 0) + limit) : null,
    };
  }

  // ============================================================================
  // TOP PICKS (curated ranking)
  // ============================================================================

  async findTopPicks(lat: number, lng: number, userId?: string, limit = 4): Promise<StationCardResult[]> {
    // Get user's primary vehicle connector type
    let userConnector: ConnectorType | null = null;
    if (userId) {
      userConnector = await this.vehiclesService.getPrimaryVehicleConnector(userId);
    }

    // Fetch stations with scoring heuristic:
    // - Has image
    // - Has available ports
    // - Is verified
    // - Higher rating
    // - Closer distance
    // Note: Column names are camelCase in PostgreSQL (Prisma default)
    const stations = await this.prisma.$queryRaw<StationWithDistance[]>`
      SELECT 
        s.id,
        s.name,
        s.description,
        s.address,
        s.area,
        s.city,
        s.state,
        s."postalCode" as postal_code,
        s.country,
        s.latitude,
        s.longitude,
        s.timezone,
        s."isActive" as is_active,
        s."isVerified" as is_verified,
        s."operatingHours" as operating_hours,
        s.amenities,
        s.pricing,
        s."phoneNumber" as phone_number,
        s."totalPorts" as total_ports,
        s."availablePorts" as available_ports,
        s."avgRating" as avg_rating,
        s."reviewCount" as review_count,
        s."lastStatusUpdate" as last_status_update,
        s."createdAt" as created_at,
        s."updatedAt" as updated_at,
        (
          6371 * acos(
            cos(radians(${lat})) * cos(radians(s.latitude)) *
            cos(radians(s.longitude) - radians(${lng})) +
            sin(radians(${lat})) * sin(radians(s.latitude))
          )
        ) AS distance_km,
        (
          CASE WHEN s."isVerified" THEN 20 ELSE 0 END +
          CASE WHEN s."availablePorts" > 0 THEN 15 ELSE 0 END +
          COALESCE(s."avgRating", 0) * 5 +
          (10 - LEAST(10, (
            6371 * acos(
              cos(radians(${lat})) * cos(radians(s.latitude)) *
              cos(radians(s.longitude) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(s.latitude))
            )
          )))
        ) AS score
      FROM stations s
      WHERE s."isActive" = true
        AND s."deletedAt" IS NULL
        AND (
          6371 * acos(
            cos(radians(${lat})) * cos(radians(s.latitude)) *
            cos(radians(s.longitude) - radians(${lng})) +
            sin(radians(${lat})) * sin(radians(s.latitude))
          )
        ) <= 25
      ORDER BY score DESC, distance_km ASC
      LIMIT ${limit}
    `;

    const stationIds = stations.map((s) => s.id);

    const [ports, images, favorites] = await Promise.all([
      this.prisma.port.findMany({
        where: { stationId: { in: stationIds } },
        select: { stationId: true, connectorType: true, status: true, powerKw: true },
      }),
      this.prisma.stationImage.findMany({
        where: { stationId: { in: stationIds }, isPrimary: true },
        select: { stationId: true, url: true },
      }),
      userId
        ? this.prisma.favorite.findMany({
            where: { userId, stationId: { in: stationIds } },
            select: { stationId: true },
          })
        : [],
    ]);

    const portsByStation = this.groupBy(ports, 'stationId');
    const imagesByStation = this.groupBy(images, 'stationId');
    const favoriteStationIds = new Set(favorites.map((f) => f.stationId));

    return stations.map((station) => {
      const stationPorts = portsByStation[station.id] || [];
      const primaryImage = imagesByStation[station.id]?.[0];

      return this.mapToStationCard(
        station,
        stationPorts,
        primaryImage?.url,
        favoriteStationIds.has(station.id),
      );
    });
  }

  // ============================================================================
  // ALL STATIONS (no location required)
  // ============================================================================

  async findAll(
    dto: AllStationsDto,
    userId?: string,
  ): Promise<{ stations: StationCardResult[]; nextCursor: string | null }> {
    const limit = Math.min(dto.limit || 20, 50);
    const offset = dto.cursor ? parseInt(dto.cursor, 10) : 0;

    // Build Prisma where clause
    const where: Prisma.StationWhereInput = {
      isActive: true,
      deletedAt: null,
    };

    if (dto.city) {
      where.city = { contains: dto.city, mode: 'insensitive' };
    }

    if (dto.area) {
      where.area = { contains: dto.area, mode: 'insensitive' };
    }

    if (dto.search) {
      where.name = { contains: dto.search, mode: 'insensitive' };
    }

    if (dto.connectors?.length || dto.status?.length || dto.minPowerKw) {
      where.ports = {
        some: {
          ...(dto.connectors?.length && { connectorType: { in: dto.connectors } }),
          ...(dto.status?.length && { status: { in: dto.status } }),
          ...(dto.minPowerKw && { powerKw: { gte: dto.minPowerKw } }),
        },
      };
    }

    const rawStations = await this.prisma.station.findMany({
      where,
      orderBy: [{ avgRating: 'desc' }, { name: 'asc' }],
      take: limit + 1,
      skip: offset,
      include: {
        ports: {
          select: { connectorType: true, status: true, powerKw: true },
        },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { url: true },
        },
      },
    });

    const hasMore = rawStations.length > limit;
    if (hasMore) rawStations.pop();

    // Fetch favorites for authenticated user
    const stationIds = rawStations.map((s) => s.id);
    const favoriteSet = new Set<string>();
    if (userId && stationIds.length) {
      const favs = await this.prisma.favorite.findMany({
        where: { userId, stationId: { in: stationIds } },
        select: { stationId: true },
      });
      favs.forEach((f) => favoriteSet.add(f.stationId));
    }

    // Map to card shape — convert Prisma Station to StationWithDistance shape
    const stations: StationCardResult[] = rawStations
      .map((s) => {
        const asRaw: StationWithDistance = {
          id: s.id,
          name: s.name,
          description: s.description,
          address: s.address,
          area: (s as unknown as { area?: string | null }).area ?? null,
          city: s.city,
          state: s.state,
          postal_code: s.postalCode,
          country: s.country,
          latitude: s.latitude,
          longitude: s.longitude,
          timezone: s.timezone,
          is_active: s.isActive,
          is_verified: s.isVerified,
          operating_hours: s.operatingHours,
          amenities: s.amenities,
          pricing: s.pricing,
          phone_number: s.phoneNumber,
          total_ports: s.totalPorts,
          available_ports: s.availablePorts,
          avg_rating: s.avgRating,
          review_count: s.reviewCount,
          last_status_update: s.lastStatusUpdate,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
          distance_km: null,
        };

        // Filter openNow after mapping (needs operating hours)
        if (dto.openNow && !this.isStationOpen(asRaw)) return null;

        const heroUrl = s.images[0]?.url;
        return this.mapToStationCard(asRaw, s.ports, heroUrl, favoriteSet.has(s.id));
      })
      .filter((s): s is StationCardResult => s !== null);

    return {
      stations,
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  }

  // ============================================================================
  // STATION DETAILS
  // ============================================================================

  async findById(id: string, userId?: string): Promise<StationDetailResult> {
    const station = await this.prisma.station.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: {
        network: {
          select: { id: true, name: true, logoUrl: true, website: true, phoneNumber: true },
        },
        ports: {
          orderBy: { portNumber: 'asc' },
        },
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!station) {
      throw new NotFoundException('Station not found');
    }

    // Check if user has favorited
    let isFavorite = false;
    if (userId) {
      const favorite = await this.prisma.favorite.findUnique({
        where: { userId_stationId: { userId, stationId: id } },
      });
      isFavorite = !!favorite;
    }

    return this.mapToStationDetail(station, isFavorite);
  }

  // ============================================================================
  // REVIEWS
  // ============================================================================

  async getReviews(
    stationId: string,
    limit = 10,
    cursor?: string,
  ): Promise<{ reviews: ReviewResult[]; nextCursor: string | null }> {
    // Verify station exists
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, deletedAt: null },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    const reviews = await this.prisma.review.findMany({
      where: {
        stationId,
        deletedAt: null,
        ...(cursor && { createdAt: { lt: new Date(cursor) } }),
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = reviews.length > limit;
    if (hasMore) reviews.pop();

    return {
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        user: {
          id: r.user.id,
          name: [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') || 'Anonymous',
          avatarUrl: r.user.avatarUrl,
        },
      })),
      nextCursor: hasMore ? reviews[reviews.length - 1].createdAt.toISOString() : null,
    };
  }

  async createReview(userId: string, stationId: string, dto: CreateReviewDto): Promise<Review> {
    // Verify station exists
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, deletedAt: null },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    // Check for existing review
    const existingReview = await this.prisma.review.findFirst({
      where: { userId, stationId },
    });

    let review: Review;
    if (existingReview) {
      // Update existing review
      review = await this.prisma.review.update({
        where: { id: existingReview.id },
        data: {
          rating: dto.rating,
          comment: dto.comment,
          deletedAt: null,
        },
      });
    } else {
      // Create new review
      review = await this.prisma.review.create({
        data: {
          userId,
          stationId,
          rating: dto.rating,
          comment: dto.comment,
        },
      });
    }

    // Update station aggregate rating
    await this.updateStationRating(stationId);

    return review;
  }

  // ============================================================================
  // FAVORITES
  // ============================================================================

  async addFavorite(userId: string, stationId: string): Promise<Favorite> {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, deletedAt: null },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    return this.prisma.favorite.upsert({
      where: { userId_stationId: { userId, stationId } },
      create: { userId, stationId },
      update: {},
    });
  }

  async removeFavorite(userId: string, stationId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({
      where: { userId, stationId },
    });
  }

  async getFavorites(userId: string): Promise<StationCardResult[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      include: {
        station: {
          include: {
            ports: {
              select: { connectorType: true, status: true, powerKw: true },
            },
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return favorites
      .filter((f) => f.station.isActive && !f.station.deletedAt)
      .map((f) => {
        // Create a compatible object for mapToStationCard
        const stationData: StationWithDistance = {
          id: f.station.id,
          name: f.station.name,
          description: f.station.description,
          address: f.station.address,
          area: (f.station as unknown as { area?: string | null }).area ?? null,
          city: f.station.city,
          state: f.station.state,
          postal_code: f.station.postalCode,
          country: f.station.country,
          latitude: f.station.latitude,
          longitude: f.station.longitude,
          timezone: f.station.timezone,
          is_active: f.station.isActive,
          is_verified: f.station.isVerified,
          operating_hours: f.station.operatingHours,
          amenities: f.station.amenities,
          pricing: f.station.pricing,
          phone_number: f.station.phoneNumber,
          total_ports: f.station.totalPorts,
          available_ports: f.station.availablePorts,
          avg_rating: f.station.avgRating,
          review_count: f.station.reviewCount,
          last_status_update: f.station.lastStatusUpdate,
          created_at: f.station.createdAt,
          updated_at: f.station.updatedAt,
          distance_km: null, // No distance for favorites list
        };
        const allImageUrls = f.station.images.map((img) => img.url);
        return this.mapToStationCard(stationData, f.station.ports, f.station.images[0]?.url, true, allImageUrls);
      });
  }

  // ============================================================================
  // STATION SUBMISSION
  // ============================================================================

  async submitStation(userId: string, dto: SubmitStationDto): Promise<StationDetailResult> {
    const skipApproval = this.configService.get<string>('SKIP_STATION_APPROVAL') === 'true';

    const station = await this.prisma.$transaction(async (tx) => {
      const created = await tx.station.create({
        data: {
          name: dto.name,
          description: dto.description,
          address: dto.address,
          area: dto.area,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          country: dto.country ?? 'NG',
          latitude: dto.latitude,
          longitude: dto.longitude,
          timezone: dto.timezone ?? 'Africa/Lagos',
          operatingHours: dto.operatingHours ?? undefined,
          amenities: dto.amenities ?? [],
          pricing: dto.pricing ?? undefined,
          phoneNumber: dto.phoneNumber,
          networkId: dto.networkId,
          submittedBy: userId,
          // When SKIP_STATION_APPROVAL is true, go live immediately
          status: skipApproval ? 'APPROVED' : 'PENDING',
          isActive: skipApproval,
          isVerified: false,
        },
      });

      if (dto.ports?.length) {
        await tx.port.createMany({
          data: dto.ports.map((p) => ({
            stationId: created.id,
            connectorType: p.connectorType,
            chargerType: p.chargerType,
            powerKw: p.powerKw,
            portNumber: p.portNumber,
            pricePerKwh: p.pricePerKwh,
            pricePerMinute: p.pricePerMinute,
            pricePerSession: p.pricePerSession,
            status: 'UNKNOWN' as PortStatus,
          })),
        });

        const totalPorts = dto.ports.length;
        await tx.station.update({
          where: { id: created.id },
          data: { totalPorts },
        });
      }

      return created;
    });

    return this.findById(station.id, userId);
  }

  async getMySubmissions(userId: string): Promise<(StationCardResult & { status: string })[]> {
    const stations = await this.prisma.station.findMany({
      where: { submittedBy: userId, deletedAt: null },
      include: {
        ports: {
          select: { connectorType: true, status: true, powerKw: true },
        },
        images: {
          where: { isPrimary: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return stations.map((s) => {
      const stationData: StationWithDistance = {
        id: s.id,
        name: s.name,
        description: s.description,
        address: s.address,
        area: (s as unknown as { area?: string | null }).area ?? null,
        city: s.city,
        state: s.state,
        postal_code: s.postalCode,
        country: s.country,
        latitude: s.latitude,
        longitude: s.longitude,
        timezone: s.timezone,
        is_active: s.isActive,
        is_verified: s.isVerified,
        operating_hours: s.operatingHours,
        amenities: s.amenities,
        pricing: s.pricing,
        phone_number: s.phoneNumber,
        total_ports: s.totalPorts,
        available_ports: s.availablePorts,
        avg_rating: s.avgRating,
        review_count: s.reviewCount,
        last_status_update: s.lastStatusUpdate,
        created_at: s.createdAt,
        updated_at: s.updatedAt,
        distance_km: null,
      };
      const allImageUrls = s.images.map((img) => img.url);
      const card = this.mapToStationCard(stationData, s.ports, s.images[0]?.url, false, allImageUrls);
      return { ...card, status: (s as unknown as { status: string }).status };
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async updateStationRating(stationId: string): Promise<void> {
    const aggregation = await this.prisma.review.aggregate({
      where: { stationId, deletedAt: null },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.station.update({
      where: { id: stationId },
      data: {
        avgRating: aggregation._avg.rating,
        reviewCount: aggregation._count.rating,
      },
    });
  }

  private isStationOpen(station: StationWithDistance): boolean {
    const hours = station.operating_hours as OperatingHours | null;
    if (!hours) return true; // No hours means 24/7

    const now = new Date();
    const timezone = station.timezone || 'Africa/Lagos';

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase().slice(0, 3);
      const hour = parts.find((p) => p.type === 'hour')?.value || '00';
      const minute = parts.find((p) => p.type === 'minute')?.value || '00';
      const currentTime = `${hour}:${minute}`;

      const dayHours = hours[weekday as keyof OperatingHours];
      if (!dayHours) return false;
      if (dayHours.open === '24h' || dayHours.close === '24h') return true;

      return currentTime >= dayHours.open && currentTime <= dayHours.close;
    } catch {
      return true; // Default to open on error
    }
  }

  private buildOpeningHoursText(station: StationWithDistance): string {
    const hours = station.operating_hours as OperatingHours | null;
    if (!hours) return 'Open 24/7';

    const now = new Date();
    const timezone = station.timezone || 'Africa/Lagos';

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase().slice(0, 3);
      const hour = parts.find((p) => p.type === 'hour')?.value || '00';
      const minute = parts.find((p) => p.type === 'minute')?.value || '00';
      const currentTime = `${hour}:${minute}`;

      const dayHours = hours[weekday as keyof OperatingHours];
      if (!dayHours) return 'Closed today';
      if (dayHours.open === '24h' || dayHours.close === '24h') return 'Open 24/7';

      if (currentTime < dayHours.open) return `Opens at ${dayHours.open}`;
      if (currentTime > dayHours.close) return `Closed · Opens tomorrow`;
      return `Closes at ${dayHours.close}`;
    } catch {
      return 'Open 24/7';
    }
  }

  private buildStatusSummary(
    ports: { status: PortStatus }[],
  ): 'AVAILABLE' | 'IN_USE' | 'OUT_OF_SERVICE' {
    if (!ports.length) return 'OUT_OF_SERVICE';
    const available = ports.filter((p) => p.status === 'AVAILABLE').length;
    if (available > 0) return 'AVAILABLE';
    const outOfOrder = ports.filter((p) => p.status === 'OUT_OF_ORDER').length;
    if (outOfOrder === ports.length) return 'OUT_OF_SERVICE';
    return 'IN_USE';
  }

  private buildConnectorSummary(
    ports: { connectorType: ConnectorType; powerKw: number }[],
  ): { type: string; powerKw: number; count: number }[] {
    const map = new Map<string, { powerKw: number; count: number }>();
    for (const port of ports) {
      const key = port.connectorType;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.powerKw = Math.max(existing.powerKw, port.powerKw);
      } else {
        map.set(key, { powerKw: port.powerKw, count: 1 });
      }
    }
    return Array.from(map.entries()).map(([type, { powerKw, count }]) => ({ type, powerKw, count }));
  }

  private buildPriceText(pricing: StationPricing | null): string | null {
    if (!pricing) return null;
    const parts: string[] = [];
    if (pricing.perKwh) parts.push(`₦${pricing.perKwh}/kWh`);
    if (pricing.perMinute) parts.push(`₦${pricing.perMinute}/min`);
    if (pricing.sessionFee) parts.push(`₦${pricing.sessionFee} session`);
    return parts.join(' + ') || null;
  }

  private mapToStationCard(
    station: StationWithDistance,
    ports: { connectorType: ConnectorType; status: PortStatus; powerKw: number }[],
    heroImageUrl?: string,
    isFavorite = false,
    extraImages: string[] = [],
  ): StationCardResult {
    const availableCount = ports.filter((p) => p.status === 'AVAILABLE').length;
    const totalCount = ports.length;
    const pricing = station.pricing as StationPricing | null;
    const allImages = heroImageUrl
      ? [heroImageUrl, ...extraImages.filter((u) => u !== heroImageUrl)]
      : extraImages;

    return {
      id: station.id,
      name: station.name,
      address: station.address,
      area: station.area ?? null,
      city: station.city,
      lat: station.latitude,
      lng: station.longitude,
      heroImageUrl: heroImageUrl || null,
      images: allImages,
      distanceKm: station.distance_km ? Math.round(station.distance_km * 10) / 10 : null,
      rating: station.avg_rating,
      reviewCount: station.review_count,
      isOpenNow: this.isStationOpen(station),
      openingHoursText: this.buildOpeningHoursText(station),
      priceText: this.buildPriceText(pricing),
      statusSummary: this.buildStatusSummary(ports),
      portsAvailableCount: availableCount,
      portsTotalCount: totalCount,
      connectors: this.buildConnectorSummary(ports),
      amenities: (station.amenities as string[]) || [],
      updatedAt: (station.last_status_update || station.updated_at)?.toISOString() ?? null,
      isFavorite,
    };
  }

  private mapToStationDetail(
    station: Station & {
      network?: { id: string; name: string; logoUrl: string | null; website: string | null; phoneNumber: string | null } | null;
      ports: { id: string; connectorType: ConnectorType; chargerType: string; powerKw: number; status: PortStatus; portNumber: string | null; pricePerKwh: number | null; pricePerMinute: number | null; pricePerSession: number | null; estimatedAvailableAt: Date | null }[];
      images: { id: string; url: string; caption: string | null; sortOrder: number }[];
    },
    isFavorite: boolean,
  ): StationDetailResult {
    const asRaw = station as unknown as StationWithDistance;
    const isOpenNow = this.isStationOpen(asRaw);

    // Calculate minutes remaining for in-use ports
    const portsWithTime = station.ports.map((port) => {
      let minutesRemaining: number | null = null;
      if (port.status === 'IN_USE' && port.estimatedAvailableAt) {
        const diff = port.estimatedAvailableAt.getTime() - Date.now();
        minutesRemaining = Math.max(0, Math.round(diff / 60000));
      }
      return {
        id: port.id,
        connectorType: port.connectorType,
        chargerType: port.chargerType,
        powerKw: port.powerKw,
        status: port.status,
        portNumber: port.portNumber,
        pricing: {
          perKwh: port.pricePerKwh,
          perMinute: port.pricePerMinute,
          sessionFee: port.pricePerSession,
        },
        estimatedAvailableAt: port.estimatedAvailableAt,
        minutesRemaining,
      };
    });

    const pricing = station.pricing as StationPricing | null;

    return {
      id: station.id,
      name: station.name,
      description: station.description,
      address: station.address,
      area: (station as unknown as { area?: string | null }).area ?? null,
      city: station.city,
      state: station.state,
      postalCode: station.postalCode,
      country: station.country,
      latitude: station.latitude,
      longitude: station.longitude,
      lat: station.latitude,
      lng: station.longitude,
      isOpenNow,
      openingHoursText: this.buildOpeningHoursText(asRaw),
      operatingHours: station.operatingHours as OperatingHours | null,
      amenities: (station.amenities as string[]) || [],
      priceText: this.buildPriceText(pricing),
      pricing,
      phoneNumber: station.phoneNumber,
      network: station.network || null,
      images: station.images.map((img) => ({
        id: img.id,
        url: img.url,
        caption: img.caption,
      })),
      ports: portsWithTime,
      totalPorts: station.totalPorts,
      availablePorts: station.availablePorts,
      rating: station.avgRating,
      reviewCount: station.reviewCount,
      statusSummary: this.buildStatusSummary(station.ports),
      portsAvailableCount: station.availablePorts,
      portsTotalCount: station.totalPorts,
      connectors: this.buildConnectorSummary(station.ports),
      isFavorite,
      isVerified: station.isVerified,
      lastStatusUpdate: station.lastStatusUpdate,
      updatedAt: station.updatedAt?.toISOString() ?? null,
      status: (station as unknown as { status?: string }).status ?? 'APPROVED',
      submittedBy: (station as unknown as { submittedBy?: string | null }).submittedBy ?? null,
      rejectionReason: (station as unknown as { rejectionReason?: string | null }).rejectionReason ?? null,
    };
  }

  private groupBy<T extends Record<string, unknown>>(array: T[], key: string): Record<string, T[]> {
    return array.reduce(
      (acc, item) => {
        const groupKey = item[key] as string;
        if (!acc[groupKey]) acc[groupKey] = [];
        acc[groupKey].push(item);
        return acc;
      },
      {} as Record<string, T[]>,
    );
  }
}

// Types for raw queries
interface StationWithDistance {
  id: string;
  name: string;
  description: string | null;
  address: string;
  area?: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  is_active: boolean;
  is_verified: boolean;
  operating_hours: unknown;
  amenities: unknown;
  pricing: unknown;
  phone_number: string | null;
  total_ports: number;
  available_ports: number;
  avg_rating: number | null;
  review_count: number;
  last_status_update: Date | null;
  created_at: Date;
  updated_at: Date;
  distance_km: number | null;
}

interface ConnectorSummary {
  type: string;
  powerKw: number;
  count: number;
}

interface StationCardResult {
  id: string;
  name: string;
  address: string;
  area: string | null;
  city: string;
  lat: number;
  lng: number;
  heroImageUrl: string | null;
  images: string[];
  distanceKm: number | null;
  rating: number | null;
  reviewCount: number;
  isOpenNow: boolean;
  openingHoursText: string;
  priceText: string | null;
  statusSummary: string;
  portsAvailableCount: number;
  portsTotalCount: number;
  connectors: ConnectorSummary[];
  amenities: string[];
  updatedAt: string | null;
  isFavorite: boolean;
}

interface StationDetailResult {
  id: string;
  name: string;
  description: string | null;
  address: string;
  area: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  country: string;
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  isOpenNow: boolean;
  openingHoursText: string;
  operatingHours: OperatingHours | null;
  amenities: string[];
  priceText: string | null;
  pricing: StationPricing | null;
  phoneNumber: string | null;
  network: { id: string; name: string; logoUrl: string | null; website: string | null; phoneNumber: string | null } | null;
  images: { id: string; url: string; caption: string | null }[];
  ports: {
    id: string;
    connectorType: string;
    chargerType: string;
    powerKw: number;
    status: string;
    portNumber: string | null;
    pricing: { perKwh: number | null; perMinute: number | null; sessionFee: number | null };
    estimatedAvailableAt: Date | null;
    minutesRemaining: number | null;
  }[];
  totalPorts: number;
  availablePorts: number;
  rating: number | null;
  reviewCount: number;
  statusSummary: string;
  portsAvailableCount: number;
  portsTotalCount: number;
  connectors: ConnectorSummary[];
  isFavorite: boolean;
  isVerified: boolean;
  lastStatusUpdate: Date | null;
  updatedAt: string | null;
  status: string;
  submittedBy: string | null;
  rejectionReason: string | null;
}

interface ReviewResult {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}
