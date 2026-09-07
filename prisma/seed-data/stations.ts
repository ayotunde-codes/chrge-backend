import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ChargerType,
  ConnectorType,
  PortStatus,
  Prisma,
  PrismaClient,
  StationStatus,
  StationType,
} from '@prisma/client';

type ResearchSource = { kind: string; url: string };
type ResearchConnector = { type: string; powerKw: number | null; count: number | null };
type ResearchGeocoding = {
  provider: string;
  placeId?: string;
  formattedAddress?: string;
  locationType?: string;
  partialMatch?: boolean;
  geocodedAt?: string;
  query?: string;
};
type ResearchStation = {
  id: string;
  stationType: 'EV' | 'CNG';
  serviceType: string;
  name: string;
  operator: string | null;
  address: string;
  area: string | null;
  city: string;
  state: string;
  region: string | null;
  country: string;
  latitude: number;
  longitude: number;
  locationAccuracy: string;
  access: string;
  operationalStatus: string;
  connectors: ResearchConnector[];
  cngDetails: Record<string, unknown> | null;
  openingHoursText: string | null;
  priceText: string | null;
  phoneNumber: string | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  geocoding?: ResearchGeocoding;
  verification: {
    tier: 'A' | 'B' | 'C';
    confidence: number;
    basis: string;
    checkedAt: string;
  };
  sources: ResearchSource[];
};

type ResearchCatalog = {
  metadata: Record<string, unknown>;
  stations: ResearchStation[];
};

const catalogPath = join(
  process.cwd(),
  'prisma',
  'seed-data',
  'nigeria-stations-research-2026-09-05.geocoded.json',
);

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

function stableUuid(sourceId: string): string {
  const hex = createHash('sha256').update(`chrge-station-catalog:${sourceId}`).digest('hex');
  const variantNibble = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variantNibble}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function chargerType(connector: ConnectorType): ChargerType {
  const dcConnectors = new Set<ConnectorType>([
    ConnectorType.CCS1,
    ConnectorType.CCS2,
    ConnectorType.CHADEMO,
    ConnectorType.GB_T,
  ]);
  return dcConnectors.has(connector)
    ? ChargerType.DCFC
    : ChargerType.LEVEL2;
}

function pricingFromText(priceText: string | null): Prisma.InputJsonValue | undefined {
  if (!priceText) return undefined;
  const match = priceText.match(/₦([\d,.]+)\s*\/\s*(kWh|scm|kg|litre)/i);
  if (!match) return undefined;
  const amount = Number(match[1].replaceAll(',', ''));
  if (!Number.isFinite(amount)) return undefined;

  const unit = match[2].toLowerCase();
  return {
    currency: 'NGN',
    ...(unit === 'kwh' && { perKwh: amount }),
    ...(unit === 'scm' && { perScm: amount }),
    ...(unit === 'kg' && { perKg: amount }),
    ...(unit === 'litre' && { perLitre: amount }),
  };
}

function operatingHoursFromText(text: string | null): Prisma.InputJsonValue {
  if (text?.trim().toLowerCase() === '24/7') {
    return Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [
        day,
        { open: '24h', close: '24h' },
      ]),
    );
  }
  return { status: 'UNVERIFIED', label: text?.trim() || 'Hours unverified' };
}

function isNavigationReady(station: ResearchStation): boolean {
  const supportedAccuracy = new Set([
    'google_maps_pin',
    'google_rooftop',
    'google_range_interpolated',
    'osm_feature',
  ]);
  return supportedAccuracy.has(station.locationAccuracy) && !station.geocoding?.partialMatch;
}

function stationDescription(station: ResearchStation): string {
  const operator = station.operator ? `Operated by ${station.operator}. ` : '';
  return `${operator}${station.verification.basis}`;
}

