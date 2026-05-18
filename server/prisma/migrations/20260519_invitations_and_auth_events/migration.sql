-- Invitation flow + auth audit log. See schema.prisma comments for design.

-- AuthEventType enum
CREATE TYPE "AuthEventType" AS ENUM (
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGIN_LOCKED',
  'LOGOUT',
  'PASSWORD_CHANGE',
  'PASSWORD_RESET',
  'TOTP_ENABLED',
  'TOTP_DISABLED',
  'INVITATION_SENT',
  'INVITATION_ACCEPTED',
  'INVITATION_REVOKED',
  'ROLE_CHANGED',
  'USER_DEACTIVATED'
);

-- UserInvitation
CREATE TABLE "UserInvitation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "shopId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invitedByUserId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "acceptedUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_tenantId_idx" ON "UserInvitation"("tenantId");
CREATE INDEX "UserInvitation_tenantId_email_idx" ON "UserInvitation"("tenantId", "email");
CREATE INDEX "UserInvitation_expiresAt_idx" ON "UserInvitation"("expiresAt");
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AuthEvent
CREATE TABLE "AuthEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT,
  "type" "AuthEventType" NOT NULL,
  "email" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthEvent_tenantId_createdAt_idx" ON "AuthEvent"("tenantId", "createdAt" DESC);
CREATE INDEX "AuthEvent_userId_createdAt_idx" ON "AuthEvent"("userId", "createdAt" DESC);
CREATE INDEX "AuthEvent_type_createdAt_idx" ON "AuthEvent"("type", "createdAt" DESC);
