ALTER TYPE "CngApplicationStatus" ADD VALUE IF NOT EXISTS 'INSPECTION_APPOINTMENT_BOOKED';
ALTER TYPE "CngApplicationStatus" ADD VALUE IF NOT EXISTS 'FINANCING_APPROVED';
ALTER TYPE "CngApplicationStatus" ADD VALUE IF NOT EXISTS 'CONVERSION_APPOINTMENT_BOOKED';
ALTER TYPE "CngApplicationStatus" ADD VALUE IF NOT EXISTS 'FINANCE_DISBURSED';
ALTER TYPE "CngApplicationStatus" ADD VALUE IF NOT EXISTS 'CONVERSION_COMPLETED';
ALTER TYPE "CngApplicationStatus" ADD VALUE IF NOT EXISTS 'REPAYMENT_ACTIVE';
ALTER TYPE "CngApplicationStatus" ADD VALUE IF NOT EXISTS 'FULLY_PAID';

CREATE TYPE "CngInstallmentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');

ALTER TABLE "cng_applications"
  ADD COLUMN "inspectionAppointmentAt" TIMESTAMP(3),
  ADD COLUMN "financingApprovedAt" TIMESTAMP(3),
  ADD COLUMN "conversionAppointmentAt" TIMESTAMP(3),
  ADD COLUMN "financeDisbursedAt" TIMESTAMP(3),
  ADD COLUMN "conversionCompletedAt" TIMESTAMP(3),
  ADD COLUMN "fullyPaidAt" TIMESTAMP(3);

CREATE TABLE "cng_application_review_notes" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cng_application_review_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cng_installments" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "amountNgn" INTEGER NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" "CngInstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "providerReference" TEXT,
  "webhookEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cng_installments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cng_installments_webhookEventId_key" ON "cng_installments"("webhookEventId");
CREATE UNIQUE INDEX "cng_installments_applicationId_number_key" ON "cng_installments"("applicationId", "number");
CREATE INDEX "cng_installments_applicationId_status_idx" ON "cng_installments"("applicationId", "status");
CREATE INDEX "cng_application_review_notes_applicationId_createdAt_idx" ON "cng_application_review_notes"("applicationId", "createdAt");

ALTER TABLE "cng_application_review_notes" ADD CONSTRAINT "cng_application_review_notes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cng_installments" ADD CONSTRAINT "cng_installments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
