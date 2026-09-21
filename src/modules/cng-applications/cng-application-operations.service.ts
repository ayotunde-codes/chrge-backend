import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditSensitivity, DocumentScanStatus, Prisma, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, basename } from 'path';
import { spawn } from 'child_process';
import { Cron } from '@nestjs/schedule';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AuditContext } from '../audit/audit.service';
import { ResendEmailService } from '../auth/resend-email.service';
import { StaffAuthService } from '../auth/staff-auth.service';
import {
  AdminEditCngApplicationDto,
  RequestAdditionalInformationDto,
} from './dto/cng-application.dto';
import { DocumentStorageService } from './document-storage.service';
import { SensitiveDataService } from './sensitive-data.service';
import { CNG_REPAYMENT_FREQUENCY, cngInstallmentCount } from './cng-application.constants';

type StepUpAction = 'EDIT_APPLICATION' | 'REPLACE_DOCUMENT' | 'EXPORT_APPLICATION';

const EDITABLE_FIELDS = new Set([
  'firstName',
  'middleName',
  'lastName',
  'gender',
  'dateOfBirth',
  'maritalStatus',
  'email',
  'phone',
  'bvn',
  'nin',
  'currentlyEmployed',
  'employmentStatus',
  'employmentSector',
  'employerName',
  'occupationJobTitle',
  'monthlyIncome',
  'employmentStartDate',
  'employmentConfirmationDate',
  'address',
  'state',
  'lga',
  'nextOfKinName',
  'nextOfKinPhone',
  'nextOfKinRelationship',
  'vehicleBrand',
  'vehicleModel',
  'vehicleYear',
  'manufacturingDate',
  'vehicleColor',
  'mileage',
  'fuelSystem',
  'engineType',
  'licensePlate',
  'chassisNumber',
  'engineNumber',
  'packageId',
  'financingPlanId',
  'preferredLoanTenor',
  'packagePriceNgn',
  'depositAmountNgn',
  'financedAmountNgn',
  'interestAmountNgn',
  'weeklyPaymentNgn',
  'totalCostNgn',
]);

const DATE_FIELDS = new Set([
  'dateOfBirth',
  'employmentStartDate',
  'employmentConfirmationDate',
  'manufacturingDate',
]);
const NUMBER_FIELDS = new Set([
  'vehicleYear',
  'preferredLoanTenor',
  'packagePriceNgn',
  'depositAmountNgn',
  'financedAmountNgn',
  'interestAmountNgn',
  'weeklyPaymentNgn',
  'totalCostNgn',
]);
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

