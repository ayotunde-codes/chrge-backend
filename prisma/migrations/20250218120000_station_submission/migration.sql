-- CreateEnum
CREATE TYPE "StationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "stations"
  ADD COLUMN "status" "StationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "submittedBy" TEXT,
  ADD COLUMN "rejectionReason" TEXT;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_submittedBy_fkey"
  FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Update existing stations to APPROVED (they were seeded/admin-created)
UPDATE "stations" SET "status" = 'APPROVED' WHERE "status" = 'PENDING';
