-- Make community station retries return the original pending submission.
ALTER TABLE "stations" ADD COLUMN "submissionKey" TEXT;
CREATE UNIQUE INDEX "stations_submittedBy_submissionKey_key"
  ON "stations"("submittedBy", "submissionKey");
