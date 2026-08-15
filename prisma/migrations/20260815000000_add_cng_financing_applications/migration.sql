-- CreateEnum
CREATE TYPE "CngApplicationStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

-- CreateTable
CREATE TABLE "cng_applications" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "accessTokenHash" TEXT NOT NULL,
  "userId" TEXT,
  "status" "CngApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "firstName" TEXT,
  "middleName" TEXT,
  "lastName" TEXT,
  "gender" TEXT,
  "dateOfBirth" TIMESTAMP(3),
  "maritalStatus" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "phoneVerifiedAt" TIMESTAMP(3),
  "bvnEncrypted" TEXT,
  "bvnHash" TEXT,
  "bvnLast4" TEXT,
  "ninEncrypted" TEXT,
  "ninHash" TEXT,
  "ninLast4" TEXT,
  "currentlyEmployed" BOOLEAN,
  "employmentStatus" TEXT,
  "employmentSector" TEXT,
  "employerName" TEXT,
  "occupationJobTitle" TEXT,
  "monthlyIncome" TEXT,
  "employmentStartDate" TIMESTAMP(3),
  "employmentConfirmationDate" TIMESTAMP(3),
  "address" TEXT,
  "state" TEXT,
  "lga" TEXT,
  "nextOfKinName" TEXT,
  "nextOfKinPhone" TEXT,
  "nextOfKinRelationship" TEXT,
  "personalCompletedAt" TIMESTAMP(3),
  "vehicleBrand" TEXT,
  "vehicleModel" TEXT,
  "vehicleYear" INTEGER,
  "manufacturingDate" TIMESTAMP(3),
  "vehicleColor" TEXT,
  "mileage" TEXT,
  "fuelSystem" TEXT,
  "engineType" TEXT,
  "licensePlate" TEXT,
  "chassisNumber" TEXT,
  "engineNumber" TEXT,
  "vehicleCompletedAt" TIMESTAMP(3),
  "packageId" TEXT,
  "financingPlanId" TEXT,
  "preferredLoanTenor" INTEGER,
  "packagePriceNgn" INTEGER,
  "depositAmountNgn" INTEGER,
  "financedAmountNgn" INTEGER,
  "interestAmountNgn" INTEGER,
  "monthlyPaymentNgn" INTEGER,
  "totalCostNgn" INTEGER,
  "privacyConsentAt" TIMESTAMP(3),
  "privacyPolicyVersion" TEXT,
  "financingCompletedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "reviewNote" TEXT,
  "rejectionReason" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cng_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cng_application_documents" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cng_application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cng_phone_verifications" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cng_phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cng_applications_reference_key" ON "cng_applications"("reference");
CREATE UNIQUE INDEX "cng_applications_accessTokenHash_key" ON "cng_applications"("accessTokenHash");
CREATE INDEX "cng_applications_userId_createdAt_idx" ON "cng_applications"("userId", "createdAt");
CREATE INDEX "cng_applications_status_createdAt_idx" ON "cng_applications"("status", "createdAt");
CREATE INDEX "cng_applications_phone_idx" ON "cng_applications"("phone");
CREATE INDEX "cng_applications_bvnHash_idx" ON "cng_applications"("bvnHash");
CREATE INDEX "cng_applications_ninHash_idx" ON "cng_applications"("ninHash");
CREATE UNIQUE INDEX "cng_application_documents_applicationId_type_key" ON "cng_application_documents"("applicationId", "type");
CREATE INDEX "cng_application_documents_applicationId_idx" ON "cng_application_documents"("applicationId");
CREATE INDEX "cng_phone_verifications_applicationId_phone_createdAt_idx" ON "cng_phone_verifications"("applicationId", "phone", "createdAt");
CREATE INDEX "cng_phone_verifications_expiresAt_idx" ON "cng_phone_verifications"("expiresAt");

-- AddForeignKey
ALTER TABLE "cng_applications"
  ADD CONSTRAINT "cng_applications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cng_applications"
  ADD CONSTRAINT "cng_applications_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cng_application_documents"
  ADD CONSTRAINT "cng_application_documents_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cng_phone_verifications"
  ADD CONSTRAINT "cng_phone_verifications_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
