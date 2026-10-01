CREATE TYPE "DocumentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'QUARANTINED', 'FAILED');
ALTER TABLE "cng_application_documents" ADD COLUMN "scanStatus" "DocumentScanStatus" NOT NULL DEFAULT 'PENDING', ADD COLUMN "scannedAt" TIMESTAMP(3), ADD COLUMN "scannerVersion" TEXT;
