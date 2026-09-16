import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditSensitivity, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentStorageService } from './document-storage.service';
import { SensitiveDataService } from './sensitive-data.service';

@Injectable()
export class AdminCngReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly audit: AuditService,
    private readonly sensitiveData: SensitiveDataService,
  ) {}

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
        name: [app.firstName, app.middleName, app.lastName].filter(Boolean).join(' '),
        email: app.email,
        phone: app.phone,
        bvn: app.bvnEncrypted ? this.sensitiveData.decrypt(app.bvnEncrypted) : null,
        nin: app.ninEncrypted ? this.sensitiveData.decrypt(app.ninEncrypted) : null,
        state: app.state,
      },
      vehicle: {
        brand: app.vehicleBrand,
        model: app.vehicleModel,
        year: app.vehicleYear,
        licensePlate: app.licensePlate,
        chassisNumber: app.chassisNumber,
        engineNumber: app.engineNumber,
      },
      financing: {
        packageId: app.packageId,
        financingPlanId: app.financingPlanId,
        preferredLoanTenor: app.preferredLoanTenor,
        monthlyIncome: app.monthlyIncome,
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
    reason: string,
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
    if (!reason || reason.trim().length < 10)
      throw new ForbiddenException('A specific access reason is required');
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
      reason,
      sensitivity: AuditSensitivity.RESTRICTED,
      metadata: { applicationId, documentType: doc.type },
    });
    return { document: doc, stream: await this.storage.getObject(doc.storageKey) };
  }
}
