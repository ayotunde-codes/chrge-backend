-- Make community station retries return the original pending submission.
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "submissionKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "stations_submittedBy_submissionKey_key"
  ON "stations"("submittedBy", "submissionKey");
