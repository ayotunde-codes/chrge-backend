-- Add station-level fuel/discovery type support.
CREATE TYPE "StationType" AS ENUM ('EV', 'CNG', 'HYBRID');

ALTER TABLE "stations"
  ADD COLUMN "stationType" "StationType" NOT NULL DEFAULT 'EV',
  ADD COLUMN "cngDetails" JSONB;

CREATE INDEX "stations_stationType_idx" ON "stations"("stationType");
