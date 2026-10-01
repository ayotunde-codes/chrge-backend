CREATE TABLE "staff_auth_challenges" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bindingHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_auth_challenges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_auth_challenges_userId_createdAt_idx" ON "staff_auth_challenges"("userId", "createdAt");
CREATE INDEX "staff_auth_challenges_expiresAt_idx" ON "staff_auth_challenges"("expiresAt");
ALTER TABLE "staff_auth_challenges" ADD CONSTRAINT "staff_auth_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
