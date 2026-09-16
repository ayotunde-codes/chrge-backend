import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditSensitivity, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentStorageService } from './document-storage.service';

@Injectable()
export class AdminCngReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly audit: AuditService,
  ) {}
  private mask(value: string | null, visible = 4) {
    return value
      ? `${'•'.repeat(Math.max(4, value.length - visible))}${value.slice(-visible)}`
      : null;
  }
  private maskEmail(email: string | null) {
    if (!email) return null;
    const [name, domain] = email.split('@');
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
  }

  async detail(
    id: string,
    context: {
      actorId: string;
      actorRole: UserRole;
      requestId: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    const app = await this.prisma.cngApplication.findUnique({
      where: { id },
      include: { documents: true },
    });
    if (!app) throw new NotFoundException('CNG application not found');
    await this.audit.create(context, {
      action: 'cng.application_read',
      targetType: 'cng_application',
      targetId: id,
      sensitivity: AuditSensitivity.SENSITIVE,
    });
    return {
      id: app.id,
      reference: app.reference,
      status: app.status,
      applicant: {
        name: [app.firstName, app.lastName]
          .filter(Boolean)
          .map((v) => `${v?.slice(0, 1)}•••`)
          .join(' '),
        email: this.maskEmail(app.email),
        phone: this.mask(app.phone),
        bvnMasked: app.bvnLast4 ? `•••••••${app.bvnLast4}` : null,
        ninMasked: app.ninLast4 ? `•••••••${app.ninLast4}` : null,
        state: app.state,
      },
      vehicle: {
        brand: app.vehicleBrand,
        model: app.vehicleModel,
        year: app.vehicleYear,
        licensePlate: this.mask(app.licensePlate),
        chassisNumber: this.mask(app.chassisNumber),
        engineNumber: this.mask(app.engineNumber),
      },
      financing: {
        packageId: app.packageId,
        financingPlanId: app.financingPlanId,
        preferredLoanTenor: app.preferredLoanTenor,
        monthlyIncome: app.monthlyIncome ? 'Provided — restricted' : null,
      },
      documents: app.documents.map((d) => ({
        id: d.id,
        type: d.type,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        scanStatus: d.scanStatus,
        uploadedAt: d.uploadedAt,
      })),
      submittedAt: app.submittedAt,
      reviewedAt: app.reviewedAt,
      reviewNote: app.reviewNote,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  async document(
    applicationId: string,
    documentId: string,
    context: {
      actorId: string;
      actorRole: UserRole;
      requestId: string;
      ipAddress?: string;
      userAgent?: string;
    },
    mfaAt?: number,
  ) {
    if (!mfaAt || Date.now() / 1000 - mfaAt > 300)
      throw new ForbiddenException('Fresh step-up authentication is required');
    const doc = await this.prisma.cngApplicationDocument.findFirst({
      where: { id: documentId, applicationId },
    });
    if (!doc) throw new NotFoundException('Application document not found');
    if (doc.scanStatus !== 'CLEAN')
      throw new ForbiddenException('Document is not cleared for review');
    await this.audit.create(context, {
      action: 'cng.document_download',
      targetType: 'cng_document',
      targetId: doc.id,
      sensitivity: AuditSensitivity.RESTRICTED,
      metadata: { applicationId, documentType: doc.type },
    });
    return { document: doc, stream: await this.storage.getObject(doc.storageKey) };
  }
}
