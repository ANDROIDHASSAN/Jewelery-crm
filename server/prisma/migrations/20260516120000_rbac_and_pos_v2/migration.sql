-- =====================================================================
-- RBAC + POS v2 — full role/permission model, email-based auth,
-- POS shop-owner tables (register sessions, parked bills, estimates,
-- repairs, advances, cash movements).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Rename the legacy "Role" enum out of the way so the new "Role"
--    TABLE below can claim the name. PostgreSQL types and tables share a
--    namespace, so leaving the old enum would make `CREATE TABLE "Role"`
--    fail with "type already exists". We *rename* rather than drop here
--    because section (b) further down still reads `User.role` to map old
--    role values onto the new roleId — PostgreSQL transparently retypes
--    the column after the rename. Step (d) drops both the column and the
--    renamed type at the end.
-- ---------------------------------------------------------------------

ALTER TYPE "Role" RENAME TO "Role_old";

-- ---------------------------------------------------------------------
-- 1. New enums
-- ---------------------------------------------------------------------

CREATE TYPE "RegisterSessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CashMovementType" AS ENUM ('PAY_IN', 'PAY_OUT', 'OPENING_FLOAT', 'DEPOSIT');
CREATE TYPE "ParkedBillStatus" AS ENUM ('ACTIVE', 'RESUMED', 'ABANDONED');
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'CONVERTED', 'EXPIRED');
CREATE TYPE "RepairStatus" AS ENUM ('INTAKE', 'IN_WORKSHOP', 'READY', 'DELIVERED', 'CANCELLED');
CREATE TYPE "AdvanceStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REFUNDED');

-- ---------------------------------------------------------------------
-- 2. PaymentMode enum: add STORE_CREDIT, ADVANCE
-- ---------------------------------------------------------------------

ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'STORE_CREDIT';
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'ADVANCE';

-- ---------------------------------------------------------------------
-- 3. RBAC tables
-- ---------------------------------------------------------------------

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_tenantId_slug_key" ON "Role"("tenantId", "slug");
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

ALTER TABLE "Role"
    ADD CONSTRAINT "Role_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE INDEX "Permission_module_idx" ON "Permission"("module");

CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

ALTER TABLE "RolePermission"
    ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission"
    ADD CONSTRAINT "RolePermission_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId", "permissionId")
);

CREATE INDEX "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");

-- FKs added after User changes below.

-- ---------------------------------------------------------------------
-- 4. User: add email, password fields, totp, roleId
--    Drop old role enum column, drop enum type.
-- ---------------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "totpBackupCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "createdByUserId" TEXT;

-- Backfill: every existing User belongs to a tenant. Seed 4 system roles per
-- tenant, then map User.role enum → roleId.

