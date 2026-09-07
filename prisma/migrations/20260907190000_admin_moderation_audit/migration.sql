ALTER TYPE "StationStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';
ALTER TYPE "StationStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

CREATE TYPE "AuditSensitivity" AS ENUM ('STANDARD', 'SENSITIVE', 'RESTRICTED');

ALTER TABLE "stations"
  ADD COLUMN "reviewReason" TEXT,
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "changesRequestedAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "submissionRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "submissionKey" TEXT;

CREATE UNIQUE INDEX "stations_submissionKey_key" ON "stations"("submissionKey");
CREATE INDEX "stations_status_isActive_createdAt_idx" ON "stations"("status", "isActive", "createdAt");
CREATE INDEX "stations_submittedBy_createdAt_idx" ON "stations"("submittedBy", "createdAt");

ALTER TABLE "stations" ADD CONSTRAINT "stations_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "actorRole" "UserRole",
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "reason" TEXT,
  "requestId" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "sensitivity" "AuditSensitivity" NOT NULL DEFAULT 'STANDARD',
  "beforeSummary" JSONB,
  "afterSummary" JSONB,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_events_occurredAt_idx" ON "audit_events"("occurredAt");
CREATE INDEX "audit_events_actorId_occurredAt_idx" ON "audit_events"("actorId", "occurredAt");
CREATE INDEX "audit_events_targetType_targetId_occurredAt_idx" ON "audit_events"("targetType", "targetId", "occurredAt");
CREATE INDEX "audit_events_action_occurredAt_idx" ON "audit_events"("action", "occurredAt");

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stations" ADD CONSTRAINT "stations_publication_invariant"
  CHECK (NOT "isActive" OR status = 'APPROVED');

-- Defense in depth: the application never updates or deletes audit events. Grant the
-- runtime role INSERT/SELECT only in each environment as part of deployment.
