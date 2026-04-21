import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { VehicleBrand, VehicleModel, UserVehicle, ConnectorType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserVehicleDto } from './dto/create-user-vehicle.dto';
import { UpdateUserVehicleDto } from './dto/update-user-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================================
  // BRANDS
  // ============================================================================

  async findAllBrands(search?: string): Promise<VehicleBrand[]> {
    return this.prisma.vehicleBrand.findMany({
      where: {
        isActive: true,
        ...(search && {
          name: { contains: search, mode: 'insensitive' },
        }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findBrandById(id: string): Promise<VehicleBrand> {
    const brand = await this.prisma.vehicleBrand.findFirst({
      where: { id, isActive: true },
    });
    if (!brand) {
      throw new NotFoundException('Vehicle brand not found');
    }
    return brand;
  }

  // ============================================================================
  // MODELS
  // ============================================================================

  async findModelsByBrand(brandId: string): Promise<VehicleModel[]> {
    // Verify brand exists
    await this.findBrandById(brandId);

    return this.prisma.vehicleModel.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
    });
  }

  async findModelById(id: string): Promise<VehicleModel & { brand: VehicleBrand }> {
    const model = await this.prisma.vehicleModel.findFirst({
      where: { id, isActive: true },
      include: { brand: true },
    });
    if (!model) {
      throw new NotFoundException('Vehicle model not found');
    }
    return model;
  }

  // ============================================================================
  // USER VEHICLES
  // ============================================================================

  async getUserVehicles(userId: string): Promise<(UserVehicle & { model: VehicleModel & { brand: VehicleBrand } })[]> {
    return this.prisma.userVehicle.findMany({
      where: { userId, deletedAt: null },
      include: {
        model: {
          include: { brand: true },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createUserVehicle(userId: string, dto: CreateUserVehicleDto): Promise<UserVehicle & { model: VehicleModel & { brand: VehicleBrand } }> {
    // Verify model exists
    await this.findModelById(dto.modelId);

    // Check if user already has this vehicle
    const existing = await this.prisma.userVehicle.findFirst({
      where: { userId, modelId: dto.modelId, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('You already have this vehicle added');
    }

    // If this is the first vehicle or setPrimary is true, make it primary
    const userVehicleCount = await this.prisma.userVehicle.count({
      where: { userId, deletedAt: null },
    });
    const shouldBePrimary = userVehicleCount === 0 || dto.setPrimary;

    // If setting as primary, unset other primaries
    if (shouldBePrimary) {
      await this.prisma.userVehicle.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.userVehicle.create({
      data: {
        userId,
        modelId: dto.modelId,
        nickname: dto.nickname,
        isPrimary: shouldBePrimary,
      },
      include: {
        model: {
          include: { brand: true },
        },
      },
    });
  }

  async updateUserVehicle(
    userId: string,
    vehicleId: string,
    dto: UpdateUserVehicleDto,
  ): Promise<UserVehicle & { model: VehicleModel & { brand: VehicleBrand } }> {
    const vehicle = await this.prisma.userVehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // If setting as primary, unset other primaries
    if (dto.isPrimary) {
      await this.prisma.userVehicle.updateMany({
        where: { userId, isPrimary: true, id: { not: vehicleId } },
        data: { isPrimary: false },
      });
    }

    return this.prisma.userVehicle.update({
      where: { id: vehicleId },
      data: {
        nickname: dto.nickname,
        isPrimary: dto.isPrimary,
      },
      include: {
        model: {
          include: { brand: true },
        },
      },
    });
  }

  async deleteUserVehicle(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.userVehicle.findFirst({
      where: { id: vehicleId, userId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.prisma.userVehicle.update({
      where: { id: vehicleId },
      data: { deletedAt: new Date() },
    });

    // If this was primary, set another as primary
    if (vehicle.isPrimary) {
      const nextVehicle = await this.prisma.userVehicle.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (nextVehicle) {
        await this.prisma.userVehicle.update({
          where: { id: nextVehicle.id },
          data: { isPrimary: true },
        });
      }
    }
  }

  async getPrimaryVehicleConnector(userId: string): Promise<ConnectorType | null> {
    const primaryVehicle = await this.prisma.userVehicle.findFirst({
      where: { userId, isPrimary: true, deletedAt: null },
      include: { model: true },
    });
    if (!primaryVehicle?.model) return null;
    const model = primaryVehicle.model;
    const connectors = model.connectors as string[] | null;
    if (Array.isArray(connectors) && connectors.length > 0) {
      const first = connectors[0];
      const map: Record<string, ConnectorType> = {
        CCS1: ConnectorType.CCS1,
        CCS2: ConnectorType.CCS2,
        CHADEMO: ConnectorType.CHADEMO,
        TESLA: ConnectorType.TESLA,
        J1772: ConnectorType.J1772,
        TYPE_2: ConnectorType.TYPE_2,
        TYPE2: ConnectorType.TYPE2,
        NACS: ConnectorType.NACS,
        GB_T: ConnectorType.GB_T,
      };
      return map[first] ?? model.connectorType ?? null;
    }
    return model.connectorType ?? null;
  }
}
