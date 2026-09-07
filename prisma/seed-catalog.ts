import { ConnectorType, PowertrainType, PrismaClient } from '@prisma/client';
import { VEHICLE_BRANDS, VEHICLE_MODELS } from './seed-data/vehicles';

const prisma = new PrismaClient();

const connectorMap: Record<string, ConnectorType> = {
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

const powertrainMap = {
  BEV: PowertrainType.BEV,
  PHEV: PowertrainType.PHEV,
  EREV: PowertrainType.EREV,
} as const;

async function main() {
  for (const brand of VEHICLE_BRANDS) {
    await prisma.vehicleBrand.upsert({
      where: { id: brand.id },
      create: {
        id: brand.id,
        name: brand.name,
        darkLogo: brand.darkLogo ?? false,
        isActive: true,
      },
      update: {
        name: brand.name,
        darkLogo: brand.darkLogo ?? false,
        isActive: true,
      },
    });
  }

  for (const model of VEHICLE_MODELS) {
    const connectors = model.connector as string[];
    const connectorType = connectorMap[connectors[0] ?? 'CCS2'] ?? ConnectorType.CCS2;
    await prisma.vehicleModel.upsert({
      where: { id: model.id },
      create: {
        id: model.id,
        brandId: model.brandId,
        name: model.name,
        powertrain: powertrainMap[model.powertrain],
        connectors,
        connectorType,
        imageUrl: model.imageUrl ?? null,
        isActive: true,
      },
      update: {
        brandId: model.brandId,
        name: model.name,
        powertrain: powertrainMap[model.powertrain],
        connectors,
        connectorType,
        imageUrl: model.imageUrl ?? null,
        isActive: true,
      },
    });
  }

  console.log(`Catalog ready: ${VEHICLE_BRANDS.length} brands and ${VEHICLE_MODELS.length} models`);
}

main()
  .catch((error) => {
    console.error('Catalog seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
