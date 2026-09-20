import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CngApplicationDocument,
  CngApplicationStatus,
  DocumentScanStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'crypto';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { basename } from 'path';
import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdvanceCngWorkflowDto,
  AdminCngApplicationQueryDto,
  CngRepaymentWebhookDto,
  RequestPhoneVerificationDto,
  ReviewCngApplicationDto,
  SaveFinancingDetailsDto,
  SavePersonalDetailsDto,
  SaveVehicleDetailsDto,
  SubmitCngReviewNoteDto,
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
import { DocumentStorageService } from './document-storage.service';
import { ResendEmailService } from '../auth/resend-email.service';

type ApplicationWithDocuments = Prisma.CngApplicationGetPayload<{
  include: { documents: true };
}>;

type ApplicationWithWorkflow = Prisma.CngApplicationGetPayload<{
  include: { documents: true; installments: true };
}>;

@Injectable()
export class CngApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sensitiveData: SensitiveDataService,
    private readonly otpDelivery: OtpDeliveryService,
    private readonly documentStorage: DocumentStorageService,
    private readonly email: ResendEmailService,
    private readonly config: ConfigService,
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
    const application = await this.prisma.cngApplication.findUnique({
      where: { id },
      include: { documents: true, installments: { orderBy: { number: 'asc' } } },
    });
    if (!application) throw new NotFoundException('CNG application not found');
    return this.mapApplication(application);
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

    await this.notifyCustomerUpdate(
      updated.email,
      updated.reference,
      updated.id,
      'personal and contact information',
    );
    return this.mapApplication(updated);
  }

  async requestPhoneVerification(
    id: string,
    dto: RequestPhoneVerificationDto,
  ): Promise<{ phone: string; expiresAt: Date; developmentCode?: string }> {
    const application = await this.getEditableApplication(id);
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

    await this.notifyCustomerUpdate(
      updated.email,
      updated.reference,
      updated.id,
      'vehicle information',
    );
    return this.mapApplication(updated);
  }

  async saveFinancingDetails(
    id: string,
    dto: SaveFinancingDetailsDto,
  ): Promise<Record<string, unknown>> {
    await this.getEditableApplication(id);
    const plan = CNG_FINANCING_PLANS[dto.financingPlanId];
    const packageDetails = CNG_PACKAGES[dto.packageId];

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
        preferredLoanTenor: plan.tenure,
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

    await this.notifyCustomerUpdate(
      updated.email,
      updated.reference,
      updated.id,
      'financing selection',
    );
    return this.mapApplication(updated);
  }

  async saveDocument(
    id: string,
    type: string,
    file: Express.Multer.File,
    storageKey: string,
  ): Promise<Record<string, unknown>> {
    const application = await this.getEditableApplication(id);
    if (!isCngDocumentType(type)) {
      throw new BadRequestException('Unsupported CNG application document type');
    }

    const config = CNG_DOCUMENTS[type];
    if (
      !(config.allowedMimeTypes as readonly string[]).includes(file.mimetype) ||
      file.size > config.maxSizeBytes
    ) {
      throw new BadRequestException(
        `${config.label} must use an allowed format and be no larger than ${config.maxSizeBytes / 1024 / 1024} MB`,
      );
    }
    if (!this.hasValidFileSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('Document contents do not match the declared file format');
    }

    const existing = await this.prisma.cngApplicationDocument.findUnique({
      where: { applicationId_type: { applicationId: id, type } },
    });
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const signatureClearedForStaging =
      process.env.CHRGE_ENV === 'staging' &&
      process.env.CNG_DOCUMENT_SCAN_MODE === 'signature-only';
    const scanStatus = signatureClearedForStaging
      ? DocumentScanStatus.CLEAN
      : DocumentScanStatus.PENDING;
    const scanMetadata = signatureClearedForStaging
      ? { scanStatus, scannedAt: new Date(), scannerVersion: 'signature-only-v1' }
      : { scanStatus, scannedAt: null, scannerVersion: null };
    await this.documentStorage.putObject(storageKey, file.buffer, file.mimetype);

    let document: CngApplicationDocument;
    try {
      document = await this.prisma.cngApplicationDocument.upsert({
        where: { applicationId_type: { applicationId: id, type } },
        create: {
          applicationId: id,
          type,
          originalName: basename(file.originalname),
          storageKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256,
          ...scanMetadata,
        },
        update: {
          originalName: basename(file.originalname),
          storageKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256,
          uploadedAt: new Date(),
          ...scanMetadata,
        },
      });
    } catch (error) {
      await this.documentStorage.deleteObject(storageKey);
      throw error;
    }

    if (existing && existing.storageKey !== storageKey) {
      await this.documentStorage.deleteObject(existing.storageKey);
    }

    await this.notifyCustomerUpdate(
      application.email,
      application.reference,
      application.id,
      `document:${type}`,
    );
    return this.mapDocument(document);
  }

  async deleteDocument(id: string, type: string): Promise<void> {
    const application = await this.getEditableApplication(id);
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
    await this.documentStorage.deleteObject(existing.storageKey);
    await this.notifyCustomerUpdate(
      application.email,
      application.reference,
      application.id,
      `document removed:${type}`,
    );
  }

  async getDocumentForDownload(
    id: string,
    type: string,
  ): Promise<{ document: CngApplicationDocument; stream: Readable }> {
    if (!isCngDocumentType(type)) {
      throw new BadRequestException('Unsupported CNG application document type');
    }
    const document = await this.prisma.cngApplicationDocument.findUnique({
      where: { applicationId_type: { applicationId: id, type } },
    });
    if (!document) {
      throw new NotFoundException('Application document not found');
    }

    const stream = await this.documentStorage.getObject(document.storageKey);
    return { document, stream };
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
    const rejectableStatuses: CngApplicationStatus[] = [
      CngApplicationStatus.SUBMITTED,
      CngApplicationStatus.UNDER_REVIEW,
      CngApplicationStatus.INSPECTION_APPOINTMENT_BOOKED,
      CngApplicationStatus.FINANCING_APPROVED,
      CngApplicationStatus.CONVERSION_APPOINTMENT_BOOKED,
    ];
    if (
      dto.status === CngApplicationStatus.UNDER_REVIEW &&
      application.status !== CngApplicationStatus.SUBMITTED
    ) {
      throw new ConflictException('Only submitted applications can start review');
    }
    if (
      dto.status === CngApplicationStatus.REJECTED &&
      !rejectableStatuses.includes(application.status)
    ) {
      throw new ConflictException('Applications cannot be rejected after finance is disbursed');
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
        reviewNote: dto.reviewNote || application.reviewNote,
        rejectionReason: dto.status === CngApplicationStatus.REJECTED ? dto.rejectionReason : null,
      },
      include: { documents: true },
    });

    return this.mapApplication(updated);
  }

  async submitReviewNote(id: string, authorId: string, dto: SubmitCngReviewNoteDto) {
    const application = await this.getApplicationRecord(id);
    if (
      application.status === CngApplicationStatus.REJECTED ||
      application.status === CngApplicationStatus.CANCELLED
    ) {
      throw new ConflictException('Notes cannot be added to a closed application');
    }
    await this.prisma.cngApplicationReviewNote.create({
      data: { applicationId: id, authorId, note: dto.note.trim() },
    });
    return { saved: true };
  }

  async advanceWorkflow(id: string, dto: AdvanceCngWorkflowDto) {
    const application = await this.getApplicationRecord(id);
    const nextStatus: Partial<Record<CngApplicationStatus, CngApplicationStatus>> = {
      [CngApplicationStatus.UNDER_REVIEW]: CngApplicationStatus.INSPECTION_APPOINTMENT_BOOKED,
      [CngApplicationStatus.INSPECTION_APPOINTMENT_BOOKED]: CngApplicationStatus.FINANCING_APPROVED,
      [CngApplicationStatus.FINANCING_APPROVED]: CngApplicationStatus.CONVERSION_APPOINTMENT_BOOKED,
      [CngApplicationStatus.CONVERSION_APPOINTMENT_BOOKED]: CngApplicationStatus.FINANCE_DISBURSED,
      [CngApplicationStatus.FINANCE_DISBURSED]: CngApplicationStatus.CONVERSION_COMPLETED,
    };
    if (nextStatus[application.status] !== dto.status) {
      throw new ConflictException(
        `Expected ${nextStatus[application.status] ?? 'no further manual status'} next`,
      );
    }

    const now = new Date();
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : now;
    const timestampData: Prisma.CngApplicationUpdateInput = {};
    if (dto.status === CngApplicationStatus.INSPECTION_APPOINTMENT_BOOKED)
      timestampData.inspectionAppointmentAt = scheduledAt;
    if (dto.status === CngApplicationStatus.FINANCING_APPROVED)
      timestampData.financingApprovedAt = now;
    if (dto.status === CngApplicationStatus.CONVERSION_APPOINTMENT_BOOKED)
      timestampData.conversionAppointmentAt = scheduledAt;
    if (dto.status === CngApplicationStatus.FINANCE_DISBURSED)
      timestampData.financeDisbursedAt = now;
    if (dto.status === CngApplicationStatus.CONVERSION_COMPLETED) {
      timestampData.conversionCompletedAt = now;
      if (!application.preferredLoanTenor) timestampData.fullyPaidAt = now;
    }

    const tenure = application.preferredLoanTenor ?? 0;
    if (
      dto.status === CngApplicationStatus.FINANCE_DISBURSED &&
      tenure > 0 &&
      application.monthlyPaymentNgn
    ) {
      await this.prisma.cngInstallment.createMany({
        data: Array.from({ length: tenure }, (_, index) => ({
          applicationId: id,
          number: index + 1,
          amountNgn: application.monthlyPaymentNgn!,
          dueAt: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index + 1, now.getUTCDate()),
          ),
        })),
        skipDuplicates: true,
      });
    }

    return this.mapApplication(
      await this.prisma.cngApplication.update({
        where: { id },
        data: {
          status:
            dto.status === CngApplicationStatus.CONVERSION_COMPLETED && !tenure
              ? CngApplicationStatus.FULLY_PAID
              : dto.status,
          ...timestampData,
        },
        include: { documents: true },
      }),
    );
  }

  async recordInstallmentPayment(dto: CngRepaymentWebhookDto) {
    const previouslyProcessed = await this.prisma.cngInstallment.findUnique({
      where: { webhookEventId: dto.eventId },
    });
    if (previouslyProcessed) return { accepted: true, duplicate: true };

    const application = await this.prisma.cngApplication.findUnique({
      where: { reference: dto.applicationReference },
      include: { installments: true },
    });
    if (!application) throw new NotFoundException('CNG application not found');
    const repayableStatuses: CngApplicationStatus[] = [
      CngApplicationStatus.CONVERSION_COMPLETED,
      CngApplicationStatus.REPAYMENT_ACTIVE,
    ];
    if (!repayableStatuses.includes(application.status)) {
      throw new ConflictException('Repayments can only be recorded after conversion is completed');
    }
    const installment = application.installments.find(
      (item) => item.number === dto.installmentNumber,
    );
    if (!installment) throw new NotFoundException('Installment not found');
    if (installment.amountNgn !== dto.amountNgn)
      throw new BadRequestException('Installment amount does not match');
    if (installment.status === 'PAID') return { accepted: true, duplicate: true };

    await this.prisma.cngInstallment.update({
      where: { id: installment.id },
      data: {
        status: 'PAID',
        paidAt: new Date(dto.paidAt),
        providerReference: dto.providerReference,
        webhookEventId: dto.eventId,
      },
    });
    const paidCount = application.installments.filter((item) => item.status === 'PAID').length + 1;
    const fullyPaid = paidCount === application.installments.length;
    await this.prisma.cngApplication.update({
      where: { id: application.id },
      data: {
        status: fullyPaid ? CngApplicationStatus.FULLY_PAID : CngApplicationStatus.REPAYMENT_ACTIVE,
        fullyPaidAt: fullyPaid ? new Date(dto.paidAt) : null,
      },
    });
    return { accepted: true, duplicate: false, fullyPaid, installmentsPaid: paidCount };
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

  private mapApplication(
    application: ApplicationWithDocuments | ApplicationWithWorkflow,
  ): Record<string, unknown> {
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
          repaymentTenure: application.preferredLoanTenor,
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
      workflow: {
        inspectionAppointmentAt: application.inspectionAppointmentAt,
        financingApprovedAt: application.financingApprovedAt,
        conversionAppointmentAt: application.conversionAppointmentAt,
        financeDisbursedAt: application.financeDisbursedAt,
        conversionCompletedAt: application.conversionCompletedAt,
        fullyPaidAt: application.fullyPaidAt,
        installments:
          'installments' in application
            ? application.installments.map((installment) => ({
                number: installment.number,
                amountNgn: installment.amountNgn,
                dueAt: installment.dueAt,
                status: installment.status,
                paidAt: installment.paidAt,
              }))
            : [],
      },
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
      scanStatus: document.scanStatus,
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
        displayName: [application.firstName, application.lastName]
          .filter(Boolean)
          .map((value) => `${value?.slice(0, 1)}•••`)
          .join(' '),
        email: application.email,
        phone: application.phone ? `••••••${application.phone.slice(-4)}` : null,
      },
      vehicle: {
        brand: application.vehicleBrand,
        model: application.vehicleModel,
        licensePlate: application.licensePlate ? `••••${application.licensePlate.slice(-4)}` : null,
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

  private async notifyCustomerUpdate(
    email: string | null,
    reference: string,
    applicationId: string,
    field: string,
  ) {
    if (!email) return;
    const base = this.config.get<string>(
      'CHRGE_FRONTEND_URL',
      'https://chrge-frontend-staging.vercel.app',
    );
    await this.email
      .sendCngApplicationUpdated({
        to: email,
        notificationId: randomUUID(),
        reference,
        updatedBy: 'customer',
        changedFields: [field],
        dashboardUrl: `${base}/cng/dashboard/${applicationId}`,
      })
      .catch(() => undefined);
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

  private hasValidFileSignature(buffer: Buffer, mimeType: string): boolean {
    const signature = buffer.subarray(0, 8);

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
  }
}
