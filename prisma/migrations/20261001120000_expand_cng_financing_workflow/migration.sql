ALTER TYPE "CngApplicationStatus" ADD VALUE IF NOT EXISTS 'AWAITING_DEPOSIT';
ALTER TYPE "CngApplicationStatus" ADD VALUE IF NOT EXISTS 'DEPOSIT_PAID';

CREATE TYPE "CngPaymentIntentKind" AS ENUM ('DEPOSIT', 'REPAYMENT');
CREATE TYPE "CngPaymentIntentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "cng_applications"
  ADD COLUMN "inspectionCenter" TEXT,
  ADD COLUMN "depositPaidAt" TIMESTAMP(3),
  ADD COLUMN "conversionCenter" TEXT;

CREATE TABLE "cng_application_workflow_events" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "status" "CngApplicationStatus" NOT NULL,
  "actorId" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "center" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cng_application_workflow_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cng_application_workflow_events_applicationId_createdAt_idx"
  ON "cng_application_workflow_events"("applicationId", "createdAt");

ALTER TABLE "cng_application_workflow_events"
  ADD CONSTRAINT "cng_application_workflow_events_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cng_application_workflow_events"
  ADD CONSTRAINT "cng_application_workflow_events_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "cng_payment_intents" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "kind" "CngPaymentIntentKind" NOT NULL,
  "status" "CngPaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
  "amountNgn" INTEGER NOT NULL,
  "installmentCount" INTEGER NOT NULL DEFAULT 0,
  "firstInstallmentNumber" INTEGER,
  "accountName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "providerReference" TEXT NOT NULL,
  "webhookEventId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cng_payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cng_payment_intents_providerReference_key" ON "cng_payment_intents"("providerReference");
CREATE UNIQUE INDEX "cng_payment_intents_webhookEventId_key" ON "cng_payment_intents"("webhookEventId");
CREATE INDEX "cng_payment_intents_applicationId_status_createdAt_idx"
  ON "cng_payment_intents"("applicationId", "status", "createdAt");

ALTER TABLE "cng_payment_intents"
  ADD CONSTRAINT "cng_payment_intents_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "cng_application_workflow_events" ("id", "applicationId", "status", "scheduledAt", "center", "createdAt")
SELECT application."id" || '-initial-workflow', application."id", application."status",
  CASE
    WHEN application."status" = 'INSPECTION_APPOINTMENT_BOOKED' THEN application."inspectionAppointmentAt"
    WHEN application."status" = 'CONVERSION_APPOINTMENT_BOOKED' THEN application."conversionAppointmentAt"
    ELSE NULL
  END,
  NULL,
  COALESCE(application."updatedAt", application."createdAt")
FROM "cng_applications" application;
