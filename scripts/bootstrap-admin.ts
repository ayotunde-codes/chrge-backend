import { createHash, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

async function main() {
  const email = required('ADMIN_BOOTSTRAP_EMAIL').toLowerCase();
  const password = required('ADMIN_BOOTSTRAP_PASSWORD');
  const mfaSecretEncrypted = required('ADMIN_MFA_SECRET_ENCRYPTED');
  const recoveryCodes = JSON.parse(required('ADMIN_RECOVERY_CODES')) as string[];
  if (
    password.length < 16 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error(
      'ADMIN_BOOTSTRAP_PASSWORD must be at least 16 characters with upper, lower, and numeric characters',
    );
  }
  if (!Array.isArray(recoveryCodes) || recoveryCodes.length < 8)
    throw new Error('At least eight one-time recovery codes are required');

  const existingTopLevel = await prisma.staffProfile.findFirst({
    where: { role: { isTopLevel: true } },
  });
  if (existingTopLevel)
    throw new Error('Bootstrap refused: a top-level administrator already exists');
  if (await prisma.user.findUnique({ where: { email } }))
    throw new Error('Bootstrap refused: email already belongs to an identity');

  const permissionIds = [
    'station.read',
    'station.moderate',
    'cng.read',
    'cng.review',
    'document.read',
    'vehicle.manage',
    'user.manage',
    'staff.manage',
    'audit.read',
    'report.export',
    'settings.manage',
  ];
  const recoveryPepper = required('RECOVERY_CODE_PEPPER');
  await prisma.$transaction(async (tx) => {
    for (const id of permissionIds)
      await tx.staffPermission.upsert({ where: { id }, create: { id }, update: {} });
    await tx.staffRole.create({
      data: {
        id: 'SUPER_ADMIN',
        name: 'Super administrator',
        isTopLevel: true,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    await tx.staffRole.upsert({
      where: { id: 'ADMIN' },
      create: { id: 'ADMIN', name: 'Administrator' },
      update: {},
    });
    await tx.staffRole.upsert({
      where: { id: 'OPERATOR' },
      create: { id: 'OPERATOR', name: 'Operator' },
      update: {},
    });
    const user = await tx.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(password),
        emailVerified: true,
        accountType: 'STAFF',
        role: 'ADMIN',
      },
    });
    await tx.staffProfile.create({
      data: {
        userId: user.id,
        staffRoleId: 'SUPER_ADMIN',
        status: 'ACTIVE',
        activatedAt: new Date(),
        mfaEnabledAt: new Date(),
        mfaSecretEncrypted,
        recoveryCodesHash: recoveryCodes.map((code) =>
          createHash('sha256').update(`${recoveryPepper}:${code}`).digest('hex'),
        ),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        actorRole: 'ADMIN',
        action: 'staff.bootstrap',
        targetType: 'staff_profile',
        targetId: user.id,
        reason: 'One-time administrator bootstrap',
        requestId: randomUUID(),
        sensitivity: 'RESTRICTED',
        afterSummary: { role: 'SUPER_ADMIN', status: 'ACTIVE', mfaEnabled: true },
      },
    });
  });
  process.stdout.write(
    'Bootstrap administrator created. Rotate the bootstrap inputs and remove them from the environment.\n',
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Bootstrap failed'}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
