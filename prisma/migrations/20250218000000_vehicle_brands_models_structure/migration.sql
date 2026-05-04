-- CreateEnum
CREATE TYPE "PowertrainType" AS ENUM ('BEV', 'PHEV', 'EREV');

-- Add TYPE_2 to ConnectorType (for frontend alignment)
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction in PostgreSQL,
-- so we commit the current transaction first, add the value, then continue.
COMMIT;
ALTER TYPE "ConnectorType" ADD VALUE IF NOT EXISTS 'TYPE_2';
BEGIN;

-- AlterTable vehicle_brands: add darkLogo
ALTER TABLE "vehicle_brands" ADD COLUMN "darkLogo" BOOLEAN DEFAULT false;

-- AlterTable vehicle_models: add powertrain, connectors; make connectorType optional; unique constraint
ALTER TABLE "vehicle_models" ADD COLUMN "powertrain" "PowertrainType";
ALTER TABLE "vehicle_models" ADD COLUMN "connectors" JSONB;

-- Backfill: set powertrain to BEV and connectors from connectorType for existing rows
UPDATE "vehicle_models" SET "powertrain" = 'BEV', "connectors" = jsonb_build_array("connectorType"::text) WHERE "powertrain" IS NULL;

-- Now make required
ALTER TABLE "vehicle_models" ALTER COLUMN "powertrain" SET NOT NULL;
ALTER TABLE "vehicle_models" ALTER COLUMN "connectors" SET NOT NULL;

-- Make connectorType optional
ALTER TABLE "vehicle_models" ALTER COLUMN "connectorType" DROP NOT NULL;

-- Drop old unique and add new (brandId, name)
ALTER TABLE "vehicle_models" DROP CONSTRAINT IF EXISTS "vehicle_models_brandId_name_year_key";
CREATE UNIQUE INDEX "vehicle_models_brandId_name_key" ON "vehicle_models"("brandId", "name");
