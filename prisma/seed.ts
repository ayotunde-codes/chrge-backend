import {
  PrismaClient,
  AuthProvider,
  UserRole,
  PortStatus,
  ChargerType,
  ConnectorType,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Cleaning existing data...');
    await prisma.review.deleteMany();
    await prisma.favorite.deleteMany();
    await prisma.stationImage.deleteMany();
    await prisma.port.deleteMany();
    await prisma.station.deleteMany();
    await prisma.network.deleteMany();
    await prisma.userVehicle.deleteMany();
    await prisma.vehicleModel.deleteMany();
    await prisma.vehicleBrand.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  }

  // ============================================================================
  // USERS
  // ============================================================================

  const passwordHash = await argon2.hash('TestPassword123!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const testUser = await prisma.user.create({
    data: {
      email: 'test@chrge.ng',
      passwordHash,
      firstName: 'Ayo',
      lastName: 'Test',
      provider: AuthProvider.EMAIL,
      emailVerified: true,
      role: UserRole.USER,
    },
  });
  console.log(`✅ Created test user: ${testUser.email}`);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@chrge.ng',
      passwordHash,
      firstName: 'Admin',
      lastName: 'CHRGE',
      provider: AuthProvider.EMAIL,
      emailVerified: true,
      role: UserRole.ADMIN,
    },
  });
  console.log(`✅ Created admin user: ${adminUser.email}`);

  // ============================================================================
  // VEHICLE BRANDS & MODELS
  // ============================================================================

  const brands = [
    {
      name: 'Tesla',
      logoUrl: 'https://chrge.ng/brands/tesla.png',
      country: 'USA',
      models: [
        {
          name: 'Model 3',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 60,
          rangeKm: 491,
        },
        {
          name: 'Model 3 Long Range',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 82,
          rangeKm: 629,
        },
        {
          name: 'Model Y',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 75,
          rangeKm: 533,
        },
        {
          name: 'Model Y Long Range',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 82,
          rangeKm: 533,
        },
        {
          name: 'Model S',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 100,
          rangeKm: 652,
        },
        {
          name: 'Model X',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 100,
          rangeKm: 560,
        },
      ],
    },
    {
      name: 'BMW',
      logoUrl: 'https://chrge.ng/brands/bmw.png',
      country: 'Germany',
      models: [
        {
          name: 'iX xDrive50',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 111.5,
          rangeKm: 630,
        },
        {
          name: 'iX xDrive40',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 76.6,
          rangeKm: 425,
        },
        {
          name: 'i4 eDrive40',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 83.9,
          rangeKm: 590,
        },
        {
          name: 'i5 eDrive40',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 83.9,
          rangeKm: 582,
        },
        {
          name: 'i7 xDrive60',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 101.7,
          rangeKm: 625,
        },
      ],
    },
    {
      name: 'Mercedes-Benz',
      logoUrl: 'https://chrge.ng/brands/mercedes.png',
      country: 'Germany',
      models: [
        {
          name: 'EQS 450+',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 107.8,
          rangeKm: 780,
        },
        {
          name: 'EQE 350+',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 90.6,
          rangeKm: 654,
        },
        {
          name: 'EQB 300',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 66.5,
          rangeKm: 423,
        },
        {
          name: 'EQA 250+',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 70.5,
          rangeKm: 560,
        },
      ],
    },
    {
      name: 'BYD',
      logoUrl: 'https://chrge.ng/brands/byd.png',
      country: 'China',
      models: [
        {
          name: 'Atto 3',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 60.48,
          rangeKm: 420,
        },
        {
          name: 'Seal',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 82.56,
          rangeKm: 570,
        },
        { name: 'Han', connectorType: ConnectorType.CCS2, batteryCapacityKwh: 85.44, rangeKm: 521 },
        { name: 'Tang', connectorType: ConnectorType.CCS2, batteryCapacityKwh: 86.4, rangeKm: 400 },
        {
          name: 'Dolphin',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 44.9,
          rangeKm: 340,
        },
      ],
    },
    {
      name: 'Hyundai',
      logoUrl: 'https://chrge.ng/brands/hyundai.png',
      country: 'South Korea',
      models: [
        {
          name: 'Ioniq 6 Long Range',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 77.4,
          rangeKm: 614,
        },
        {
          name: 'Ioniq 5 Long Range',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 77.4,
          rangeKm: 507,
        },
        {
          name: 'Kona Electric',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 65.4,
          rangeKm: 514,
        },
      ],
    },
    {
      name: 'Kia',
      logoUrl: 'https://chrge.ng/brands/kia.png',
      country: 'South Korea',
      models: [
        {
          name: 'EV6 Long Range',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 77.4,
          rangeKm: 528,
        },
        {
          name: 'EV9 Long Range',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 99.8,
          rangeKm: 541,
        },
        {
          name: 'Niro EV',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 64.8,
          rangeKm: 463,
        },
      ],
    },
    {
      name: 'Porsche',
      logoUrl: 'https://chrge.ng/brands/porsche.png',
      country: 'Germany',
      models: [
        {
          name: 'Taycan',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 79.2,
          rangeKm: 431,
        },
        {
          name: 'Taycan 4S',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 93.4,
          rangeKm: 512,
        },
        {
          name: 'Taycan Turbo',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 93.4,
          rangeKm: 484,
        },
      ],
    },
    {
      name: 'Audi',
      logoUrl: 'https://chrge.ng/brands/audi.png',
      country: 'Germany',
      models: [
        {
          name: 'e-tron GT',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 93.4,
          rangeKm: 488,
        },
        {
          name: 'Q8 e-tron',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 114,
          rangeKm: 582,
        },
        {
          name: 'Q4 e-tron',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 82,
          rangeKm: 520,
        },
      ],
    },
    {
      name: 'Jaguar',
      logoUrl: 'https://chrge.ng/brands/jaguar.png',
      country: 'UK',
      models: [
        { name: 'I-PACE', connectorType: ConnectorType.CCS2, batteryCapacityKwh: 90, rangeKm: 470 },
      ],
    },
    {
      name: 'Volkswagen',
      logoUrl: 'https://chrge.ng/brands/vw.png',
      country: 'Germany',
      models: [
        {
          name: 'ID.4 Pro',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 77,
          rangeKm: 520,
        },
        {
          name: 'ID.5 GTX',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 77,
          rangeKm: 490,
        },
        {
          name: 'ID.Buzz',
          connectorType: ConnectorType.CCS2,
          batteryCapacityKwh: 82,
          rangeKm: 418,
        },
      ],
    },
    {
      name: 'Nissan',
      logoUrl: 'https://chrge.ng/brands/nissan.png',
      country: 'Japan',
      models: [
        { name: 'Ariya', connectorType: ConnectorType.CCS2, batteryCapacityKwh: 87, rangeKm: 533 },
        {
          name: 'Leaf',
          connectorType: ConnectorType.CHADEMO,
          batteryCapacityKwh: 40,
          rangeKm: 270,
        },
        {
          name: 'Leaf e+',
          connectorType: ConnectorType.CHADEMO,
          batteryCapacityKwh: 62,
          rangeKm: 385,
        },
      ],
    },
  ];

  for (const brandData of brands) {
    const brand = await prisma.vehicleBrand.create({
      data: {
        name: brandData.name,
        logoUrl: brandData.logoUrl,
        country: brandData.country,
        isActive: true,
      },
    });

    for (const modelData of brandData.models) {
      await prisma.vehicleModel.create({
        data: {
          brandId: brand.id,
          name: modelData.name,
          connectorType: modelData.connectorType,
          batteryCapacityKwh: modelData.batteryCapacityKwh,
          rangeKm: modelData.rangeKm,
          isActive: true,
        },
      });
    }

    console.log(`✅ Created brand: ${brand.name} with ${brandData.models.length} models`);
  }

  // Create a user vehicle
  const teslaModel = await prisma.vehicleModel.findFirst({
    where: { name: 'Model 3 Long Range' },
  });
  if (teslaModel) {
    await prisma.userVehicle.create({
      data: {
        userId: testUser.id,
        modelId: teslaModel.id,
        nickname: 'My Tesla',
        isPrimary: true,
      },
    });
    console.log('✅ Created user vehicle');
  }

  // ============================================================================
  // NETWORKS
  // ============================================================================

  const networks = await Promise.all([
    prisma.network.create({
      data: {
        name: 'CHRGE',
        website: 'https://chrge.ng',
        logoUrl: 'https://chrge.ng/logo.png',
        phoneNumber: '+234 800 CHRGE 00',
      },
    }),
    prisma.network.create({
      data: {
        name: 'Zaptec Nigeria',
        website: 'https://zaptec.ng',
        logoUrl: 'https://zaptec.ng/logo.png',
        phoneNumber: '+234 800 ZAP 00',
      },
    }),
    prisma.network.create({
      data: {
        name: 'GridPower',
        website: 'https://gridpower.ng',
        logoUrl: 'https://gridpower.ng/logo.png',
        phoneNumber: '+234 800 GRID 00',
      },
    }),
  ]);
  console.log('✅ Created charging networks');

  // ============================================================================
  // STATIONS (Lagos, Nigeria)
  // ============================================================================

  const stationsData = [
    {
      networkId: networks[0].id,
      name: 'CHRGE Lekki Phase 1',
      description:
        'Premium fast charging station in the heart of Lekki Phase 1. Open 24 hours with security on site.',
      address: '12 Admiralty Way, Lekki Phase 1',
      city: 'Lekki',
      state: 'Lagos',
      country: 'NG',
      latitude: 6.4281,
      longitude: 3.4219,
      isActive: true,
      isVerified: true,
      operatingHours: null, // 24h
      amenities: ['restrooms', 'wifi', 'security', 'cctv', 'lighting'],
      pricing: { perKwh: 350, sessionFee: 500, currency: 'NGN' },
      phoneNumber: '+234 812 345 6789',
      ports: [
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 150,
          status: PortStatus.AVAILABLE,
          portNumber: 'A1',
        },
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 150,
          status: PortStatus.AVAILABLE,
          portNumber: 'A2',
        },
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 150,
          status: PortStatus.IN_USE,
          portNumber: 'B1',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 22,
          status: PortStatus.AVAILABLE,
          portNumber: 'C1',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 22,
          status: PortStatus.AVAILABLE,
          portNumber: 'C2',
        },
      ],
      images: [
        {
          url: 'https://chrge.ng/stations/lekki-1-main.jpg',
          isPrimary: true,
          caption: 'CHRGE Lekki Phase 1 Station',
        },
        {
          url: 'https://chrge.ng/stations/lekki-1-chargers.jpg',
          isPrimary: false,
          caption: 'Fast charging bays',
        },
      ],
    },
    {
      networkId: networks[0].id,
      name: 'CHRGE Victoria Island',
      description:
        'Convenient charging location on Victoria Island with dedicated parking. Walking distance to restaurants and shopping.',
      address: '24 Adeola Odeku Street, Victoria Island',
      city: 'Victoria Island',
      state: 'Lagos',
      country: 'NG',
      latitude: 6.4281,
      longitude: 3.4194,
      isActive: true,
      isVerified: true,
      operatingHours: {
        mon: { open: '07:00', close: '22:00' },
        tue: { open: '07:00', close: '22:00' },
        wed: { open: '07:00', close: '22:00' },
        thu: { open: '07:00', close: '22:00' },
        fri: { open: '07:00', close: '22:00' },
        sat: { open: '08:00', close: '20:00' },
        sun: { open: '08:00', close: '18:00' },
      },
      amenities: ['restrooms', 'wifi', 'food', 'shopping', 'security'],
      pricing: { perKwh: 400, currency: 'NGN' },
      phoneNumber: '+234 812 345 6790',
      ports: [
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 120,
          status: PortStatus.AVAILABLE,
          portNumber: 'A1',
        },
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 120,
          status: PortStatus.OUT_OF_ORDER,
          portNumber: 'A2',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 22,
          status: PortStatus.AVAILABLE,
          portNumber: 'B1',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 11,
          status: PortStatus.IN_USE,
          portNumber: 'B2',
        },
      ],
      images: [
        {
          url: 'https://chrge.ng/stations/vi-main.jpg',
          isPrimary: true,
          caption: 'CHRGE Victoria Island',
        },
      ],
    },
    {
      networkId: networks[0].id,
      name: 'CHRGE Ikoyi',
      description:
        'Fast charging station located in Ikoyi. Perfect stop while running errands in the area.',
      address: '45 Awolowo Road, Ikoyi',
      city: 'Ikoyi',
      state: 'Lagos',
      country: 'NG',
      latitude: 6.4475,
      longitude: 3.435,
      isActive: true,
      isVerified: true,
      operatingHours: {
        mon: { open: '06:00', close: '23:00' },
        tue: { open: '06:00', close: '23:00' },
        wed: { open: '06:00', close: '23:00' },
        thu: { open: '06:00', close: '23:00' },
        fri: { open: '06:00', close: '23:00' },
        sat: { open: '06:00', close: '23:00' },
        sun: { open: '08:00', close: '20:00' },
      },
      amenities: ['wifi', 'security', 'cctv'],
      pricing: { perKwh: 380, sessionFee: 300, currency: 'NGN' },
      phoneNumber: '+234 812 345 6791',
      ports: [
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 100,
          status: PortStatus.AVAILABLE,
          portNumber: 'A1',
        },
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 100,
          status: PortStatus.AVAILABLE,
          portNumber: 'A2',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 22,
          status: PortStatus.UNKNOWN,
          portNumber: 'B1',
        },
      ],
      images: [
        {
          url: 'https://chrge.ng/stations/ikoyi-main.jpg',
          isPrimary: true,
          caption: 'CHRGE Ikoyi Station',
        },
      ],
    },
    {
      networkId: networks[1].id,
      name: 'Zaptec Ikeja City Mall',
      description:
        'Charge while you shop at Ikeja City Mall. Multiple charging bays available in the parking structure.',
      address: 'Obafemi Awolowo Way, Alausa, Ikeja',
      city: 'Ikeja',
      state: 'Lagos',
      country: 'NG',
      latitude: 6.6018,
      longitude: 3.3515,
      isActive: true,
      isVerified: true,
      operatingHours: {
        mon: { open: '09:00', close: '21:00' },
        tue: { open: '09:00', close: '21:00' },
        wed: { open: '09:00', close: '21:00' },
        thu: { open: '09:00', close: '21:00' },
        fri: { open: '09:00', close: '21:00' },
        sat: { open: '09:00', close: '22:00' },
        sun: { open: '10:00', close: '20:00' },
      },
      amenities: ['restrooms', 'wifi', 'food', 'shopping', 'parking'],
      pricing: { perKwh: 320, currency: 'NGN' },
      phoneNumber: '+234 813 456 7890',
      ports: [
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 50,
          status: PortStatus.AVAILABLE,
          portNumber: '1',
        },
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 50,
          status: PortStatus.AVAILABLE,
          portNumber: '2',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 7.4,
          status: PortStatus.IN_USE,
          portNumber: '3',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 7.4,
          status: PortStatus.AVAILABLE,
          portNumber: '4',
        },
      ],
      images: [
        {
          url: 'https://zaptec.ng/stations/ikeja-mall.jpg',
          isPrimary: true,
          caption: 'Zaptec at Ikeja City Mall',
        },
      ],
    },
    {
      networkId: networks[1].id,
      name: 'Zaptec Maryland Mall',
      description:
        'Convenient charging at Maryland Mall. AC charging available while you enjoy shopping or dining.',
      address: '350 Ikorodu Road, Maryland',
      city: 'Maryland',
      state: 'Lagos',
      country: 'NG',
      latitude: 6.5632,
      longitude: 3.3673,
      isActive: true,
      isVerified: false,
      operatingHours: {
        mon: { open: '08:00', close: '21:00' },
        tue: { open: '08:00', close: '21:00' },
        wed: { open: '08:00', close: '21:00' },
        thu: { open: '08:00', close: '21:00' },
        fri: { open: '08:00', close: '21:00' },
        sat: { open: '09:00', close: '21:00' },
        sun: { open: '10:00', close: '19:00' },
      },
      amenities: ['food', 'shopping', 'parking'],
      pricing: { perKwh: 280, currency: 'NGN' },
      ports: [
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 11,
          status: PortStatus.AVAILABLE,
          portNumber: 'L1',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 11,
          status: PortStatus.AVAILABLE,
          portNumber: 'L2',
        },
      ],
      images: [
        {
          url: 'https://zaptec.ng/stations/maryland-mall.jpg',
          isPrimary: true,
          caption: 'Zaptec Maryland Mall',
        },
      ],
    },
    {
      networkId: networks[2].id,
      name: 'GridPower Surulere Hub',
      description:
        'Fast charging hub in Surulere with multiple DCFC chargers. Ideal for quick top-ups.',
      address: '15 Adeniran Ogunsanya Street, Surulere',
      city: 'Surulere',
      state: 'Lagos',
      country: 'NG',
      latitude: 6.4969,
      longitude: 3.3567,
      isActive: true,
      isVerified: true,
      operatingHours: null, // 24h
      amenities: ['security', 'cctv', 'lighting'],
      pricing: { perKwh: 300, perMinute: 5, currency: 'NGN' },
      phoneNumber: '+234 814 567 8901',
      ports: [
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 150,
          status: PortStatus.AVAILABLE,
          portNumber: 'DC1',
        },
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 150,
          status: PortStatus.AVAILABLE,
          portNumber: 'DC2',
        },
        {
          connectorType: ConnectorType.CHADEMO,
          chargerType: ChargerType.DCFC,
          powerKw: 50,
          status: PortStatus.UNKNOWN,
          portNumber: 'CH1',
        },
      ],
      images: [
        {
          url: 'https://gridpower.ng/stations/surulere.jpg',
          isPrimary: true,
          caption: 'GridPower Surulere Hub',
        },
      ],
    },
    {
      networkId: networks[2].id,
      name: 'GridPower Yaba Tech',
      description: 'Charging station near Yaba Tech. Popular with students and faculty.',
      address: 'Herbert Macaulay Way, Yaba',
      city: 'Yaba',
      state: 'Lagos',
      country: 'NG',
      latitude: 6.5158,
      longitude: 3.378,
      isActive: true,
      isVerified: false,
      operatingHours: {
        mon: { open: '07:00', close: '22:00' },
        tue: { open: '07:00', close: '22:00' },
        wed: { open: '07:00', close: '22:00' },
        thu: { open: '07:00', close: '22:00' },
        fri: { open: '07:00', close: '22:00' },
        sat: { open: '08:00', close: '20:00' },
        sun: { open: '10:00', close: '18:00' },
      },
      amenities: ['wifi', 'food'],
      pricing: { perKwh: 250, currency: 'NGN' },
      ports: [
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 22,
          status: PortStatus.AVAILABLE,
          portNumber: 'A',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 22,
          status: PortStatus.IN_USE,
          portNumber: 'B',
        },
      ],
      images: [
        {
          url: 'https://gridpower.ng/stations/yaba.jpg',
          isPrimary: true,
          caption: 'GridPower Yaba Tech',
        },
      ],
    },
    {
      networkId: networks[0].id,
      name: 'CHRGE Ajah',
      description:
        'Serving the Ajah and Sangotedo communities. Located near Abraham Adesanya roundabout.',
      address: 'Abraham Adesanya Road, Ajah',
      city: 'Ajah',
      state: 'Lagos',
      country: 'NG',
      latitude: 6.4667,
      longitude: 3.5667,
      isActive: true,
      isVerified: true,
      operatingHours: {
        mon: { open: '06:00', close: '22:00' },
        tue: { open: '06:00', close: '22:00' },
        wed: { open: '06:00', close: '22:00' },
        thu: { open: '06:00', close: '22:00' },
        fri: { open: '06:00', close: '22:00' },
        sat: { open: '06:00', close: '22:00' },
        sun: { open: '08:00', close: '20:00' },
      },
      amenities: ['restrooms', 'parking', 'security'],
      pricing: { perKwh: 320, sessionFee: 200, currency: 'NGN' },
      phoneNumber: '+234 812 345 6792',
      ports: [
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 120,
          status: PortStatus.AVAILABLE,
          portNumber: 'A1',
        },
        {
          connectorType: ConnectorType.CCS2,
          chargerType: ChargerType.DCFC,
          powerKw: 120,
          status: PortStatus.AVAILABLE,
          portNumber: 'A2',
        },
        {
          connectorType: ConnectorType.TYPE2,
          chargerType: ChargerType.LEVEL2,
          powerKw: 22,
          status: PortStatus.AVAILABLE,
          portNumber: 'B1',
        },
      ],
      images: [
        {
          url: 'https://chrge.ng/stations/ajah.jpg',
          isPrimary: true,
          caption: 'CHRGE Ajah Station',
        },
      ],
    },
  ];

  for (const stationData of stationsData) {
    const { ports, images, operatingHours, ...stationFields } = stationData;

    const station = await prisma.station.create({
      data: {
        ...stationFields,
        operatingHours: operatingHours ?? undefined,
        totalPorts: ports.length,
        availablePorts: ports.filter((p) => p.status === PortStatus.AVAILABLE).length,
      },
    });

    // Create ports
    for (const portData of ports) {
      await prisma.port.create({
        data: {
          stationId: station.id,
          ...portData,
          lastStatusUpdate: new Date(),
        },
      });
    }

    // Create images
    for (let i = 0; i < images.length; i++) {
      await prisma.stationImage.create({
        data: {
          stationId: station.id,
          url: images[i].url,
          caption: images[i].caption,
          isPrimary: images[i].isPrimary,
          sortOrder: i,
        },
      });
    }

    console.log(`✅ Created station: ${station.name} (${ports.length} ports)`);
  }

  // ============================================================================
  // FAVORITES & REVIEWS
  // ============================================================================

  const allStations = await prisma.station.findMany({ take: 4 });

  for (let i = 0; i < allStations.length; i++) {
    const station = allStations[i];

    // Add to favorites
    if (i < 2) {
      await prisma.favorite.create({
        data: {
          userId: testUser.id,
          stationId: station.id,
        },
      });
    }

    // Add review
    const rating = 4 + (i % 2);
    const comments = [
      'Great charging station! Fast and reliable. Will definitely come back.',
      'Nice location, easy to find. Staff were helpful.',
      'Good charging speeds. The app shows accurate availability.',
      'Convenient location near the mall. Charged while shopping.',
    ];

    await prisma.review.create({
      data: {
        userId: testUser.id,
        stationId: station.id,
        rating,
        comment: comments[i % comments.length],
      },
    });

    // Update station rating
    await prisma.station.update({
      where: { id: station.id },
      data: {
        avgRating: rating,
        reviewCount: 1,
      },
    });
  }
  console.log('✅ Created favorites and reviews');

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📋 Test Accounts:');
  console.log('   Email: test@chrge.ng');
  console.log('   Password: TestPassword123!');
  console.log('\n   Email: admin@chrge.ng');
  console.log('   Password: TestPassword123!');
  console.log(`\n📍 Created ${stationsData.length} stations in Lagos, Nigeria`);
  console.log(
    `🚗 Created ${brands.length} vehicle brands with ${brands.reduce((acc, b) => acc + b.models.length, 0)} models`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
