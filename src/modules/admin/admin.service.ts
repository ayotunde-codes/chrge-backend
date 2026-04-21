import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { VehicleBrand, VehicleModel, Station, Port, StationImage } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateVehicleBrandDto,
  CreateVehicleModelDto,
  CreateStationDto,
  UpdateStationDto,
  CreatePortDto,
  UpdatePortDto,
  CreateStationImageDto,
} from './dto/admin.dto';
import { ReviewStationDto } from '../stations/dto/submit-station.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.station.create({
      data: {
        name: dto.name,
        description: dto.description,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country || 'NG',
        latitude: dto.latitude,
        longitude: dto.longitude,
        timezone: dto.timezone || 'Africa/Lagos',
        isActive: dto.isActive ?? true,
        isVerified: dto.isVerified ?? false,
        // Admin-created stations are always approved
        status: 'APPROVED',
        operatingHours: dto.operatingHours,
        amenities: dto.amenities || [],
        pricing: dto.pricing,
        phoneNumber: dto.phoneNumber,
        email: dto.email,
        networkId: dto.networkId,
      },
    });
  }

  async reviewStation(stationId: string, dto: ReviewStationDto): Promise<Station> {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    if (dto.action === 'REJECT' && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason is required when rejecting a station');
    }

    return this.prisma.station.update({
      where: { id: stationId },
      data: {
        status: dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        isActive: dto.action === 'APPROVE',
        isVerified: dto.action === 'APPROVE',
        rejectionReason: dto.action === 'REJECT' ? dto.rejectionReason : null,
      },
    });
  }

  async updateStation(id: string, dto: UpdateStationDto): Promise<Station> {
    const station = await this.prisma.station.findUnique({ where: { id } });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    return this.prisma.station.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country,
        latitude: dto.latitude,
        longitude: dto.longitude,
        timezone: dto.timezone,
        isActive: dto.isActive,
        isVerified: dto.isVerified,
        operatingHours: dto.operatingHours,
        amenities: dto.amenities,
        pricing: dto.pricing,
        phoneNumber: dto.phoneNumber,
        email: dto.email,
        networkId: dto.networkId,
      },
    });
  }

  // ============================================================================
  // STATION IMAGES
  // ============================================================================

  async addStationImage(stationId: string, dto: CreateStationImageDto, uploadedBy?: string): Promise<StationImage> {
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

    return this.prisma.stationImage.create({
      data: {
        stationId,
        url: dto.url,
        caption: dto.caption,
        sortOrder: dto.sortOrder ?? (maxOrder?.sortOrder ?? 0) + 1,
        isPrimary: dto.isPrimary ?? false,
        uploadedBy,
      },
    });
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




