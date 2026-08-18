-- Preserve anonymous drafts where their applicant email matches an existing account.
UPDATE "cng_applications" AS application
SET "userId" = account."id"
FROM "users" AS account
WHERE application."userId" IS NULL
  AND application."email" IS NOT NULL
  AND LOWER(application."email") = LOWER(account."email");

-- Preserve unmatched legacy applications under a non-login recovery owner so
-- the ownership constraint can be introduced without deleting application data.
INSERT INTO "users" (
  "id",
  "email",
  "passwordHash",
  "provider",
  "emailVerified",
  "role",
  "createdAt",
  "updatedAt"
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'legacy-cng-applications@internal.invalid',
  NULL,
  'EMAIL',
  FALSE,
  'USER',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO NOTHING;

UPDATE "cng_applications"
SET "userId" = (
  SELECT "id"
  FROM "users"
  WHERE "email" = 'legacy-cng-applications@internal.invalid'
)
WHERE "userId" IS NULL;

ALTER TABLE "cng_applications"
DROP CONSTRAINT "cng_applications_userId_fkey";

ALTER TABLE "cng_applications"
ALTER COLUMN "userId" SET NOT NULL,
DROP COLUMN "accessTokenHash";

ALTER TABLE "cng_applications"
ADD CONSTRAINT "cng_applications_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
