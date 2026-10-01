CREATE TYPE "CngAvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'UNKNOWN', 'TEMPORARILY_DISABLED');
CREATE TYPE "StationAssociationRole" AS ENUM ('EMPLOYEE', 'MANAGER');
CREATE TYPE "StationAssociationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "StationConditionSource" AS ENUM ('STATION_PORTAL', 'ADMIN');
CREATE TYPE "CngNotificationKind" AS ENUM ('FAVORITE_STATION_AVAILABLE', 'NETWORK_DIGEST');
CREATE TYPE "CngNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

ALTER TABLE "stations"
ADD COLUMN "currentCngAvailability" "CngAvailabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "currentQueueLength" INTEGER,
ADD COLUMN "currentPressureBar" DECIMAL(6,2),
ADD COLUMN "cngStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN "cngStatusUpdatedBy" TEXT;

ALTER TABLE "stations"
ADD CONSTRAINT "stations_currentQueueLength_check" CHECK ("currentQueueLength" IS NULL OR "currentQueueLength" >= 0),
ADD CONSTRAINT "stations_currentPressureBar_check" CHECK ("currentPressureBar" IS NULL OR ("currentPressureBar" >= 0 AND "currentPressureBar" <= 400));

CREATE TABLE "station_associations" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StationAssociationRole" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "StationAssociationStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "station_associations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "station_condition_reports" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "availability" "CngAvailabilityStatus" NOT NULL,
    "estimatedQueueLength" INTEGER NOT NULL,
    "pumpPressureBar" DECIMAL(6,2) NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "source" "StationConditionSource" NOT NULL DEFAULT 'STATION_PORTAL',
    "idempotencyKey" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "station_condition_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "station_condition_reports_queue_check" CHECK ("estimatedQueueLength" >= 0),
    CONSTRAINT "station_condition_reports_pressure_check" CHECK ("pumpPressureBar" >= 0 AND "pumpPressureBar" <= 400)
);

CREATE TABLE "station_availability_events" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "status" "CngAvailabilityStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "updatedBy" TEXT NOT NULL,
    "source" "StationConditionSource" NOT NULL DEFAULT 'STATION_PORTAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "station_availability_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cng_notification_events" (
    "id" TEXT NOT NULL,
    "conditionReportId" TEXT,
    "kind" "CngNotificationKind" NOT NULL,
    "recipientScope" TEXT NOT NULL,
    "status" "CngNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "deduplicationKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cng_notification_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "station_associations_stationId_userId_key" ON "station_associations"("stationId", "userId");
CREATE INDEX "station_associations_userId_status_idx" ON "station_associations"("userId", "status");
CREATE INDEX "station_associations_stationId_status_idx" ON "station_associations"("stationId", "status");
CREATE UNIQUE INDEX "station_condition_reports_reportedBy_idempotencyKey_key" ON "station_condition_reports"("reportedBy", "idempotencyKey");
CREATE INDEX "station_condition_reports_stationId_reportedAt_idx" ON "station_condition_reports"("stationId", "reportedAt" DESC);
CREATE INDEX "station_availability_events_stationId_startedAt_idx" ON "station_availability_events"("stationId", "startedAt" DESC);
CREATE INDEX "station_availability_events_stationId_endedAt_idx" ON "station_availability_events"("stationId", "endedAt");
CREATE UNIQUE INDEX "station_availability_events_one_open_per_station" ON "station_availability_events"("stationId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "cng_notification_events_deduplicationKey_key" ON "cng_notification_events"("deduplicationKey");
CREATE INDEX "cng_notification_events_status_createdAt_idx" ON "cng_notification_events"("status", "createdAt");
CREATE INDEX "cng_notification_events_conditionReportId_idx" ON "cng_notification_events"("conditionReportId");

ALTER TABLE "station_associations" ADD CONSTRAINT "station_associations_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "station_associations" ADD CONSTRAINT "station_associations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "station_associations" ADD CONSTRAINT "station_associations_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "station_condition_reports" ADD CONSTRAINT "station_condition_reports_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "station_condition_reports" ADD CONSTRAINT "station_condition_reports_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "station_availability_events" ADD CONSTRAINT "station_availability_events_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "station_availability_events" ADD CONSTRAINT "station_availability_events_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cng_notification_events" ADD CONSTRAINT "cng_notification_events_conditionReportId_fkey" FOREIGN KEY ("conditionReportId") REFERENCES "station_condition_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
