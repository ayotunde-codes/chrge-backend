import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditSensitivity,
  CngFinancingConfigurationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditContext, AuditService } from '../audit/audit.service';
import { StaffAuthService } from '../auth/staff-auth.service';
import { CNG_REPAYMENT_FREQUENCY, cngInstallmentCount } from './cng-application.constants';
import {
  CONFIGURABLE_CNG_PLAN_IDS,
  SaveCngFinancingPackageDto,
} from './dto/cng-financing-configuration.dto';

const TERM_DEFINITIONS = {
  full: { name: 'Full Payment', depositPct: 100 },
  gold: { name: 'Gold Plan', depositPct: 50 },
  silver: { name: 'Silver Plan', depositPct: 20 },
  bronze: { name: 'Bronze Plan', depositPct: 10 },
} as const;

type PackageVersionWithTerms = Prisma.CngFinancingPackageVersionGetPayload<{
  include: { terms: true };
}>;

type Actor = { id: string; role: UserRole };

@Injectable()
export class CngFinancingConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAuth: StaffAuthService,
    private readonly audit: AuditService,
  ) {}

  private validateTerms(dto: SaveCngFinancingPackageDto) {
    const ids = dto.terms.map((term) => term.planId);
    if (new Set(ids).size !== CONFIGURABLE_CNG_PLAN_IDS.length)
      throw new BadRequestException('Each deposit option must be configured exactly once');
    if (CONFIGURABLE_CNG_PLAN_IDS.some((id) => !ids.includes(id)))
      throw new BadRequestException('The 50%, 20%, and 10% deposit options are required');
  }

  private termRows(dto: SaveCngFinancingPackageDto) {
    this.validateTerms(dto);
    return [
      {
        planId: 'full',
        name: TERM_DEFINITIONS.full.name,
        depositPct: TERM_DEFINITIONS.full.depositPct,
        tenureMonths: null,
        interestRateBps: 0,
      },
      ...dto.terms.map((term) => ({
        planId: term.planId,
        name: TERM_DEFINITIONS[term.planId].name,
        depositPct: TERM_DEFINITIONS[term.planId].depositPct,
        tenureMonths: term.tenureMonths,
        interestRateBps: term.interestRateBps,
      })),
    ];
  }

  private quote(priceNgn: number, term: PackageVersionWithTerms['terms'][number]) {
    const depositAmountNgn = Math.round(priceNgn * (term.depositPct / 100));
    const financedAmountNgn = priceNgn - depositAmountNgn;
    const interestAmountNgn = Math.round(financedAmountNgn * (term.interestRateBps / 10000));
    const scheduledRepaymentNgn = financedAmountNgn + interestAmountNgn;
    const installmentCount = cngInstallmentCount(term.tenureMonths);
    return {
      depositAmountNgn,
      financedAmountNgn,
      interestAmountNgn,
      scheduledRepaymentNgn,
      totalCostNgn: depositAmountNgn + scheduledRepaymentNgn,
      installmentCount,
      weeklyPaymentNgn: installmentCount ? Math.round(scheduledRepaymentNgn / installmentCount) : 0,
    };
  }

  private mapVersion(version: PackageVersionWithTerms | null | undefined) {
    if (!version) return null;
    const ordered = [...version.terms].sort((a, b) => b.depositPct - a.depositPct);
    return {
      id: version.id,
      version: version.version,
      status: version.status,
      name: version.name,
      tank: version.tank,
      priceNgn: version.priceNgn,
      publishedAt: version.publishedAt,
      updatedAt: version.updatedAt,
      financingPlans: ordered.map((term) => ({
        id: term.planId,
        name: term.name,
        depositPct: term.depositPct,
        tenure: term.tenureMonths,
        interestRate: term.interestRateBps / 10000,
        interestRateBps: term.interestRateBps,
        repaymentFrequency: CNG_REPAYMENT_FREQUENCY,
        installmentCount: cngInstallmentCount(term.tenureMonths),
        quote: this.quote(version.priceNgn, term),
      })),
    };
  }

  async publicPackages() {
    const packages = await this.prisma.cngFinancingPackage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        versions: {
          where: { status: CngFinancingConfigurationStatus.PUBLISHED },
          orderBy: { version: 'desc' },
          take: 1,
          include: { terms: true },
        },
      },
    });
    return packages.flatMap((item) => {
      const version = this.mapVersion(item.versions[0]);
      if (!version) return [];
      const { id: configurationVersionId, ...configuration } = version;
      return version
        ? [
            {
              id: item.id,
              code: item.code,
              active: item.isActive,
              configurationVersionId,
              ...configuration,
            },
          ]
        : [];
    });
  }

  async findPublishedQuote(packageId: string, planId: string) {
    const item = await this.prisma.cngFinancingPackage.findFirst({
      where: { id: packageId, isActive: true },
      include: {
        versions: {
          where: { status: CngFinancingConfigurationStatus.PUBLISHED },
          orderBy: { version: 'desc' },
          take: 1,
          include: { terms: true },
        },
      },
    });
    const version = item?.versions[0];
    const term = version?.terms.find((candidate) => candidate.planId === planId);
    if (!item || !version || !term)
      throw new BadRequestException('The selected financing option is no longer available');
    return { package: item, version, term, quote: this.quote(version.priceNgn, term) };
  }

  async listForAdmin() {
    const packages = await this.prisma.cngFinancingPackage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { versions: { orderBy: { version: 'desc' }, include: { terms: true } } },
    });
    return packages.map((item) => ({
      id: item.id,
      code: item.code,
      active: item.isActive,
      sortOrder: item.sortOrder,
      published: this.mapVersion(
        item.versions.find(
          (version) => version.status === CngFinancingConfigurationStatus.PUBLISHED,
        ),
      ),
      draft: this.mapVersion(
        item.versions.find((version) => version.status === CngFinancingConfigurationStatus.DRAFT),
      ),
      history: item.versions
        .filter((version) => version.status === CngFinancingConfigurationStatus.ARCHIVED)
        .map((version) => this.mapVersion(version)),
    }));
  }

  async create(dto: SaveCngFinancingPackageDto, actor: Actor, context: AuditContext) {
    const rows = this.termRows(dto);
    const baseCode =
      dto.name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'CNG-PLAN';
    const existing = await this.prisma.cngFinancingPackage.findUnique({
      where: { code: baseCode },
    });
    const code = existing ? `${baseCode}-${randomUUID().slice(0, 6).toUpperCase()}` : baseCode;
    const aggregate = await this.prisma.cngFinancingPackage.aggregate({
      _max: { sortOrder: true },
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.cngFinancingPackage.create({
        data: {
          code,
          isActive: false,
          sortOrder: (aggregate._max.sortOrder ?? 0) + 10,
          createdBy: actor.id,
          versions: {
            create: {
              version: 1,
              name: dto.name.trim(),
              tank: dto.tank.trim(),
              priceNgn: dto.priceNgn,
              createdBy: actor.id,
              terms: { create: rows },
            },
          },
        },
        include: { versions: { include: { terms: true } } },
      });
      await this.audit.create(
        context,
        {
          action: 'cng.financing_package_created',
          targetType: 'cng_financing_package',
          targetId: item.id,
          sensitivity: AuditSensitivity.SENSITIVE,
          afterSummary: { code, name: dto.name, priceNgn: dto.priceNgn },
        },
        tx,
      );
      return item;
    });
    return {
      id: created.id,
      code: created.code,
      active: created.isActive,
      draft: this.mapVersion(created.versions[0]),
    };
  }

  async saveDraft(
    packageId: string,
    dto: SaveCngFinancingPackageDto,
    actor: Actor,
    context: AuditContext,
  ) {
    const rows = this.termRows(dto);
    const item = await this.prisma.cngFinancingPackage.findUnique({
      where: { id: packageId },
      include: { versions: { orderBy: { version: 'desc' }, include: { terms: true } } },
    });
    if (!item) throw new NotFoundException('Financing package not found');
    const existingDraft = item.versions.find(
      (version) => version.status === CngFinancingConfigurationStatus.DRAFT,
    );
    const nextVersion = Math.max(0, ...item.versions.map((version) => version.version)) + 1;
    const saved = await this.prisma.$transaction(async (tx) => {
      let versionId = existingDraft?.id;
      if (existingDraft) {
        await tx.cngFinancingPackageTerm.deleteMany({ where: { versionId: existingDraft.id } });
        await tx.cngFinancingPackageVersion.update({
          where: { id: existingDraft.id },
          data: {
            name: dto.name.trim(),
            tank: dto.tank.trim(),
            priceNgn: dto.priceNgn,
            terms: { create: rows },
          },
        });
      } else {
        const created = await tx.cngFinancingPackageVersion.create({
          data: {
            packageId,
            version: nextVersion,
            name: dto.name.trim(),
            tank: dto.tank.trim(),
            priceNgn: dto.priceNgn,
            createdBy: actor.id,
            terms: { create: rows },
          },
        });
        versionId = created.id;
      }
      await this.audit.create(
        context,
        {
          action: 'cng.financing_draft_saved',
          targetType: 'cng_financing_package',
          targetId: packageId,
          sensitivity: AuditSensitivity.SENSITIVE,
          afterSummary: {
            name: dto.name,
            priceNgn: dto.priceNgn,
            version: existingDraft?.version ?? nextVersion,
          },
        },
        tx,
      );
      return tx.cngFinancingPackageVersion.findUniqueOrThrow({
        where: { id: versionId },
        include: { terms: true },
      });
    });
    return this.mapVersion(saved);
  }

  async publish(
    packageId: string,
    stepUpToken: string,
    reason: string,
    actor: Actor,
    context: AuditContext,
  ) {
    await this.staffAuth.consumeStepUp(
      stepUpToken,
      actor.id,
      'PUBLISH_FINANCING_CONFIG',
      packageId,
    );
    const draft = await this.prisma.cngFinancingPackageVersion.findFirst({
      where: { packageId, status: CngFinancingConfigurationStatus.DRAFT },
      orderBy: { version: 'desc' },
      include: { terms: true },
    });
    if (!draft) throw new ConflictException('There is no draft configuration to publish');
    const published = await this.prisma.$transaction(async (tx) => {
      await tx.cngFinancingPackageVersion.updateMany({
        where: { packageId, status: CngFinancingConfigurationStatus.PUBLISHED },
        data: { status: CngFinancingConfigurationStatus.ARCHIVED },
      });
      const next = await tx.cngFinancingPackageVersion.update({
        where: { id: draft.id },
        data: {
          status: CngFinancingConfigurationStatus.PUBLISHED,
          publishedBy: actor.id,
          publishedAt: new Date(),
        },
        include: { terms: true },
      });
      await this.audit.create(
        context,
        {
          action: 'cng.financing_configuration_published',
          targetType: 'cng_financing_package',
          targetId: packageId,
          reason,
          sensitivity: AuditSensitivity.RESTRICTED,
          afterSummary: { version: next.version, name: next.name, priceNgn: next.priceNgn },
        },
        tx,
      );
      return next;
    });
    return this.mapVersion(published);
  }

  async setActivation(
    packageId: string,
    active: boolean,
    stepUpToken: string,
    reason: string,
    actor: Actor,
    context: AuditContext,
  ) {
    await this.staffAuth.consumeStepUp(stepUpToken, actor.id, 'TOGGLE_FINANCING_PLAN', packageId);
    const item = await this.prisma.cngFinancingPackage.findUnique({
      where: { id: packageId },
      include: { versions: true },
    });
    if (!item) throw new NotFoundException('Financing package not found');
    if (
      active &&
      !item.versions.some((version) => version.status === CngFinancingConfigurationStatus.PUBLISHED)
    )
      throw new ConflictException('Publish the package configuration before activating it');
    const updated = await this.prisma.cngFinancingPackage.update({
      where: { id: packageId },
      data: { isActive: active },
    });
    await this.audit.create(context, {
      action: active ? 'cng.financing_package_activated' : 'cng.financing_package_deactivated',
      targetType: 'cng_financing_package',
      targetId: packageId,
      reason,
      sensitivity: AuditSensitivity.RESTRICTED,
      beforeSummary: { active: item.isActive },
      afterSummary: { active },
    });
    return { id: updated.id, active: updated.isActive };
  }
}
