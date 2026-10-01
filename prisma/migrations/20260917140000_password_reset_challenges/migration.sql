CREATE TABLE "password_reset_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_reset_challenges_userId_createdAt_idx" ON "password_reset_challenges"("userId", "createdAt");
CREATE INDEX "password_reset_challenges_expiresAt_idx" ON "password_reset_challenges"("expiresAt");

ALTER TABLE "password_reset_challenges"
ADD CONSTRAINT "password_reset_challenges_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
