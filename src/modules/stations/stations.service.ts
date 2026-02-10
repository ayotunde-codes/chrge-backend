import { Injectable, NotFoundException } from '@nestjs/common';
import { Station, Favorite, Review, ConnectorType, PortStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { NearbyStationsDto } from './dto/nearby-stations.dto';
import { CreateReviewDto } from './dto/create-review.dto';

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
        return this.mapToStationCard(stationData, f.station.ports, f.station.images[0]?.url, true);
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

  private mapToStationCard(
    station: StationWithDistance,
    ports: { connectorType: ConnectorType; status: PortStatus; powerKw: number }[],
    heroImageUrl?: string,
    isFavorite = false,
  ): StationCardResult {
    const availableCount = ports.filter((p) => p.status === 'AVAILABLE').length;
    const totalCount = ports.length;
    const connectorTypes = [...new Set(ports.map((p) => p.connectorType))];
    const maxPower = ports.length ? Math.max(...ports.map((p) => p.powerKw)) : null;

    // Format price summary
    const pricing = station.pricing as StationPricing | null;
    let priceSummary: string | null = null;
    if (pricing) {
      const parts: string[] = [];
      if (pricing.perKwh) parts.push(`₦${pricing.perKwh}/kWh`);
      if (pricing.perMinute) parts.push(`₦${pricing.perMinute}/min`);
      if (pricing.sessionFee) parts.push(`₦${pricing.sessionFee} session`);
      priceSummary = parts.join(' + ') || null;
    }

    return {
      id: station.id,
      name: station.name,
      cityAreaLabel: `${station.city}, ${station.state}`,
      distanceKm: station.distance_km ? Math.round(station.distance_km * 10) / 10 : null,
      heroImageUrl: heroImageUrl || null,
      isOpenNow: this.isStationOpen(station),
      priceSummary,
      connectorsSummary: connectorTypes.join(', '),
      maxPowerKw: maxPower,
      portsAvailableCount: availableCount,
      portsTotalCount: totalCount,
      statusSummary: `${availableCount}/${totalCount} available`,
      avgRating: station.avg_rating,
      reviewCount: station.review_count,
      isFavorite,
      updatedAt: station.last_status_update || station.updated_at,
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
    const stationWithDistance = station as unknown as StationWithDistance;
    const isOpenNow = this.isStationOpen(stationWithDistance);

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

    return {
      id: station.id,
      name: station.name,
      description: station.description,
      address: station.address,
      city: station.city,
      state: station.state,
      postalCode: station.postalCode,
      country: station.country,
      latitude: station.latitude,
      longitude: station.longitude,
      isOpenNow,
      operatingHours: station.operatingHours as OperatingHours | null,
      amenities: station.amenities as string[],
      pricing: station.pricing as StationPricing | null,
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
      avgRating: station.avgRating,
      reviewCount: station.reviewCount,
      isFavorite,
      isVerified: station.isVerified,
      lastStatusUpdate: station.lastStatusUpdate,
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

interface StationCardResult {
  id: string;
  name: string;
  cityAreaLabel: string;
  distanceKm: number | null;
  heroImageUrl: string | null;
  isOpenNow: boolean;
  priceSummary: string | null;
  connectorsSummary: string;
  maxPowerKw: number | null;
  portsAvailableCount: number;
  portsTotalCount: number;
  statusSummary: string;
  avgRating: number | null;
  reviewCount: number;
  isFavorite: boolean;
  updatedAt: Date | null;
}

interface StationDetailResult {
  id: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  state: string;
  postalCode: string | null;
  country: string;
  latitude: number;
  longitude: number;
  isOpenNow: boolean;
  operatingHours: OperatingHours | null;
  amenities: string[];
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
  avgRating: number | null;
  reviewCount: number;
  isFavorite: boolean;
  isVerified: boolean;
  lastStatusUpdate: Date | null;
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
