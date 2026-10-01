CREATE TYPE "CngFinancingConfigurationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "cng_financing_packages" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cng_financing_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cng_financing_package_versions" (
  "id" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "CngFinancingConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
  "name" TEXT NOT NULL,
  "tank" TEXT NOT NULL,
  "priceNgn" INTEGER NOT NULL,
  "createdBy" TEXT,
  "publishedBy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cng_financing_package_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cng_financing_package_terms" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "depositPct" INTEGER NOT NULL,
  "tenureMonths" INTEGER,
  "interestRateBps" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cng_financing_package_terms_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cng_applications"
  ADD COLUMN "financingConfigVersionId" TEXT,
  ADD COLUMN "packageNameSnapshot" TEXT,
  ADD COLUMN "packageTankSnapshot" TEXT,
  ADD COLUMN "financingPlanNameSnapshot" TEXT,
  ADD COLUMN "depositPctSnapshot" INTEGER,
  ADD COLUMN "interestRateBpsSnapshot" INTEGER,
  ADD COLUMN "installmentCountSnapshot" INTEGER;

CREATE UNIQUE INDEX "cng_financing_packages_code_key" ON "cng_financing_packages"("code");
CREATE INDEX "cng_financing_packages_isActive_sortOrder_idx" ON "cng_financing_packages"("isActive", "sortOrder");
CREATE UNIQUE INDEX "cng_financing_package_versions_packageId_version_key" ON "cng_financing_package_versions"("packageId", "version");
CREATE INDEX "cng_financing_package_versions_packageId_status_version_idx" ON "cng_financing_package_versions"("packageId", "status", "version");
CREATE UNIQUE INDEX "cng_financing_package_terms_versionId_planId_key" ON "cng_financing_package_terms"("versionId", "planId");
CREATE INDEX "cng_financing_package_terms_versionId_idx" ON "cng_financing_package_terms"("versionId");
CREATE INDEX "cng_applications_financingConfigVersionId_idx" ON "cng_applications"("financingConfigVersionId");

ALTER TABLE "cng_financing_package_versions" ADD CONSTRAINT "cng_financing_package_versions_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "cng_financing_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cng_financing_package_terms" ADD CONSTRAINT "cng_financing_package_terms_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "cng_financing_package_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cng_applications" ADD CONSTRAINT "cng_applications_financingConfigVersionId_fkey" FOREIGN KEY ("financingConfigVersionId") REFERENCES "cng_financing_package_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "cng_financing_packages" ("id", "code", "isActive", "sortOrder", "updatedAt") VALUES
  ('A', 'A', true, 10, CURRENT_TIMESTAMP),
  ('B', 'B', true, 20, CURRENT_TIMESTAMP),
  ('C', 'C', true, 30, CURRENT_TIMESTAMP),
  ('D', 'D', true, 40, CURRENT_TIMESTAMP);

INSERT INTO "cng_financing_package_versions" ("id", "packageId", "version", "status", "name", "tank", "priceNgn", "publishedAt", "updatedAt") VALUES
  ('A-v1', 'A', 1, 'PUBLISHED', 'Compact 65', '65 Litre Tank', 850000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('B-v1', 'B', 1, 'PUBLISHED', 'Plus 75', '75 Litre Tank', 1100000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('C-v1', 'C', 1, 'PUBLISHED', 'Extended 90', '90 Litre Tank', 1400000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('D-v1', 'D', 1, 'PUBLISHED', 'Max 100', '100 Litre Tank', 2000000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "cng_financing_package_terms" ("id", "versionId", "planId", "name", "depositPct", "tenureMonths", "interestRateBps", "updatedAt")
SELECT version."id" || '-' || term."planId", version."id", term."planId", term."name", term."depositPct", term."tenureMonths", term."interestRateBps", CURRENT_TIMESTAMP
FROM "cng_financing_package_versions" version
CROSS JOIN (VALUES
  ('full', 'Full Payment', 100, NULL::INTEGER, 0),
  ('gold', 'Gold Plan', 50, 6, 1000),
  ('silver', 'Silver Plan', 20, 10, 1500),
  ('bronze', 'Bronze Plan', 10, 12, 2000)
) AS term("planId", "name", "depositPct", "tenureMonths", "interestRateBps");

UPDATE "cng_applications" application
SET
  "financingConfigVersionId" = application."packageId" || '-v1',
  "packageNameSnapshot" = version."name",
  "packageTankSnapshot" = version."tank",
  "financingPlanNameSnapshot" = term."name",
  "depositPctSnapshot" = term."depositPct",
  "interestRateBpsSnapshot" = term."interestRateBps",
  "installmentCountSnapshot" = CASE WHEN term."tenureMonths" IS NULL THEN 0 ELSE ROUND(term."tenureMonths" * 52.0 / 12.0)::INTEGER END
FROM "cng_financing_package_versions" version
JOIN "cng_financing_package_terms" term ON term."versionId" = version."id"
WHERE application."packageId" = version."packageId"
  AND application."financingPlanId" = term."planId";
