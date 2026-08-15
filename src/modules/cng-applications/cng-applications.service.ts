import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CngApplicationDocument, CngApplicationStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'crypto';
import { createReadStream } from 'fs';
import { open, stat, unlink } from 'fs/promises';
import { basename, resolve, sep } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminCngApplicationQueryDto,
  RequestPhoneVerificationDto,
  ReviewCngApplicationDto,
  SaveFinancingDetailsDto,
  SavePersonalDetailsDto,
  SaveVehicleDetailsDto,
  VerifyPhoneDto,
} from './dto/cng-application.dto';
import {
  CNG_DOCUMENTS,
  CNG_FINANCING_PLANS,
  CNG_PACKAGES,
  CngFinancingPlan,
  REQUIRED_CNG_DOCUMENT_TYPES,
  isCngDocumentType,
  normalizeNigerianPhone,
} from './cng-application.constants';
import { SensitiveDataService } from './sensitive-data.service';
import { OtpDeliveryService } from './otp-delivery.service';

type ApplicationWithDocuments = Prisma.CngApplicationGetPayload<{
  include: { documents: true };
}>;

@Injectable()
export class CngApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sensitiveData: SensitiveDataService,
    private readonly otpDelivery: OtpDeliveryService,
  ) {}

  getConfiguration(): Record<string, unknown> {
    return {
      packages: Object.entries(CNG_PACKAGES).map(([id, value]) => ({ id, ...value })),
      financingPlans: Object.entries(CNG_FINANCING_PLANS).map(([id, value]) => ({
        id,
        ...value,
      })),
      documents: Object.entries(CNG_DOCUMENTS).map(([type, value]) => ({
        type,
        label: value.label,
        required: value.required,
        maxSizeBytes: value.maxSizeBytes,
        allowedMimeTypes: value.allowedMimeTypes,
      })),
      privacyPolicyVersion: '1.0',
    };
  }

  async createApplication(userId: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const application = await this.prisma.cngApplication.create({
          data: {
            reference: this.generateReference(),
            userId,
          },
          include: { documents: true },
        });

        return this.mapApplication(application);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Could not allocate an application reference');
  }

  async getApplication(id: string): Promise<Record<string, unknown>> {
    return this.mapApplication(await this.getApplicationRecord(id));
  }

  async getMyApplications(userId: string): Promise<Record<string, unknown>[]> {
    const applications = await this.prisma.cngApplication.findMany({
      where: { userId },
      include: { documents: true },
      orderBy: { createdAt: 'desc' },
    });

    return applications.map((application) => this.mapApplication(application));
  }

  async savePersonalDetails(
    id: string,
    dto: SavePersonalDetailsDto,
  ): Promise<Record<string, unknown>> {
    const application = await this.getEditableApplication(id);
    const dateOfBirth = new Date(`${dto.dateOfBirth}T00:00:00.000Z`);
    if (this.calculateAge(dateOfBirth) < 18) {
      throw new BadRequestException('Applicant must be at least 18 years old');
    }

    const employmentStartDate = dto.employmentStartDate
      ? new Date(`${dto.employmentStartDate}T00:00:00.000Z`)
      : null;
    const employmentConfirmationDate = dto.employmentConfirmationDate
      ? new Date(`${dto.employmentConfirmationDate}T00:00:00.000Z`)
      : null;

    if (
      employmentStartDate &&
      employmentConfirmationDate &&
      employmentConfirmationDate < employmentStartDate
    ) {
      throw new BadRequestException(
        'Employment confirmation date cannot be before employment start date',
      );
    }

    const normalizedPhone = normalizeNigerianPhone(dto.phone);
    const phoneChanged = application.phone !== normalizedPhone;
    const updated = await this.prisma.cngApplication.update({
      where: { id },
      data: {
        firstName: dto.firstName.trim(),
        middleName: dto.middleName?.trim() || null,
        lastName: dto.lastName.trim(),
        gender: dto.gender,
        dateOfBirth,
        maritalStatus: dto.maritalStatus,
        email: dto.email,
        phone: normalizedPhone,
        phoneVerifiedAt: phoneChanged ? null : application.phoneVerifiedAt,
        bvnEncrypted: this.sensitiveData.encrypt(dto.bvn),
        bvnHash: this.sensitiveData.hash(dto.bvn),
        bvnLast4: dto.bvn.slice(-4),
        ninEncrypted: this.sensitiveData.encrypt(dto.nin),
        ninHash: this.sensitiveData.hash(dto.nin),
        ninLast4: dto.nin.slice(-4),
        currentlyEmployed: dto.currentlyEmployed,
        employmentStatus: dto.employmentStatus,
        employmentSector: dto.employmentSector,
        employerName: dto.employerName?.trim() || null,
        occupationJobTitle: dto.occupationJobTitle.trim(),
        monthlyIncome: dto.monthlyIncome,
        employmentStartDate,
        employmentConfirmationDate,
        address: dto.address.trim(),
        state: dto.state,
        lga: dto.lga.trim(),
        nextOfKinName: dto.nextOfKinName.trim(),
        nextOfKinPhone: normalizeNigerianPhone(dto.nextOfKinPhone),
        nextOfKinRelationship: dto.nextOfKinRelationship.trim(),
        personalCompletedAt: new Date(),
      },
      include: { documents: true },
    });

    return this.mapApplication(updated);
  }

  async requestPhoneVerification(
    id: string,
    dto: RequestPhoneVerificationDto,
  ): Promise<{ phone: string; expiresAt: Date; developmentCode?: string }> {
    await this.getEditableApplication(id);
    const phone = normalizeNigerianPhone(dto.phone);
    const recentChallenge = await this.prisma.cngPhoneVerification.findFirst({
      where: { applicationId: id, phone },
      orderBy: { createdAt: 'desc' },
    });

    if (recentChallenge && Date.now() - recentChallenge.createdAt.getTime() < 60_000) {
      throw new HttpException(
        'Wait one minute before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const delivery = await this.otpDelivery.send(phone, code);

    await this.prisma.$transaction([
      this.prisma.cngPhoneVerification.updateMany({
        where: { applicationId: id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.cngPhoneVerification.create({
        data: {
          applicationId: id,
          phone,
          codeHash: this.sensitiveData.hash(`${id}:${phone}:${code}`),
          expiresAt,
        },
      }),
      this.prisma.cngApplication.update({
        where: { id },
        data: { phone, phoneVerifiedAt: null },
      }),
    ]);

    return { phone, expiresAt, ...delivery };
  }

  async verifyPhone(id: string, dto: VerifyPhoneDto): Promise<{ verified: true }> {
    await this.getEditableApplication(id);
    const phone = normalizeNigerianPhone(dto.phone);
    const challenge = await this.prisma.cngPhoneVerification.findFirst({
      where: { applicationId: id, phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.expiresAt <= new Date()) {
      throw new BadRequestException('Verification code is invalid or has expired');
    }
    if (challenge.attempts >= 5) {
      throw new HttpException('Too many verification attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const value = `${id}:${phone}:${dto.code}`;
    if (!this.sensitiveData.matchesHash(value, challenge.codeHash)) {
      await this.prisma.cngPhoneVerification.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Verification code is incorrect');
    }

    await this.prisma.$transaction([
      this.prisma.cngPhoneVerification.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.cngApplication.update({
        where: { id },
        data: { phone, phoneVerifiedAt: new Date() },
      }),
    ]);

    return { verified: true };
  }

  async saveVehicleDetails(
    id: string,
    dto: SaveVehicleDetailsDto,
  ): Promise<Record<string, unknown>> {
    await this.getEditableApplication(id);
    if (Number(dto.manufacturingDate.slice(0, 4)) !== dto.vehicleYear) {
      throw new BadRequestException('Manufacturing date must match the vehicle year');
    }

    const updated = await this.prisma.cngApplication.update({
      where: { id },
      data: {
        vehicleBrand: dto.vehicleBrand.trim(),
        vehicleModel: dto.vehicleModel.trim(),
        vehicleYear: dto.vehicleYear,
        manufacturingDate: new Date(`${dto.manufacturingDate}-01T00:00:00.000Z`),
        vehicleColor: dto.vehicleColor.trim(),
        mileage: dto.mileage?.trim() || null,
        fuelSystem: dto.fuelSystem,
        engineType: dto.engineType,
        licensePlate: dto.licensePlate.replace(/\s+/g, '').toUpperCase(),
        chassisNumber: dto.chassisNumber.trim().toUpperCase(),
        engineNumber: dto.engineNumber.trim().toUpperCase(),
        vehicleCompletedAt: new Date(),
      },
      include: { documents: true },
    });

    return this.mapApplication(updated);
  }

  async saveFinancingDetails(
    id: string,
    dto: SaveFinancingDetailsDto,
  ): Promise<Record<string, unknown>> {
    await this.getEditableApplication(id);
    const plan = CNG_FINANCING_PLANS[dto.financingPlanId];
    const packageDetails = CNG_PACKAGES[dto.packageId];

    if (dto.financingPlanId !== CngFinancingPlan.Full && !dto.preferredLoanTenor) {
      throw new BadRequestException('Preferred loan tenor is required for financed plans');
    }

    const depositAmountNgn = Math.round(packageDetails.priceNgn * (plan.depositPct / 100));
    const financedAmountNgn = packageDetails.priceNgn - depositAmountNgn;
    const interestAmountNgn = Math.round(packageDetails.priceNgn * plan.interestRate);
    const totalCostNgn = packageDetails.priceNgn + interestAmountNgn;
    const monthlyPaymentNgn = plan.tenure
      ? Math.round((financedAmountNgn + interestAmountNgn) / plan.tenure)
      : 0;

    const updated = await this.prisma.cngApplication.update({
      where: { id },
      data: {
        packageId: dto.packageId,
        financingPlanId: dto.financingPlanId,
        preferredLoanTenor:
          dto.financingPlanId === CngFinancingPlan.Full ? null : dto.preferredLoanTenor,
        packagePriceNgn: packageDetails.priceNgn,
        depositAmountNgn,
        financedAmountNgn,
        interestAmountNgn,
        monthlyPaymentNgn,
        totalCostNgn,
        privacyConsentAt: new Date(),
        privacyPolicyVersion: dto.privacyPolicyVersion || '1.0',
        financingCompletedAt: new Date(),
      },
      include: { documents: true },
    });

    return this.mapApplication(updated);
  }

  async saveDocument(
    id: string,
    type: string,
    file: Express.Multer.File,
    storageKey: string,
  ): Promise<Record<string, unknown>> {
    await this.getEditableApplication(id);
    if (!isCngDocumentType(type)) {
      await this.removeStoredFile(storageKey);
      throw new BadRequestException('Unsupported CNG application document type');
    }

    const config = CNG_DOCUMENTS[type];
    if (
      !(config.allowedMimeTypes as readonly string[]).includes(file.mimetype) ||
      file.size > config.maxSizeBytes
    ) {
      await this.removeStoredFile(storageKey);
      throw new BadRequestException(
        `${config.label} must use an allowed format and be no larger than ${config.maxSizeBytes / 1024 / 1024} MB`,
      );
    }
    if (!(await this.hasValidFileSignature(storageKey, file.mimetype))) {
      await this.removeStoredFile(storageKey);
      throw new BadRequestException('Document contents do not match the declared file format');
    }

    const existing = await this.prisma.cngApplicationDocument.findUnique({
      where: { applicationId_type: { applicationId: id, type } },
    });
    const checksumSha256 = await this.hashStoredFile(storageKey);

    const document = await this.prisma.cngApplicationDocument.upsert({
      where: { applicationId_type: { applicationId: id, type } },
      create: {
        applicationId: id,
        type,
        originalName: basename(file.originalname),
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksumSha256,
      },
      update: {
        originalName: basename(file.originalname),
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksumSha256,
        uploadedAt: new Date(),
      },
    });

    if (existing && existing.storageKey !== storageKey) {
      await this.removeStoredFile(existing.storageKey);
    }

    return this.mapDocument(document);
  }

  async deleteDocument(id: string, type: string): Promise<void> {
    await this.getEditableApplication(id);
    if (!isCngDocumentType(type)) {
      throw new BadRequestException('Unsupported CNG application document type');
    }

    const existing = await this.prisma.cngApplicationDocument.findUnique({
      where: { applicationId_type: { applicationId: id, type } },
    });
    if (!existing) {
      throw new NotFoundException('Application document not found');
    }

    await this.prisma.cngApplicationDocument.delete({ where: { id: existing.id } });
    await this.removeStoredFile(existing.storageKey);
  }

  async getDocumentForDownload(
    id: string,
    type: string,
  ): Promise<{ document: CngApplicationDocument; absolutePath: string }> {
    if (!isCngDocumentType(type)) {
      throw new BadRequestException('Unsupported CNG application document type');
    }
    const document = await this.prisma.cngApplicationDocument.findUnique({
      where: { applicationId_type: { applicationId: id, type } },
    });
    if (!document) {
      throw new NotFoundException('Application document not found');
    }

    const absolutePath = this.resolveStoragePath(document.storageKey);
    try {
      await stat(absolutePath);
    } catch {
      throw new NotFoundException('Stored application document is unavailable');
    }

    return { document, absolutePath };
  }

  async submitApplication(id: string): Promise<Record<string, unknown>> {
    const application = await this.getEditableApplication(id);
    const missingRequirements: string[] = [];
    if (!application.personalCompletedAt) missingRequirements.push('personal_details');
    if (!application.phoneVerifiedAt) missingRequirements.push('phone_verification');
    if (!application.vehicleCompletedAt) missingRequirements.push('vehicle_details');
    if (!application.financingCompletedAt || !application.privacyConsentAt) {
      missingRequirements.push('financing_and_consent');
    }

    const uploadedTypes = new Set(application.documents.map((document) => document.type));
    for (const type of REQUIRED_CNG_DOCUMENT_TYPES) {
      if (!uploadedTypes.has(type)) missingRequirements.push(`document:${type}`);
    }

    if (missingRequirements.length > 0) {
      throw new BadRequestException({
        message: 'Application is incomplete',
        errors: missingRequirements,
      });
    }

    const updated = await this.prisma.cngApplication.update({
      where: { id },
      data: { status: CngApplicationStatus.SUBMITTED, submittedAt: new Date() },
      include: { documents: true },
    });

    return this.mapApplication(updated);
  }

  async cancelApplication(id: string): Promise<Record<string, unknown>> {
    const application = await this.getApplicationRecord(id);
    const cancellableStatuses: CngApplicationStatus[] = [
      CngApplicationStatus.DRAFT,
      CngApplicationStatus.SUBMITTED,
    ];
    if (!cancellableStatuses.includes(application.status)) {
      throw new ConflictException('This application can no longer be cancelled');
    }

    const updated = await this.prisma.cngApplication.update({
      where: { id },
      data: { status: CngApplicationStatus.CANCELLED, cancelledAt: new Date() },
      include: { documents: true },
    });

    return this.mapApplication(updated);
  }

  async listForAdmin(dto: AdminCngApplicationQueryDto): Promise<Record<string, unknown>> {
    const where: Prisma.CngApplicationWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.search
        ? {
            OR: [
              { reference: { contains: dto.search, mode: 'insensitive' } },
              { firstName: { contains: dto.search, mode: 'insensitive' } },
              { lastName: { contains: dto.search, mode: 'insensitive' } },
              { email: { contains: dto.search, mode: 'insensitive' } },
              { phone: { contains: dto.search } },
            ],
          }
        : {}),
    };
    const skip = (dto.page - 1) * dto.limit;
    const [applications, total] = await Promise.all([
      this.prisma.cngApplication.findMany({
        where,
        include: { documents: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: dto.limit,
      }),
      this.prisma.cngApplication.count({ where }),
    ]);

    return {
      applications: applications.map((application) => this.mapAdminSummary(application)),
      total,
      page: dto.page,
      limit: dto.limit,
      totalPages: Math.ceil(total / dto.limit),
    };
  }

  async reviewApplication(
    id: string,
    reviewerId: string,
    dto: ReviewCngApplicationDto,
  ): Promise<Record<string, unknown>> {
    const application = await this.getApplicationRecord(id);
    const reviewableStatuses: CngApplicationStatus[] = [
      CngApplicationStatus.SUBMITTED,
      CngApplicationStatus.UNDER_REVIEW,
    ];
    if (!reviewableStatuses.includes(application.status)) {
      throw new ConflictException('Only submitted applications can be reviewed');
    }
    if (dto.status === CngApplicationStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason is required when rejecting an application');
    }

    const updated = await this.prisma.cngApplication.update({
      where: { id },
      data: {
        status: dto.status,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote || null,
        rejectionReason: dto.status === CngApplicationStatus.REJECTED ? dto.rejectionReason : null,
      },
      include: { documents: true },
    });

    return this.mapApplication(updated);
  }

  private async getApplicationRecord(id: string): Promise<ApplicationWithDocuments> {
    const application = await this.prisma.cngApplication.findUnique({
      where: { id },
      include: { documents: true },
    });
    if (!application) throw new NotFoundException('CNG application not found');
    return application;
  }

  private async getEditableApplication(id: string): Promise<ApplicationWithDocuments> {
    const application = await this.getApplicationRecord(id);
    if (application.status !== CngApplicationStatus.DRAFT) {
      throw new ConflictException('Only draft applications can be edited');
    }
    return application;
  }

  private mapApplication(application: ApplicationWithDocuments): Record<string, unknown> {
    const uploadedTypes = new Set(application.documents.map((document) => document.type));
    const missingRequiredDocuments = REQUIRED_CNG_DOCUMENT_TYPES.filter(
      (type) => !uploadedTypes.has(type),
    );
    const personal = application.personalCompletedAt
      ? {
          firstName: application.firstName,
          middleName: application.middleName,
          lastName: application.lastName,
          gender: application.gender,
          dateOfBirth: application.dateOfBirth,
          maritalStatus: application.maritalStatus,
          email: application.email,
          phone: application.phone,
          phoneVerified: Boolean(application.phoneVerifiedAt),
          bvnMasked: application.bvnLast4 ? `*******${application.bvnLast4}` : null,
          ninMasked: application.ninLast4 ? `*******${application.ninLast4}` : null,
          currentlyEmployed: application.currentlyEmployed,
          employmentStatus: application.employmentStatus,
          employmentSector: application.employmentSector,
          employerName: application.employerName,
          occupationJobTitle: application.occupationJobTitle,
          monthlyIncome: application.monthlyIncome,
          employmentStartDate: application.employmentStartDate,
          employmentConfirmationDate: application.employmentConfirmationDate,
          address: application.address,
          state: application.state,
          lga: application.lga,
          nextOfKinName: application.nextOfKinName,
          nextOfKinPhone: application.nextOfKinPhone,
          nextOfKinRelationship: application.nextOfKinRelationship,
        }
      : null;
    const vehicle = application.vehicleCompletedAt
      ? {
          vehicleBrand: application.vehicleBrand,
          vehicleModel: application.vehicleModel,
          vehicleYear: application.vehicleYear,
          manufacturingDate: application.manufacturingDate,
          vehicleColor: application.vehicleColor,
          mileage: application.mileage,
          fuelSystem: application.fuelSystem,
          engineType: application.engineType,
          licensePlate: application.licensePlate,
          chassisNumber: application.chassisNumber,
          engineNumber: application.engineNumber,
        }
      : null;
    const financing = application.financingCompletedAt
      ? {
          packageId: application.packageId,
          financingPlanId: application.financingPlanId,
          preferredLoanTenor: application.preferredLoanTenor,
          packagePriceNgn: application.packagePriceNgn,
          depositAmountNgn: application.depositAmountNgn,
          financedAmountNgn: application.financedAmountNgn,
          interestAmountNgn: application.interestAmountNgn,
          monthlyPaymentNgn: application.monthlyPaymentNgn,
          totalCostNgn: application.totalCostNgn,
          privacyConsentAt: application.privacyConsentAt,
          privacyPolicyVersion: application.privacyPolicyVersion,
        }
      : null;

    return {
      id: application.id,
      reference: application.reference,
      status: application.status,
      progress: {
        personal: Boolean(application.personalCompletedAt),
        phoneVerified: Boolean(application.phoneVerifiedAt),
        vehicle: Boolean(application.vehicleCompletedAt),
        documents: missingRequiredDocuments.length === 0,
        financing: Boolean(application.financingCompletedAt),
        missingRequiredDocuments,
      },
      personal,
      vehicle,
      financing,
      documents: application.documents.map((document) => this.mapDocument(document)),
      submittedAt: application.submittedAt,
      reviewedAt: application.reviewedAt,
      reviewNote: application.reviewNote,
      rejectionReason: application.rejectionReason,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }

  private mapDocument(document: CngApplicationDocument): Record<string, unknown> {
    const config = isCngDocumentType(document.type) ? CNG_DOCUMENTS[document.type] : null;
    return {
      id: document.id,
      type: document.type,
      originalName: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      required: config?.required ?? false,
      uploadedAt: document.uploadedAt,
    };
  }

  private mapAdminSummary(application: ApplicationWithDocuments): Record<string, unknown> {
    const uploadedTypes = new Set(application.documents.map((document) => document.type));
    const missingRequiredDocuments = REQUIRED_CNG_DOCUMENT_TYPES.filter(
      (type) => !uploadedTypes.has(type),
    );

    return {
      id: application.id,
      reference: application.reference,
      status: application.status,
      applicant: {
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        phone: application.phone,
      },
      vehicle: {
        brand: application.vehicleBrand,
        model: application.vehicleModel,
        licensePlate: application.licensePlate,
      },
      financing: {
        packageId: application.packageId,
        financingPlanId: application.financingPlanId,
        totalCostNgn: application.totalCostNgn,
      },
      progress: {
        personal: Boolean(application.personalCompletedAt),
        phoneVerified: Boolean(application.phoneVerifiedAt),
        vehicle: Boolean(application.vehicleCompletedAt),
        documents: missingRequiredDocuments.length === 0,
        financing: Boolean(application.financingCompletedAt),
        missingRequiredDocuments,
      },
      submittedAt: application.submittedAt,
      reviewedAt: application.reviewedAt,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }

  private generateReference(): string {
    return `CNG-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    const beforeBirthday =
      today.getUTCMonth() < dateOfBirth.getUTCMonth() ||
      (today.getUTCMonth() === dateOfBirth.getUTCMonth() &&
        today.getUTCDate() < dateOfBirth.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age;
  }

  private getStorageRoot(): string {
    return resolve(
      this.configService.get<string>(
        'CNG_DOCUMENT_STORAGE_PATH',
        'private-uploads/cng-applications',
      ),
    );
  }

  private resolveStoragePath(storageKey: string): string {
    const root = this.getStorageRoot();
    const absolutePath = resolve(root, storageKey);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
      throw new BadRequestException('Invalid document storage path');
    }
    return absolutePath;
  }

  private async hashStoredFile(storageKey: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = createReadStream(this.resolveStoragePath(storageKey));
    for await (const chunk of stream) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }

  private async hasValidFileSignature(storageKey: string, mimeType: string): Promise<boolean> {
    const file = await open(this.resolveStoragePath(storageKey), 'r');
    try {
      const buffer = Buffer.alloc(8);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      const signature = buffer.subarray(0, bytesRead);

      if (mimeType === 'image/png') {
        return signature
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      }
      if (mimeType === 'image/jpeg') {
        return (
          signature.length >= 3 &&
          signature[0] === 0xff &&
          signature[1] === 0xd8 &&
          signature[2] === 0xff
        );
      }
      if (mimeType === 'application/pdf') {
        return signature.subarray(0, 5).toString('ascii') === '%PDF-';
      }
      return false;
    } finally {
      await file.close();
    }
  }

  private async removeStoredFile(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveStoragePath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
