import * as argon2 from 'argon2';
import {
  AuthProvider,
  PrismaClient,
  StationAssociationStatus,
  StationType,
  UserRole,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const environment = process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.CHRGE_ENV;
  if (environment !== 'staging') {
    throw new Error('Station portal test users may only be created in staging');
  }

  const email = process.env.STATION_PORTAL_TEST_EMAIL;
  const password = process.env.STATION_PORTAL_TEST_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('Set STATION_PORTAL_TEST_EMAIL and a password of at least 12 characters');
  }

  const station = await prisma.station.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      status: 'APPROVED',
      stationType: { in: [StationType.CNG, StationType.HYBRID] },
    },
    orderBy: [{ state: 'asc' }, { name: 'asc' }],
  });
  if (!station) throw new Error('No approved active CNG station exists in staging');

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      firstName: 'Adeola',
      lastName: 'Station QA',
      provider: AuthProvider.EMAIL,
      emailVerified: true,
      role: UserRole.USER,
    },
    update: {
      passwordHash,
      firstName: 'Adeola',
      lastName: 'Station QA',
      emailVerified: true,
      deletedAt: null,
    },
  });

  const association = await prisma.stationAssociation.upsert({
    where: { stationId_userId: { stationId: station.id, userId: user.id } },
    create: {
      stationId: station.id,
      userId: user.id,
      status: StationAssociationStatus.APPROVED,
      approvedAt: new Date(),
    },
    update: {
      status: StationAssociationStatus.APPROVED,
      approvedAt: new Date(),
    },
  });

  console.log(JSON.stringify({ userId: user.id, email: user.email, stationId: station.id, stationName: station.name, associationId: association.id }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