export async function seedResearchedStations(prisma: PrismaClient): Promise<void> {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as ResearchCatalog;
  const isStaging = process.env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === 'staging';
  const includeTierC = isStaging || process.env.NODE_ENV !== 'production';
  const networkIds = new Map<string, string>();

  for (const operator of new Set(catalog.stations.map((station) => station.operator).filter(Boolean))) {
    const name = operator as string;
    const network = await prisma.network.upsert({
      where: { name },
      create: { name },
      update: {},
      select: { id: true },
    });
    networkIds.set(name, network.id);
  }

  for (const station of catalog.stations) {
    const stationId = stableUuid(station.id);
    const connectors = station.connectors
      .map((connector) => ({ ...connector, connectorType: connectorMap[connector.type] }))
      .filter(
        (connector): connector is ResearchConnector & { connectorType: ConnectorType } =>
          Boolean(connector.connectorType),
      );
    const navigationReady = isNavigationReady(station);
    const isActive = includeTierC || station.verification.tier !== 'C';
    const commonData = {
      networkId: station.operator ? networkIds.get(station.operator) : undefined,
      name: station.name,
      description: stationDescription(station),
      stationType: station.stationType === 'CNG' ? StationType.CNG : StationType.EV,
      operatorName: station.operator,
      serviceType: station.serviceType,
      address: station.address,
      area: station.area,
      city: station.city,
      state: station.state,
      country: station.country,
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: 'Africa/Lagos',
      locationAccuracy: station.locationAccuracy,
      navigationReady,
      isActive,
      isVerified: station.verification.tier === 'A',
      status: StationStatus.APPROVED,
      operatingHours: operatingHoursFromText(station.openingHoursText),
      openingHoursNote: station.openingHoursText,
      amenities: [] as Prisma.InputJsonValue,
      pricing: pricingFromText(station.priceText),
      priceNote: station.priceText,
      cngDetails: (station.cngDetails ?? undefined) as Prisma.InputJsonValue | undefined,
      accessNotes: station.access,
      operationalStatus: station.operationalStatus,
      verificationTier: station.verification.tier,
      verificationConfidence: station.verification.confidence,
      verificationBasis: station.verification.basis,
      verifiedAt: new Date(`${station.verification.checkedAt}T00:00:00.000Z`),
      sourceLinks: station.sources as Prisma.InputJsonValue,
      researchMetadata: {
        researchCatalogId: station.id,
        region: station.region,
        geocoding: station.geocoding ?? null,
        googleRating: station.googleRating ?? null,
        googleReviewCount: station.googleReviewCount ?? null,
        catalogMetadata: {
          title: catalog.metadata.title,
          researchedAt: catalog.metadata.researchedAt,
        },
      } as Prisma.InputJsonValue,
      phoneNumber: station.phoneNumber,
      totalPorts: connectors.length,
      availablePorts: 0,
      avgRating: station.googleRating ?? null,
      reviewCount: station.googleReviewCount ?? 0,
      lastStatusUpdate: null,
      deletedAt: null,
    };

    await prisma.$transaction(async (tx) => {
      await tx.station.upsert({
        where: { id: stationId },
        create: { id: stationId, ...commonData },
        update: commonData,
      });
      await tx.port.deleteMany({ where: { stationId } });
      if (connectors.length) {
        await tx.port.createMany({
          data: connectors.flatMap((connector, connectorIndex) => {
            const count = Math.max(1, connector.count ?? 1);
            return Array.from({ length: count }, (_, portIndex) => ({
              id: stableUuid(`${station.id}:port:${connector.type}:${connectorIndex}:${portIndex}`),
              stationId,
              connectorType: connector.connectorType,
              chargerType: chargerType(connector.connectorType),
              powerKw: connector.powerKw,
              status: PortStatus.UNKNOWN,
              portNumber: connector.count ? String(portIndex + 1) : null,
            }));
          }),
        });
      }
    });
  }

  const tierCounts = catalog.stations.reduce<Record<string, number>>((counts, station) => {
    const tier = station.verification.tier;
    counts[tier] = (counts[tier] ?? 0) + 1;
    return counts;
  }, {});
  const navigationReadyCount = catalog.stations.filter(isNavigationReady).length;
  console.log(
    `Station catalog ready: ${catalog.stations.length} stations (${navigationReadyCount} navigation-ready; tiers ${JSON.stringify(tierCounts)})`,
  );
}
