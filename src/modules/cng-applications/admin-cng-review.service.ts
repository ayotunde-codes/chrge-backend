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
      include: {
        documents: true,
        installments: { orderBy: { number: 'asc' } },
        reviewNotes: { orderBy: { createdAt: 'asc' } },
      },
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
        repaymentTenure: app.preferredLoanTenor,
        packagePriceNgn: app.packagePriceNgn,
        depositAmountNgn: app.depositAmountNgn,
        financedAmountNgn: app.financedAmountNgn,
        interestAmountNgn: app.interestAmountNgn,
        monthlyPaymentNgn: app.monthlyPaymentNgn,
        totalCostNgn: app.totalCostNgn,
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
      reviewNotes: app.reviewNotes.map((note) => ({
        id: note.id,
        authorId: note.authorId,
        note: note.note,
        createdAt: note.createdAt,
      })),
      rejectionReason: app.rejectionReason,
      workflow: {
        inspectionAppointmentAt: app.inspectionAppointmentAt,
        financingApprovedAt: app.financingApprovedAt,
        conversionAppointmentAt: app.conversionAppointmentAt,
        financeDisbursedAt: app.financeDisbursedAt,
        conversionCompletedAt: app.conversionCompletedAt,
        fullyPaidAt: app.fullyPaidAt,
        installments: app.installments.map((installment) => ({
          number: installment.number,
          amountNgn: installment.amountNgn,
          dueAt: installment.dueAt,
          status: installment.status,
          paidAt: installment.paidAt,
        })),
      },
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
