import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { SensitiveDataService } from '../src/modules/cng-applications/sensitive-data.service';
import { decryptStaffMfaSecret, encryptStaffMfaSecret } from '../src/modules/auth/staff-mfa';

// Re-encrypt persisted staging records after deploying dual-key readers. Never log plaintext.
class RotationError extends Error {}

async function main() {
  const apply = process.argv.includes('--apply');
  const rotateCng = process.argv.includes('--cng');
  const rotateMfa = process.argv.includes('--mfa');
  if (!rotateCng && !rotateMfa) {
    throw new RotationError('Choose --cng and/or --mfa; use --apply only after a successful dry run');
  }

  const config = new ConfigService(process.env);
  if (rotateCng) {
    const current = config.getOrThrow<string>('CNG_APPLICATION_ENCRYPTION_KEY');
    const previous = config.getOrThrow<string>('CNG_APPLICATION_PREVIOUS_ENCRYPTION_KEY');
    if (current === previous) throw new RotationError('CNG current and previous keys must differ');
  }
  if (rotateMfa) {
    const current = config.getOrThrow<string>('ADMIN_MFA_ENCRYPTION_KEY');
    const previous = config.getOrThrow<string>('ADMIN_MFA_PREVIOUS_ENCRYPTION_KEY');
    if (current === previous) throw new RotationError('MFA current and previous keys must differ');
  }

  const prisma = new PrismaClient();
  try {
    const sensitiveData = rotateCng ? new SensitiveDataService(config) : undefined;
    const cngRows = rotateCng
      ? await prisma.cngApplication.findMany({
          where: {
            OR: [
              { bvnEncrypted: { not: null } },
              { ninEncrypted: { not: null } },
              { bvnHash: { not: null } },
              { ninHash: { not: null } },
            ],
          },
          select: {
            id: true,
            bvnEncrypted: true,
            bvnHash: true,
            ninEncrypted: true,
            ninHash: true,
          },
        })
      : [];
    const mfaRows = rotateMfa
      ? await prisma.staffProfile.findMany({
          where: { mfaSecretEncrypted: { not: null } },
          select: { id: true, mfaSecretEncrypted: true },
        })
      : [];

    const cngPrepared = cngRows.map((row) => {
      if ((row.bvnHash && !row.bvnEncrypted) || (row.ninHash && !row.ninEncrypted)) {
        throw new RotationError(`CNG record ${row.id} has a hash without ciphertext`);
      }
      const bvn = row.bvnEncrypted ? sensitiveData!.decrypt(row.bvnEncrypted) : null;
      const nin = row.ninEncrypted ? sensitiveData!.decrypt(row.ninEncrypted) : null;
      return {
        id: row.id,
        oldBvn: row.bvnEncrypted,
        oldNin: row.ninEncrypted,
        bvnEncrypted: bvn ? sensitiveData!.encrypt(bvn) : null,
        bvnHash: bvn ? sensitiveData!.hash(bvn) : null,
        ninEncrypted: nin ? sensitiveData!.encrypt(nin) : null,
        ninHash: nin ? sensitiveData!.hash(nin) : null,
      };
    });
    const mfaPrepared = mfaRows.map((row) => ({
      id: row.id,
      oldValue: row.mfaSecretEncrypted!,
      newValue: encryptStaffMfaSecret(
        config,
        decryptStaffMfaSecret(config, row.mfaSecretEncrypted!),
      ),
    }));

    console.log(
      `Validated ${cngPrepared.length} CNG records and ${mfaPrepared.length} staff MFA records; mode=${apply ? 'apply' : 'dry-run'}`,
    );
    if (!apply) return;

    await prisma.$transaction(
      async (tx) => {
        for (const row of cngPrepared) {
          const result = await tx.cngApplication.updateMany({
            where: {
              id: row.id,
              bvnEncrypted: row.oldBvn,
              ninEncrypted: row.oldNin,
            },
            data: {
              bvnEncrypted: row.bvnEncrypted,
              bvnHash: row.bvnHash,
              ninEncrypted: row.ninEncrypted,
              ninHash: row.ninHash,
            },
          });
          if (result.count !== 1) throw new RotationError(`CNG record ${row.id} changed during rotation`);
        }
        for (const row of mfaPrepared) {
          const result = await tx.staffProfile.updateMany({
            where: { id: row.id, mfaSecretEncrypted: row.oldValue },
            data: { mfaSecretEncrypted: row.newValue },
          });
          if (result.count !== 1) throw new RotationError(`Staff record ${row.id} changed during rotation`);
        }
      },
      { timeout: 30_000 },
    );
    console.log('Persisted encrypted records updated successfully');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: Error) => {
  // ORM and crypto errors may contain values; only our fixed, local errors are printable.
  console.error(
    error instanceof RotationError
      ? `Key rotation aborted: ${error.message}`
      : `Key rotation aborted (${error.name}); no credential or record value logged`,
  );
  process.exitCode = 1;
});
