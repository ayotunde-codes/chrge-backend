CREATE TYPE "CngAdditionalInformationStatus" AS ENUM ('AWAITING_RESPONSE', 'SUBMITTED', 'REOPENED', 'CANCELLED');

CREATE TABLE "cng_application_document_versions" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL, "originalName" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "checksumSha256" TEXT NOT NULL,
  "scanStatus" "DocumentScanStatus" NOT NULL, "uploadedAt" TIMESTAMP(3) NOT NULL,
  "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "replacedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL, CONSTRAINT "cng_application_document_versions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cng_additional_information_requests" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "question" TEXT NOT NULL,
  "allowText" BOOLEAN NOT NULL DEFAULT false, "allowDocuments" BOOLEAN NOT NULL DEFAULT false,
  "status" "CngAdditionalInformationStatus" NOT NULL DEFAULT 'AWAITING_RESPONSE',
  "requestedBy" TEXT NOT NULL, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3), "reopenedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "cng_additional_information_requests_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cng_additional_information_responses" (
  "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "textAnswer" TEXT, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cng_additional_information_responses_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cng_additional_information_documents" (
  "id" TEXT NOT NULL, "responseId" TEXT NOT NULL, "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL, "scanStatus" "DocumentScanStatus" NOT NULL DEFAULT 'PENDING',
  "scannedAt" TIMESTAMP(3), "scannerVersion" TEXT, "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cng_additional_information_documents_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cng_application_revisions" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL, "reason" TEXT NOT NULL, "changedFields" JSONB NOT NULL,
  "beforeValues" JSONB NOT NULL, "afterValues" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cng_application_revisions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cng_application_exports" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL, "filename" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
  "snapshotHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cng_application_exports_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "staff_step_up_tokens" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "action" TEXT NOT NULL, "resourceId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_step_up_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cng_application_document_versions_documentId_version_key" ON "cng_application_document_versions"("documentId", "version");
CREATE INDEX "cng_application_document_versions_applicationId_replacedAt_idx" ON "cng_application_document_versions"("applicationId", "replacedAt");
CREATE INDEX "cng_additional_information_requests_applicationId_requestedAt_idx" ON "cng_additional_information_requests"("applicationId", "requestedAt");
CREATE INDEX "cng_additional_information_responses_requestId_submittedAt_idx" ON "cng_additional_information_responses"("requestId", "submittedAt");
CREATE INDEX "cng_additional_information_documents_responseId_idx" ON "cng_additional_information_documents"("responseId");
CREATE INDEX "cng_application_revisions_applicationId_createdAt_idx" ON "cng_application_revisions"("applicationId", "createdAt");
CREATE INDEX "cng_application_exports_applicationId_createdAt_idx" ON "cng_application_exports"("applicationId", "createdAt");
CREATE INDEX "cng_application_exports_expiresAt_idx" ON "cng_application_exports"("expiresAt");
CREATE UNIQUE INDEX "staff_step_up_tokens_tokenHash_key" ON "staff_step_up_tokens"("tokenHash");
CREATE INDEX "staff_step_up_tokens_userId_action_resourceId_idx" ON "staff_step_up_tokens"("userId", "action", "resourceId");
CREATE INDEX "staff_step_up_tokens_expiresAt_idx" ON "staff_step_up_tokens"("expiresAt");

ALTER TABLE "cng_application_document_versions" ADD CONSTRAINT "cng_application_document_versions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cng_additional_information_requests" ADD CONSTRAINT "cng_additional_information_requests_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cng_additional_information_responses" ADD CONSTRAINT "cng_additional_information_responses_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "cng_additional_information_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cng_additional_information_documents" ADD CONSTRAINT "cng_additional_information_documents_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "cng_additional_information_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cng_application_revisions" ADD CONSTRAINT "cng_application_revisions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cng_application_exports" ADD CONSTRAINT "cng_application_exports_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "cng_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
