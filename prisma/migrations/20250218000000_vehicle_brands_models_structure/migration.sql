-- CreateEnum
CREATE TYPE "PowertrainType" AS ENUM ('BEV', 'PHEV', 'EREV');

-- Add TYPE_2 to ConnectorType using rename+recreate (works inside a transaction, unlike ADD VALUE)
ALTER TYPE "ConnectorType" RENAME TO "ConnectorType_old";
CREATE TYPE "ConnectorType" AS ENUM ('CCS1', 'CCS2', 'CHADEMO', 'TESLA', 'J1772', 'TYPE_2', 'TYPE2', 'NACS', 'GB_T');

-- Re-bind columns that use ConnectorType
ALTER TABLE "vehicle_models" ALTER COLUMN "connectorType" TYPE "ConnectorType" USING "connectorType"::text::"ConnectorType";
ALTER TABLE "ports" ALTER COLUMN "connectorType" TYPE "ConnectorType" USING "connectorType"::text::"ConnectorType";

-- Drop old type
DROP TYPE "ConnectorType_old";

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
