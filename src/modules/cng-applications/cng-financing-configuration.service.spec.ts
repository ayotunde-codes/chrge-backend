import { BadRequestException } from '@nestjs/common';
import { CngFinancingConfigurationStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StaffAuthService } from '../auth/staff-auth.service';
import { CngFinancingConfigurationService } from './cng-financing-configuration.service';

describe('CngFinancingConfigurationService', () => {
  const prisma = {
    cngFinancingPackage: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cngFinancingPackageVersion: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const staffAuth = { consumeStepUp: jest.fn() };
  const audit = { create: jest.fn() };
  const context = { actorId: 'admin-1', actorRole: UserRole.ADMIN, requestId: 'request-1' };
  const actor = { id: 'admin-1', role: UserRole.ADMIN };
  let service: CngFinancingConfigurationService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    service = new CngFinancingConfigurationService(
      prisma as unknown as PrismaService,
      staffAuth as unknown as StaffAuthService,
      audit as unknown as AuditService,
    );
  });

  it('returns only active published packages and calculates interest on financed principal', async () => {
    prisma.cngFinancingPackage.findMany.mockResolvedValue([
      {
        id: 'A',
        code: 'A',
        isActive: true,
        sortOrder: 10,
        createdAt: new Date(),
        versions: [
          {
            id: 'A-v2',
            packageId: 'A',
            version: 2,
            status: CngFinancingConfigurationStatus.PUBLISHED,
            name: 'Compact 65',
            tank: '65 Litre Tank',
            priceNgn: 600000,
            publishedAt: new Date(),
            updatedAt: new Date(),
            terms: [
              {
                id: 'term-1',
                versionId: 'A-v2',
                planId: 'gold',
                name: 'Gold Plan',
                depositPct: 50,
                tenureMonths: 6,
                interestRateBps: 2000,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          },
        ],
      },
    ]);

    const result = await service.publicPackages();

    expect(prisma.cngFinancingPackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(result[0].financingPlans[0].quote).toMatchObject({
      depositAmountNgn: 300000,
      financedAmountNgn: 300000,
      interestAmountNgn: 60000,
      scheduledRepaymentNgn: 360000,
      totalCostNgn: 660000,
      installmentCount: 26,
      weeklyPaymentNgn: 13846,
    });
  });

  it('rejects a draft that does not configure each fixed deposit band exactly once', async () => {
    await expect(
      service.create(
        {
          name: 'New plan',
          tank: '80 Litre Tank',
          priceNgn: 900000,
          terms: [
            { planId: 'gold', tenureMonths: 6, interestRateBps: 1000 },
            { planId: 'gold', tenureMonths: 8, interestRateBps: 1200 },
            { planId: 'bronze', tenureMonths: 12, interestRateBps: 2000 },
          ],
        },
        actor,
        context,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires and consumes an action-bound MFA token before publishing', async () => {
    const draft = {
      id: 'draft-1',
      packageId: 'A',
      version: 2,
      status: CngFinancingConfigurationStatus.DRAFT,
      name: 'Compact 65',
      tank: '65 Litre Tank',
      priceNgn: 600000,
      publishedAt: null,
      updatedAt: new Date(),
      terms: [],
    };
    prisma.cngFinancingPackageVersion.findFirst.mockResolvedValue(draft);
    prisma.cngFinancingPackageVersion.update.mockResolvedValue({
      ...draft,
      status: CngFinancingConfigurationStatus.PUBLISHED,
      publishedAt: new Date(),
    });

    await service.publish('A', 'x'.repeat(48), 'Updated market pricing', actor, context);

    expect(staffAuth.consumeStepUp).toHaveBeenCalledWith(
      'x'.repeat(48),
      'admin-1',
      'PUBLISH_FINANCING_CONFIG',
      'A',
    );
    expect(prisma.cngFinancingPackageVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { packageId: 'A', status: CngFinancingConfigurationStatus.PUBLISHED },
        data: { status: CngFinancingConfigurationStatus.ARCHIVED },
      }),
    );
    expect(audit.create).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ action: 'cng.financing_configuration_published', targetId: 'A' }),
      prisma,
    );
  });
});