-- (a) seed the 4 built-in roles for every existing tenant
INSERT INTO "Role" ("id", "tenantId", "slug", "name", "description", "isSystem", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text AS id,
    t."id" AS tenantId,
    r.slug,
    r.name,
    r.description,
    true AS isSystem,
    NOW(),
    NOW()
FROM "Tenant" t
CROSS JOIN (VALUES
    ('SUPER_ADMIN', 'Super Admin', 'Full access across every module and user/role management.'),
    ('ACCOUNTANT', 'Accountant', 'Stock, finance, accounting, and reports.'),
    ('EMPLOYEE', 'Employee', 'Stock, e-commerce, leads, and reports for day-to-day staff.'),
    ('POS_USER', 'POS Cashier', 'Offline POS only.')
) AS r(slug, name, description);

-- (b) map old enum → new slug; UPDATE user.roleId
-- OWNER → SUPER_ADMIN, MANAGER → EMPLOYEE, BILLING → POS_USER, VIEWER → ACCOUNTANT
UPDATE "User" u SET "roleId" = r."id"
FROM "Role" r
WHERE r."tenantId" = u."tenantId"
  AND r."slug" = (CASE u."role"::text
        WHEN 'OWNER' THEN 'SUPER_ADMIN'
        WHEN 'MANAGER' THEN 'EMPLOYEE'
        WHEN 'BILLING' THEN 'POS_USER'
        WHEN 'VIEWER' THEN 'ACCOUNTANT'
        ELSE 'EMPLOYEE'
    END);

-- (c) backfill email from phone (placeholder) for any pre-existing rows,
-- so the NOT NULL + UNIQUE constraints can apply.
UPDATE "User" SET "email" = CONCAT(LOWER(REPLACE("phone", '+', '')), '@placeholder.local')
WHERE "email" IS NULL;

-- (d) drop the old role column + the renamed legacy enum.
-- Step 0 above renamed the legacy "Role" enum to "Role_old" so the new
-- "Role" TABLE could claim that namespace. Now that the column-level
-- migration is done we can drop both safely. Do NOT `DROP TYPE "Role"`
-- here — "Role" now resolves to the implicit type of the new TABLE, and
-- dropping it would corrupt the schema.
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
DROP TYPE IF EXISTS "Role_old";

-- (e) make columns NOT NULL / UNIQUE
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;

-- (f) drop the old (tenantId, phone) unique so phone can be optional, then
-- recreate it as a partial unique (only when phone is set). The init
-- migration may have created this as either a CONSTRAINT or a bare INDEX
-- depending on Prisma version, so drop both forms before recreating.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_tenantId_phone_key";
DROP INDEX IF EXISTS "User_tenantId_phone_key";
CREATE UNIQUE INDEX "User_tenantId_phone_key" ON "User"("tenantId", "phone")
WHERE "phone" IS NOT NULL;

CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
CREATE INDEX "User_tenantId_roleId_idx" ON "User"("tenantId", "roleId");
CREATE INDEX "User_tenantId_shopId_idx" ON "User"("tenantId", "shopId");

ALTER TABLE "User"
    ADD CONSTRAINT "User_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserPermission"
    ADD CONSTRAINT "UserPermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermission"
    ADD CONSTRAINT "UserPermission_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 5. Customer: storeCreditPaise + (tenantId,name) index for typeahead
-- ---------------------------------------------------------------------

ALTER TABLE "Customer" ADD COLUMN "storeCreditPaise" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");

-- ---------------------------------------------------------------------
-- 6. Item: barcode index for POS scanning
-- ---------------------------------------------------------------------

CREATE INDEX "Item_barcodeData_idx" ON "Item"("barcodeData");

-- ---------------------------------------------------------------------
-- 7. Bill: salesperson, register session, void, customer/salesperson indexes
-- ---------------------------------------------------------------------

ALTER TABLE "Bill" ADD COLUMN "salespersonUserId" TEXT;
ALTER TABLE "Bill" ADD COLUMN "registerSessionId" TEXT;
ALTER TABLE "Bill" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "Bill" ADD COLUMN "voidReason" TEXT;

CREATE INDEX "Bill_tenantId_customerId_idx" ON "Bill"("tenantId", "customerId");
CREATE INDEX "Bill_tenantId_salespersonUserId_idx" ON "Bill"("tenantId", "salespersonUserId");
CREATE INDEX "Bill_registerSessionId_idx" ON "Bill"("registerSessionId");

-- Refund
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedByUserId" TEXT,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Refund_billId_idx" ON "Refund"("billId");
ALTER TABLE "Refund"
    ADD CONSTRAINT "Refund_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 8. RegisterSession + partial unique guard "one OPEN session per shop"
-- ---------------------------------------------------------------------

CREATE TABLE "RegisterSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingFloatPaise" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "countedCashPaise" INTEGER,
    "expectedCashPaise" INTEGER,
    "variancePaise" INTEGER,
    "notes" TEXT,
    "status" "RegisterSessionStatus" NOT NULL DEFAULT 'OPEN',
    CONSTRAINT "RegisterSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RegisterSession_tenantId_shopId_status_idx" ON "RegisterSession"("tenantId", "shopId", "status");
CREATE INDEX "RegisterSession_tenantId_openedAt_idx" ON "RegisterSession"("tenantId", "openedAt");

-- Partial unique: only one OPEN session per shop at a time. This is the hard
-- DB-level guarantee. Service-layer code can still race; this is the safety net.
CREATE UNIQUE INDEX "RegisterSession_shop_open_unique"
    ON "RegisterSession"("shopId") WHERE "status" = 'OPEN';

ALTER TABLE "RegisterSession"
    ADD CONSTRAINT "RegisterSession_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegisterSession"
    ADD CONSTRAINT "RegisterSession_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegisterSession"
    ADD CONSTRAINT "RegisterSession_openedByUserId_fkey"
    FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Bill"
    ADD CONSTRAINT "Bill_registerSessionId_fkey"
    FOREIGN KEY ("registerSessionId") REFERENCES "RegisterSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 9. CashMovement
-- ---------------------------------------------------------------------

CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "registerSessionId" TEXT,
    "type" "CashMovementType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "performedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashMovement_tenantId_shopId_createdAt_idx" ON "CashMovement"("tenantId", "shopId", "createdAt");
CREATE INDEX "CashMovement_registerSessionId_idx" ON "CashMovement"("registerSessionId");

ALTER TABLE "CashMovement"
    ADD CONSTRAINT "CashMovement_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
    ADD CONSTRAINT "CashMovement_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
    ADD CONSTRAINT "CashMovement_registerSessionId_fkey"
    FOREIGN KEY ("registerSessionId") REFERENCES "RegisterSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
    ADD CONSTRAINT "CashMovement_performedByUserId_fkey"
    FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 10. ParkedBill
-- ---------------------------------------------------------------------

CREATE TABLE "ParkedBill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "parkedByUserId" TEXT NOT NULL,
    "customerLabel" TEXT NOT NULL,
    "customerPhone" TEXT,
    "draft" JSONB NOT NULL,
    "status" "ParkedBillStatus" NOT NULL DEFAULT 'ACTIVE',
    "resumedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParkedBill_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ParkedBill_tenantId_shopId_status_idx" ON "ParkedBill"("tenantId", "shopId", "status");
CREATE INDEX "ParkedBill_tenantId_createdAt_idx" ON "ParkedBill"("tenantId", "createdAt");

ALTER TABLE "ParkedBill"
    ADD CONSTRAINT "ParkedBill_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParkedBill"
    ADD CONSTRAINT "ParkedBill_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParkedBill"
    ADD CONSTRAINT "ParkedBill_parkedByUserId_fkey"
    FOREIGN KEY ("parkedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 11. Estimate
-- ---------------------------------------------------------------------

CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "customerLabel" TEXT NOT NULL,
    "customerPhone" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "ratesSnapshotJson" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "makingChargesPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "convertedBillId" TEXT,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Estimate_shopId_estimateNumber_key" ON "Estimate"("shopId", "estimateNumber");
CREATE INDEX "Estimate_tenantId_shopId_idx" ON "Estimate"("tenantId", "shopId");
CREATE INDEX "Estimate_tenantId_customerId_idx" ON "Estimate"("tenantId", "customerId");
CREATE INDEX "Estimate_tenantId_status_idx" ON "Estimate"("tenantId", "status");

ALTER TABLE "Estimate"
    ADD CONSTRAINT "Estimate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Estimate"
    ADD CONSTRAINT "Estimate_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Estimate"
    ADD CONSTRAINT "Estimate_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Estimate"
    ADD CONSTRAINT "Estimate_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 12. Repair
-- ---------------------------------------------------------------------

CREATE TABLE "Repair" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "weightInMg" INTEGER NOT NULL,
    "weightOutMg" INTEGER,
    "purityCaratX100" INTEGER NOT NULL,
    "problem" TEXT NOT NULL,
    "estimatedCostPaise" INTEGER NOT NULL,
    "finalCostPaise" INTEGER,
    "advancePaise" INTEGER NOT NULL DEFAULT 0,
    "intakeUserId" TEXT NOT NULL,
    "promisedAt" TIMESTAMP(3),
    "status" "RepairStatus" NOT NULL DEFAULT 'INTAKE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Repair_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Repair_shopId_ticketNumber_key" ON "Repair"("shopId", "ticketNumber");
CREATE INDEX "Repair_tenantId_status_idx" ON "Repair"("tenantId", "status");
CREATE INDEX "Repair_tenantId_customerPhone_idx" ON "Repair"("tenantId", "customerPhone");

ALTER TABLE "Repair"
    ADD CONSTRAINT "Repair_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Repair"
    ADD CONSTRAINT "Repair_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Repair"
    ADD CONSTRAINT "Repair_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Repair"
    ADD CONSTRAINT "Repair_intakeUserId_fkey"
    FOREIGN KEY ("intakeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 13. Advance
-- ---------------------------------------------------------------------

CREATE TABLE "Advance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "lockedRatesJson" JSONB,
    "notes" TEXT,
    "validUntil" TIMESTAMP(3),
    "status" "AdvanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "consumedBillId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Advance_shopId_receiptNumber_key" ON "Advance"("shopId", "receiptNumber");
CREATE INDEX "Advance_tenantId_customerId_idx" ON "Advance"("tenantId", "customerId");
CREATE INDEX "Advance_tenantId_status_idx" ON "Advance"("tenantId", "status");

ALTER TABLE "Advance"
    ADD CONSTRAINT "Advance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Advance"
    ADD CONSTRAINT "Advance_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Advance"
    ADD CONSTRAINT "Advance_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Advance"
    ADD CONSTRAINT "Advance_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 14. Extra AuditLog index for "what did user X do this week" lookups
-- ---------------------------------------------------------------------

CREATE INDEX "AuditLog_tenantId_userId_createdAt_idx" ON "AuditLog"("tenantId", "userId", "createdAt");
