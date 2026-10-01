CREATE TYPE "AccountType" AS ENUM ('CONSUMER', 'STAFF', 'SERVICE');
CREATE TYPE "StaffStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

ALTER TABLE "users" ADD COLUMN "accountType" "AccountType" NOT NULL DEFAULT 'CONSUMER';
ALTER TABLE "refresh_tokens"
  ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'chrge-consumer',
  ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'development',
  ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "parentTokenId" TEXT;
CREATE INDEX "refresh_tokens_userId_audience_revokedAt_idx" ON "refresh_tokens"("userId", "audience", "revokedAt");

CREATE TABLE "staff_roles" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "isTopLevel" BOOLEAN NOT NULL DEFAULT false, "isSystem" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "staff_roles_name_key" ON "staff_roles"("name");
CREATE TABLE "staff_permissions" ("id" TEXT NOT NULL, "description" TEXT, CONSTRAINT "staff_permissions_pkey" PRIMARY KEY ("id"));
CREATE TABLE "staff_role_permissions" ("roleId" TEXT NOT NULL, "permissionId" TEXT NOT NULL, CONSTRAINT "staff_role_permissions_pkey" PRIMARY KEY ("roleId", "permissionId"));
CREATE TABLE "staff_profiles" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "status" "StaffStatus" NOT NULL DEFAULT 'INVITED', "staffRoleId" TEXT NOT NULL, "mfaSecretEncrypted" TEXT, "mfaEnabledAt" TIMESTAMP(3), "recoveryCodesHash" JSONB, "invitedAt" TIMESTAMP(3), "activatedAt" TIMESTAMP(3), "suspendedAt" TIMESTAMP(3), "disabledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "staff_profiles_userId_key" ON "staff_profiles"("userId");
CREATE INDEX "staff_profiles_status_idx" ON "staff_profiles"("status");
CREATE INDEX "staff_profiles_staffRoleId_status_idx" ON "staff_profiles"("staffRoleId", "status");
CREATE TABLE "staff_invitations" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "staffRoleId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "invitedBy" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "staff_invitations_tokenHash_key" ON "staff_invitations"("tokenHash");
CREATE INDEX "staff_invitations_email_createdAt_idx" ON "staff_invitations"("email", "createdAt");
CREATE INDEX "staff_invitations_expiresAt_idx" ON "staff_invitations"("expiresAt");
CREATE TABLE "service_principals" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "credentialHash" TEXT NOT NULL, "scopes" JSONB NOT NULL, "environment" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "rotatedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "service_principals_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "service_principals_name_key" ON "service_principals"("name");
CREATE UNIQUE INDEX "service_principals_credentialHash_key" ON "service_principals"("credentialHash");
CREATE INDEX "service_principals_environment_revokedAt_idx" ON "service_principals"("environment", "revokedAt");

ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "staff_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_role_permissions" ADD CONSTRAINT "staff_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "staff_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_role_permissions" ADD CONSTRAINT "staff_role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "staff_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "staff_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backward-compatible data migration: existing privileged identities become staff,
-- but remain unable to receive admin-audience tokens until a profile is ACTIVE and MFA is enrolled.
UPDATE "users" SET "accountType" = 'STAFF' WHERE role IN ('ADMIN', 'OPERATOR');
