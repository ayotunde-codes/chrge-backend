ALTER TYPE "StationStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';
ALTER TYPE "StationStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

DO $$
BEGIN
  CREATE TYPE "AuditSensitivity" AS ENUM ('STANDARD', 'SENSITIVE', 'RESTRICTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "reviewReason" TEXT;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "changesRequestedAt" TIMESTAMP(3);
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "submissionRevision" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "stations_status_isActive_createdAt_idx" ON "stations"("status", "isActive", "createdAt");
CREATE INDEX IF NOT EXISTS "stations_submittedBy_createdAt_idx" ON "stations"("submittedBy", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stations_reviewedBy_fkey') THEN
    ALTER TABLE "stations" ADD CONSTRAINT "stations_reviewedBy_fkey"
      FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "audit_events" (
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

CREATE INDEX IF NOT EXISTS "audit_events_occurredAt_idx" ON "audit_events"("occurredAt");
CREATE INDEX IF NOT EXISTS "audit_events_actorId_occurredAt_idx" ON "audit_events"("actorId", "occurredAt");
CREATE INDEX IF NOT EXISTS "audit_events_targetType_targetId_occurredAt_idx" ON "audit_events"("targetType", "targetId", "occurredAt");
CREATE INDEX IF NOT EXISTS "audit_events_action_occurredAt_idx" ON "audit_events"("action", "occurredAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_events_actorId_fkey') THEN
    ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stations_publication_invariant') THEN
    ALTER TABLE "stations" ADD CONSTRAINT "stations_publication_invariant"
      CHECK (NOT "isActive" OR status = 'APPROVED');
  END IF;
END $$;

-- Defense in depth: the application never updates or deletes audit events. Grant the
-- runtime role INSERT/SELECT only in each environment as part of deployment.
