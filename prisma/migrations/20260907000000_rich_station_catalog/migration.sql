ALTER TABLE "stations"
  ADD COLUMN "operatorName" TEXT,
  ADD COLUMN "serviceType" TEXT,
  ADD COLUMN "locationAccuracy" TEXT,
  ADD COLUMN "navigationReady" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "priceNote" TEXT,
  ADD COLUMN "openingHoursNote" TEXT,
  ADD COLUMN "accessNotes" TEXT,
  ADD COLUMN "operationalStatus" TEXT,
  ADD COLUMN "verificationTier" TEXT,
  ADD COLUMN "verificationConfidence" DOUBLE PRECISION,
  ADD COLUMN "verificationBasis" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "sourceLinks" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "researchMetadata" JSONB;

ALTER TABLE "ports" ALTER COLUMN "powerKw" DROP NOT NULL;

CREATE INDEX "stations_verificationTier_idx" ON "stations"("verificationTier");
CREATE INDEX "stations_navigationReady_idx" ON "stations"("navigationReady");