@Injectable()
export class CngApplicationOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly sensitive: SensitiveDataService,
    private readonly audit: AuditService,
    private readonly email: ResendEmailService,
    private readonly config: ConfigService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @Cron('17 * * * *')
  async removeExpiredExports() {
    const expired = await this.prisma.cngApplicationExport.findMany({
      where: { expiresAt: { lt: new Date() } },
      take: 100,
    });
    for (const item of expired) {
      await this.storage.deleteObject(item.storageKey);
      await this.prisma.cngApplicationExport.delete({ where: { id: item.id } });
    }
  }

  async requestInformation(
    applicationId: string,
    dto: RequestAdditionalInformationDto,
    actorId: string,
    context: AuditContext,
  ) {
    if (!dto.allowText && !dto.allowDocuments) {
      throw new BadRequestException('Select at least one answer type');
    }
    const app = await this.prisma.cngApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('CNG application not found');
    if (!app.email) throw new ConflictException('Application has no customer email address');
    const request = await this.prisma.cngAdditionalInformationRequest.create({
      data: {
        applicationId,
        question: dto.question.trim(),
        allowText: dto.allowText,
        allowDocuments: dto.allowDocuments,
        requestedBy: actorId,
      },
      include: { responses: { include: { documents: true } } },
    });
    await this.audit.create(context, {
      action: 'cng.additional_information_requested',
      targetType: 'cng_application',
      targetId: applicationId,
      sensitivity: AuditSensitivity.SENSITIVE,
      afterSummary: {
        requestId: request.id,
        allowText: dto.allowText,
        allowDocuments: dto.allowDocuments,
      },
    });
    const dashboardBase = this.config.get<string>(
      'CHRGE_FRONTEND_URL',
      'https://chrge-frontend-staging.vercel.app',
    );
    await this.email
      .sendCngAdditionalInformationRequest({
        to: app.email,
        requestId: request.id,
        reference: app.reference,
        question: request.question,
        responseType:
          dto.allowText && dto.allowDocuments
            ? 'Text and documents'
            : dto.allowText
              ? 'Text'
              : 'Documents',
        dashboardUrl: `${dashboardBase}/cng/dashboard/${app.id}?tab=additional-information`,
      })
      .catch(() => undefined);
    return request;
  }

  async reopenInformationRequest(applicationId: string, requestId: string, context: AuditContext) {
    const request = await this.prisma.cngAdditionalInformationRequest.findFirst({
      where: { id: requestId, applicationId },
    });
    if (!request) throw new NotFoundException('Additional information request not found');
    const updated = await this.prisma.cngAdditionalInformationRequest.update({
      where: { id: requestId },
      data: { status: 'REOPENED', reopenedAt: new Date(), respondedAt: null },
      include: { responses: { include: { documents: true }, orderBy: { submittedAt: 'desc' } } },
    });
    await this.audit.create(context, {
      action: 'cng.additional_information_reopened',
      targetType: 'cng_application',
      targetId: applicationId,
      sensitivity: AuditSensitivity.SENSITIVE,
      metadata: { requestId },
    });
    return updated;
  }

  async listCustomerRequests(applicationId: string) {
    const requests = await this.prisma.cngAdditionalInformationRequest.findMany({
      where: { applicationId, status: { not: 'CANCELLED' } },
      include: { responses: { include: { documents: true }, orderBy: { submittedAt: 'desc' } } },
      orderBy: { requestedAt: 'desc' },
    });
    return requests.map((request) => this.safeRequest(request));
  }

  async submitInformationResponse(
    applicationId: string,
    requestId: string,
    userId: string,
    textAnswer: string | undefined,
    files: Express.Multer.File[],
  ) {
    const request = await this.prisma.cngAdditionalInformationRequest.findFirst({
      where: { id: requestId, applicationId },
      include: { application: true },
    });
    if (!request) throw new NotFoundException('Additional information request not found');
    if (request.application.userId !== userId)
      throw new ForbiddenException('Application access denied');
    if (!['AWAITING_RESPONSE', 'REOPENED'].includes(request.status))
      throw new ConflictException('This request is not open');
    const answer = textAnswer?.trim();
    if (request.allowText && !answer) throw new BadRequestException('A text answer is required');
    if (!request.allowText && answer)
      throw new BadRequestException('This request does not accept text');
    if (request.allowDocuments && files.length === 0)
      throw new BadRequestException('At least one document is required');
    if (!request.allowDocuments && files.length > 0)
      throw new BadRequestException('This request does not accept documents');
    if (files.length > 10) throw new BadRequestException('A maximum of 10 documents is allowed');
    for (const file of files) this.validateFile(file);

    const stored: Array<{ file: Express.Multer.File; storageKey: string; checksum: string }> = [];
    try {
      for (const file of files) {
        const extension =
          file.mimetype === 'application/pdf'
            ? '.pdf'
            : file.mimetype === 'image/png'
              ? '.png'
              : '.jpg';
        const storageKey = `${applicationId}/additional-information/${requestId}/${randomUUID()}${extension}`;
        await this.storage.putObject(storageKey, file.buffer, file.mimetype);
        stored.push({
          file,
          storageKey,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
        });
      }
      const signatureOnly =
        process.env.CHRGE_ENV === 'staging' &&
        process.env.CNG_DOCUMENT_SCAN_MODE === 'signature-only';
      const response = await this.prisma.$transaction(async (tx) => {
        const created = await tx.cngAdditionalInformationResponse.create({
          data: {
            requestId,
            userId,
            textAnswer: answer || null,
            documents: {
              create: stored.map(({ file, storageKey, checksum }) => ({
                originalName: basename(file.originalname),
                storageKey,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                checksumSha256: checksum,
                scanStatus: signatureOnly ? DocumentScanStatus.CLEAN : DocumentScanStatus.PENDING,
                scannedAt: signatureOnly ? new Date() : null,
                scannerVersion: signatureOnly ? 'signature-only-v1' : null,
              })),
            },
          },
          include: { documents: true },
        });
        await tx.cngAdditionalInformationRequest.update({
          where: { id: requestId },
          data: { status: 'SUBMITTED', respondedAt: new Date() },
        });
        return created;
      });
      const adminEmail = this.config.get<string>('CNG_TEAM_NOTIFICATION_EMAIL', 'team@gochrge.com');
      const adminBase = this.config.get<string>(
        'ADMIN_PORTAL_URL',
        'https://chrge-admin-staging.vercel.app',
      );
      await this.email
        .sendCngAdditionalInformationResponse({
          to: adminEmail,
          responseId: response.id,
          reference: request.application.reference,
          customerName:
            [request.application.firstName, request.application.lastName]
              .filter(Boolean)
              .join(' ') || 'Customer',
          responseType:
            answer && files.length ? 'Text and documents' : answer ? 'Text' : 'Documents',
          adminUrl: `${adminBase}/cng-applications/${applicationId}`,
        })
        .catch(() => undefined);
      return {
        id: response.id,
        requestId: response.requestId,
        textAnswer: response.textAnswer,
        submittedAt: response.submittedAt,
        documents: response.documents.map((document) => ({
          id: document.id,
          originalName: document.originalName,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          scanStatus: document.scanStatus,
          uploadedAt: document.uploadedAt,
        })),
      };
    } catch (error) {
      await Promise.all(stored.map((item) => this.storage.deleteObject(item.storageKey)));
      throw error;
    }
  }

  async editApplication(
    applicationId: string,
    dto: AdminEditCngApplicationDto,
    actor: { id: string; role: string },
    context: AuditContext,
  ) {
    await this.staffAuth.consumeStepUp(
      dto.stepUpToken,
      actor.id,
      'EDIT_APPLICATION',
      applicationId,
    );
    const app = await this.prisma.cngApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('CNG application not found');
    const keys = Object.keys(dto.changes);
    if (!keys.length || keys.some((key) => !EDITABLE_FIELDS.has(key)))
      throw new BadRequestException('One or more fields cannot be edited');
    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of keys) {
      const raw = dto.changes[key];
      if (key === 'bvn' || key === 'nin') {
        const value = String(raw ?? '');
        if (!/^\d{11}$/.test(value))
          throw new BadRequestException(`${key} must contain exactly 11 digits`);
        data[`${key}Encrypted`] = this.sensitive.encrypt(value);
        data[`${key}Hash`] = this.sensitive.hash(value);
        data[`${key}Last4`] = value.slice(-4);
        before[key] = `*******${(app as unknown as Record<string, unknown>)[`${key}Last4`] ?? ''}`;
        after[key] = `*******${value.slice(-4)}`;
      } else {
        const current = (app as unknown as Record<string, unknown>)[key];
        let value: unknown = raw === '' ? null : raw;
        if (value != null && DATE_FIELDS.has(key)) value = new Date(String(value));
        if (value != null && NUMBER_FIELDS.has(key)) value = Number(value);
        if (typeof current === 'boolean') value = value === true || value === 'true';
        if (value instanceof Date && Number.isNaN(value.getTime()))
          throw new BadRequestException(`${key} must be a valid date`);
        if (NUMBER_FIELDS.has(key) && value != null && !Number.isFinite(value))
          throw new BadRequestException(`${key} must be a valid number`);
        data[key] = value;
        before[key] = this.jsonValue(current);
        after[key] = this.jsonValue(value);
      }
    }
    const revisionId = randomUUID();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.cngApplication.update({
        where: { id: applicationId },
        data: data as Prisma.CngApplicationUncheckedUpdateInput,
      });
      await tx.cngApplicationRevision.create({
        data: {
          id: revisionId,
          applicationId,
          actorId: actor.id,
          actorRole: actor.role,
          reason: dto.reason.trim(),
          changedFields: keys,
          beforeValues: before as Prisma.InputJsonValue,
          afterValues: after as Prisma.InputJsonValue,
        },
      });
      return result;
    });
    await this.audit.create(context, {
      action: 'cng.application_edited',
      targetType: 'cng_application',
      targetId: applicationId,
      reason: dto.reason,
      sensitivity: AuditSensitivity.RESTRICTED,
      beforeSummary: before as Prisma.InputJsonValue,
      afterSummary: after as Prisma.InputJsonValue,
    });
    if (updated.email)
      await this.notifyUpdated(
        updated.email,
        revisionId,
        updated.reference,
        'admin',
        keys,
        applicationId,
      );
    return { updated: true, revisionId, changedFields: keys };
  }

  async replaceDocument(
    applicationId: string,
    documentId: string,
    file: Express.Multer.File,
    reason: string,
    stepUpToken: string,
    actor: { id: string; role: string },
    context: AuditContext,
  ) {
    await this.staffAuth.consumeStepUp(stepUpToken, actor.id, 'REPLACE_DOCUMENT', applicationId);
    if (!reason?.trim()) throw new BadRequestException('A replacement reason is required');
    this.validateFile(file);
    const existing = await this.prisma.cngApplicationDocument.findFirst({
      where: { id: documentId, applicationId },
      include: { application: true },
    });
    if (!existing) throw new NotFoundException('Application document not found');
    const versionCount = await this.prisma.cngApplicationDocumentVersion.count({
      where: { documentId },
    });
    const extension =
      file.mimetype === 'application/pdf'
        ? '.pdf'
        : file.mimetype === 'image/png'
          ? '.png'
          : '.jpg';
    const storageKey = `${applicationId}/replacements/${randomUUID()}${extension}`;
    await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    const signatureOnly =
      process.env.CHRGE_ENV === 'staging' &&
      process.env.CNG_DOCUMENT_SCAN_MODE === 'signature-only';
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.cngApplicationDocumentVersion.create({
          data: {
            applicationId,
            documentId,
            version: versionCount + 1,
            originalName: existing.originalName,
            storageKey: existing.storageKey,
            mimeType: existing.mimeType,
            sizeBytes: existing.sizeBytes,
            checksumSha256: existing.checksumSha256,
            scanStatus: existing.scanStatus,
            uploadedAt: existing.uploadedAt,
            replacedBy: actor.id,
            reason: reason.trim(),
          },
        });
        await tx.cngApplicationDocument.update({
          where: { id: documentId },
          data: {
            originalName: basename(file.originalname),
            storageKey,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            checksumSha256: checksum,
            uploadedAt: new Date(),
            scanStatus: signatureOnly ? DocumentScanStatus.CLEAN : DocumentScanStatus.PENDING,
            scannedAt: signatureOnly ? new Date() : null,
            scannerVersion: signatureOnly ? 'signature-only-v1' : null,
          },
        });
      });
    } catch (error) {
      await this.storage.deleteObject(storageKey);
      throw error;
    }
    await this.audit.create(context, {
      action: 'cng.document_replaced',
      targetType: 'cng_document',
      targetId: documentId,
      reason,
      sensitivity: AuditSensitivity.RESTRICTED,
      metadata: {
        applicationId,
        previousChecksum: existing.checksumSha256,
        replacementChecksum: checksum,
      },
    });
    if (existing.application.email)
      await this.notifyUpdated(
        existing.application.email,
        randomUUID(),
        existing.application.reference,
        'admin',
        [`document:${existing.type}`],
        applicationId,
      );
    return { replaced: true, documentId, scanStatus: signatureOnly ? 'CLEAN' : 'PENDING' };
  }

  async exportApplication(
    applicationId: string,
    stepUpToken: string,
    reason: string,
    actorId: string,
    context: AuditContext,
  ) {
    await this.staffAuth.consumeStepUp(stepUpToken, actorId, 'EXPORT_APPLICATION', applicationId);
    const app = await this.prisma.cngApplication.findUnique({
      where: { id: applicationId },
      include: {
        documents: true,
        installments: { orderBy: { number: 'asc' } },
        reviewNotes: { orderBy: { createdAt: 'asc' } },
        additionalInformationRequests: {
          include: { responses: { include: { documents: true }, orderBy: { submittedAt: 'asc' } } },
          orderBy: { requestedAt: 'asc' },
        },
      },
    });
    if (!app) throw new NotFoundException('CNG application not found');
    const allDocuments = [
      ...app.documents,
      ...app.additionalInformationRequests.flatMap((request) =>
        request.responses.flatMap((response) => response.documents),
      ),
    ];
    const uncleared = allDocuments.filter((document) => document.scanStatus !== 'CLEAN');
    if (uncleared.length)
      throw new ConflictException(
        `${uncleared.length} document(s) have not passed security scanning`,
      );
    const password = this.generatePdfPassword();
    const assembled = await this.buildApplicationPdf(app);
    const protectedPdf = await this.passwordProtect(assembled, password);
    const exportId = randomUUID();
    const filename = `${app.reference}-complete-application.pdf`;
    const storageKey = `${applicationId}/exports/${exportId}.pdf`;
    await this.storage.putObject(storageKey, protectedPdf, 'application/pdf');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.cngApplicationExport.create({
      data: {
        id: exportId,
        applicationId,
        createdBy: actorId,
        storageKey,
        filename,
        sizeBytes: protectedPdf.length,
        snapshotHash: createHash('sha256').update(protectedPdf).digest('hex'),
        expiresAt,
      },
    });
    await this.audit.create(context, {
      action: 'cng.application_pdf_generated',
      targetType: 'cng_application',
      targetId: applicationId,
      reason,
      sensitivity: AuditSensitivity.RESTRICTED,
      metadata: {
        exportId,
        includesFullBvnAndNin: true,
        includesInternalNotes: true,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return {
      exportId,
      filename,
      password,
      expiresAt,
      downloadUrl: `/api/admin/cng-applications/${applicationId}/exports/${exportId}/download`,
    };
  }

  async downloadExport(
    applicationId: string,
    exportId: string,
    actorId: string,
    context: AuditContext,
  ) {
    const record = await this.prisma.cngApplicationExport.findFirst({
      where: { id: exportId, applicationId, expiresAt: { gt: new Date() } },
    });
    if (!record) throw new NotFoundException('Export not found or expired');
    await this.audit.create(context, {
      action: 'cng.application_pdf_downloaded',
      targetType: 'cng_application_export',
      targetId: exportId,
      sensitivity: AuditSensitivity.RESTRICTED,
      metadata: { applicationId, actorId },
    });
    return { record, stream: await this.storage.getObject(record.storageKey) };
  }

  async downloadAdditionalDocument(
    applicationId: string,
    documentId: string,
    mfaAt: number | undefined,
    context: AuditContext,
  ) {
    if (!mfaAt || Date.now() / 1000 - mfaAt > 300)
      throw new ForbiddenException('Fresh step-up authentication is required');
    const document = await this.prisma.cngAdditionalInformationDocument.findFirst({
      where: { id: documentId, response: { request: { applicationId } } },
    });
    if (!document) throw new NotFoundException('Additional-information document not found');
    if (document.scanStatus !== 'CLEAN')
      throw new ForbiddenException('Document is not cleared for review');
    await this.audit.create(context, {
      action: 'cng.additional_information_document_download',
      targetType: 'cng_additional_information_document',
      targetId: document.id,
      sensitivity: AuditSensitivity.RESTRICTED,
      metadata: { applicationId },
    });
    return { document, stream: await this.storage.getObject(document.storageKey) };
  }

  private async notifyUpdated(
    to: string,
    id: string,
    reference: string,
    updatedBy: 'customer' | 'admin',
    fields: string[],
    applicationId: string,
  ) {
    const base = this.config.get<string>(
      'CHRGE_FRONTEND_URL',
      'https://chrge-frontend-staging.vercel.app',
    );
    await this.email
      .sendCngApplicationUpdated({
        to,
        notificationId: id,
        reference,
        updatedBy,
        changedFields: fields,
        dashboardUrl: `${base}/cng/dashboard/${applicationId}`,
      })
      .catch(() => undefined);
  }

  private safeRequest(request: any) {
    return {
      id: request.id,
      question: request.question,
      allowText: request.allowText,
      allowDocuments: request.allowDocuments,
      status: request.status,
      requestedAt: request.requestedAt,
      respondedAt: request.respondedAt,
      reopenedAt: request.reopenedAt,
      responses: request.responses.map((response: any) => ({
        id: response.id,
        textAnswer: response.textAnswer,
        submittedAt: response.submittedAt,
        documents: response.documents.map((document: any) => ({
          id: document.id,
          originalName: document.originalName,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          scanStatus: document.scanStatus,
          uploadedAt: document.uploadedAt,
        })),
      })),
    };
  }

  private validateFile(file: Express.Multer.File) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || file.size > 10 * 1024 * 1024)
      throw new BadRequestException('Documents must be PDF, JPEG, or PNG and no larger than 10 MB');
    const valid =
      file.mimetype === 'application/pdf'
        ? file.buffer.subarray(0, 5).toString('ascii') === '%PDF-'
        : file.mimetype === 'image/png'
          ? file.buffer
              .subarray(0, 8)
              .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
          : file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    if (!valid) throw new BadRequestException('Document contents do not match the declared format');
  }

  private jsonValue(value: unknown): string | number | boolean | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      return value;
    return String(value);
  }

  private generatePdfPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(16);
    const part = (start: number) =>
      Array.from(bytes.subarray(start, start + 4), (byte) => alphabet[byte % alphabet.length]).join(
        '',
      );
    return `CHRGE-${part(0)}-${part(4)}-${part(8)}`;
  }

  private async buildApplicationPdf(app: any): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595.28, 841.89]);
    let y = 790;
    const addPage = () => {
      page = pdf.addPage([595.28, 841.89]);
      y = 790;
    };
    const line = (label: string, value: unknown, indent = 0) => {
      const text = `${label}: ${value == null || value === '' ? '—' : value instanceof Date ? value.toISOString() : String(value)}`;
      const chunks = this.wrapText(text, 92 - indent);
      for (const chunk of chunks) {
        if (y < 55) addPage();
        page.drawText(chunk, {
          x: 45 + indent * 6,
          y,
          size: 9.5,
          font: regular,
          color: rgb(0.12, 0.16, 0.14),
        });
        y -= 14;
      }
    };
    const section = (title: string) => {
      if (y < 90) addPage();
      y -= 8;
      page.drawText(title, { x: 45, y, size: 14, font: bold, color: rgb(0.02, 0.48, 0.31) });
      y -= 22;
    };
    page.drawText('CHRGE CNG FINANCING APPLICATION', {
      x: 45,
      y,
      size: 19,
      font: bold,
      color: rgb(0.02, 0.48, 0.31),
    });
    y -= 30;
    line('Application reference', app.reference);
    line('Status', app.status);
    line('Generated at', new Date().toISOString());
    line('Classification', 'CONFIDENTIAL — contains full BVN and NIN');
    section('Applicant and identity');
    for (const [label, value] of Object.entries({
      'First name': app.firstName,
      'Middle name': app.middleName,
      'Last name': app.lastName,
      Gender: app.gender,
      'Date of birth': app.dateOfBirth,
      'Marital status': app.maritalStatus,
      Email: app.email,
      Phone: app.phone,
      BVN: app.bvnEncrypted ? this.sensitive.decrypt(app.bvnEncrypted) : null,
      NIN: app.ninEncrypted ? this.sensitive.decrypt(app.ninEncrypted) : null,
      Employed: app.currentlyEmployed,
      'Employment status': app.employmentStatus,
      'Employment sector': app.employmentSector,
      Employer: app.employerName,
      Occupation: app.occupationJobTitle,
      'Monthly income': app.monthlyIncome,
      'Employment start': app.employmentStartDate,
      'Confirmation date': app.employmentConfirmationDate,
      Address: app.address,
      State: app.state,
      LGA: app.lga,
      'Next of kin': app.nextOfKinName,
      'Next-of-kin phone': app.nextOfKinPhone,
      Relationship: app.nextOfKinRelationship,
    }))
      line(label, value);
    section('Vehicle');
    for (const [label, value] of Object.entries({
      Brand: app.vehicleBrand,
      Model: app.vehicleModel,
      Year: app.vehicleYear,
      'Manufacturing date': app.manufacturingDate,
      Colour: app.vehicleColor,
      Mileage: app.mileage,
      'Fuel system': app.fuelSystem,
      'Engine type': app.engineType,
      'Licence plate': app.licensePlate,
      'Chassis number': app.chassisNumber,
      'Engine number': app.engineNumber,
    }))
      line(label, value);
    section('Financing and workflow');
    for (const [label, value] of Object.entries({
      Package: app.packageId,
      Plan: app.financingPlanId,
      'Loan tenor (months)': app.preferredLoanTenor,
      'Repayment frequency': app.preferredLoanTenor ? CNG_REPAYMENT_FREQUENCY : null,
      'Number of installments': cngInstallmentCount(app.preferredLoanTenor),
      'Package price': app.packagePriceNgn,
      Deposit: app.depositAmountNgn,
      'Financed amount': app.financedAmountNgn,
      Interest: app.interestAmountNgn,
      'Weekly payment': app.weeklyPaymentNgn,
      'Total cost': app.totalCostNgn,
      'Consent at': app.privacyConsentAt,
      'Policy version': app.privacyPolicyVersion,
      Submitted: app.submittedAt,
      Reviewed: app.reviewedAt,
      'Inspection appointment': app.inspectionAppointmentAt,
      'Financing approved': app.financingApprovedAt,
      'Conversion appointment': app.conversionAppointmentAt,
      'Finance disbursed': app.financeDisbursedAt,
      'Conversion completed': app.conversionCompletedAt,
      'Fully paid': app.fullyPaidAt,
    }))
      line(label, value);
    section('Internal admin notes');
    line('Current review note', app.reviewNote);
    line('Rejection reason', app.rejectionReason);
    app.reviewNotes.forEach((note: any, index: number) =>
      line(`Note ${index + 1} (${note.createdAt.toISOString()})`, note.note),
    );
    section('Additional information');
    if (!app.additionalInformationRequests.length) line('Requests', 'None');
    for (const request of app.additionalInformationRequests) {
      line('Question', request.question);
      line('Status', request.status);
      line('Requested at', request.requestedAt);
      request.responses.forEach((response: any) => {
        line('Response', response.textAnswer);
        line('Submitted at', response.submittedAt);
      });
    }
    const attachments = [
      ...app.documents.map((document: any) => ({
        ...document,
        label: `Application document — ${document.type}`,
      })),
      ...app.additionalInformationRequests.flatMap((request: any) =>
        request.responses.flatMap((response: any) =>
          response.documents.map((document: any) => ({
            ...document,
            label: `Additional information — ${request.question}`,
          })),
        ),
      ),
    ];
    section('Document index');
    attachments.forEach((document: any, index: number) =>
      line(
        `${index + 1}. ${document.label}`,
        `${document.originalName} (${document.mimeType}, ${document.sizeBytes} bytes)`,
      ),
    );
    for (const [index, document] of attachments.entries()) {
      const separator = pdf.addPage([595.28, 841.89]);
      separator.drawText(`Attachment ${index + 1}`, {
        x: 45,
        y: 760,
        size: 22,
        font: bold,
        color: rgb(0.02, 0.48, 0.31),
      });
      separator.drawText(this.wrapText(document.label, 70).join('\n'), {
        x: 45,
        y: 720,
        size: 12,
        font: regular,
        lineHeight: 17,
      });
      separator.drawText(document.originalName, { x: 45, y: 665, size: 10, font: regular });
      const buffer = await this.streamToBuffer(await this.storage.getObject(document.storageKey));
      if (document.mimeType === 'application/pdf') {
        const source = await PDFDocument.load(buffer, { ignoreEncryption: false });
        const copied = await pdf.copyPages(source, source.getPageIndices());
        copied.forEach((copiedPage) => pdf.addPage(copiedPage));
      } else {
        const image =
          document.mimeType === 'image/png'
            ? await pdf.embedPng(buffer)
            : await pdf.embedJpg(buffer);
        const imagePage = pdf.addPage([595.28, 841.89]);
        const scale = Math.min(515 / image.width, 761 / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        imagePage.drawImage(image, {
          x: (595.28 - width) / 2,
          y: (841.89 - height) / 2,
          width,
          height,
        });
      }
    }
    const pages = pdf.getPages();
    pages.forEach((item, index) =>
      item.drawText(`${app.reference} · CONFIDENTIAL · Page ${index + 1} of ${pages.length}`, {
        x: 45,
        y: 24,
        size: 7.5,
        font: regular,
        color: rgb(0.45, 0.48, 0.46),
      }),
    );
    return Buffer.from(await pdf.save({ useObjectStreams: false }));
  }

  private wrapText(text: string, max: number): string[] {
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > max && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    return lines.length ? lines : ['—'];
  }

  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  private async passwordProtect(input: Buffer, password: string): Promise<Buffer> {
    const directory = await mkdtemp(join(tmpdir(), 'chrge-pdf-'));
    const source = join(directory, 'source.pdf');
    const target = join(directory, 'protected.pdf');
    try {
      await writeFile(source, input, { mode: 0o600 });
      const ownerPassword = randomBytes(32).toString('base64url');
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'qpdf',
          [
            '--encrypt',
            password,
            ownerPassword,
            '256',
            '--print=full',
            '--modify=none',
            '--extract=n',
            '--annotate=n',
            '--',
            source,
            target,
          ],
          { stdio: 'ignore' },
        );
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0 ? resolve() : reject(new Error(`qpdf exited with ${code}`)),
        );
      }).catch(() => {
        throw new ServiceUnavailableException('Secure PDF encryption is temporarily unavailable');
      });
      return await readFile(target);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
