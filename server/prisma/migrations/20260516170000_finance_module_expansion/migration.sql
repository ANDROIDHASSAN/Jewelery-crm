-- =====================================================================
-- Finance & Accounting module expansion — vendor payments, bank accounts,
-- bank transactions, reconciliation log, and Expense classification /
-- recurring / vendor-link / bank-link fields.
-- All money in paise (Int). Tenant-scoped, like every other table.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New enums
-- ---------------------------------------------------------------------

CREATE TYPE "ExpenseClassification" AS ENUM ('REVENUE', 'CAPITAL');
CREATE TYPE "BankAccountType" AS ENUM ('CURRENT', 'SAVINGS', 'OD', 'CC', 'OTHER');
CREATE TYPE "BankTxnDirection" AS ENUM ('CREDIT', 'DEBIT');

-- ---------------------------------------------------------------------
-- 2. Expense: classification (capital vs revenue), recurring flag,
--    receipt URL, payment mode, vendor/bank links.
--    Defaults preserve existing rows (everything starts as REVENUE,
--    non-recurring, no receipt, no vendor/bank link).
-- ---------------------------------------------------------------------

ALTER TABLE "Expense"
  ADD COLUMN "receiptUrl"            TEXT,
  ADD COLUMN "classification"        "ExpenseClassification" NOT NULL DEFAULT 'REVENUE',
  ADD COLUMN "isRecurring"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recurringIntervalDays" INTEGER,
  ADD COLUMN "paymentMode"           "PaymentMode",
  ADD COLUMN "vendorId"              TEXT,
  ADD COLUMN "bankAccountId"         TEXT;

CREATE INDEX "Expense_tenantId_classification_paidAt_idx"
  ON "Expense"("tenantId", "classification", "paidAt");
CREATE INDEX "Expense_tenantId_vendorId_idx"
  ON "Expense"("tenantId", "vendorId");

-- ---------------------------------------------------------------------
-- 3. BankAccount
-- ---------------------------------------------------------------------

CREATE TABLE "BankAccount" (
  "id"                  TEXT NOT NULL,
  "tenantId"            TEXT NOT NULL,
  "nickname"            TEXT NOT NULL,
  "bankName"            TEXT NOT NULL,
  "accountLast4"        TEXT NOT NULL,
  "ifsc"                TEXT,
  "type"                "BankAccountType" NOT NULL DEFAULT 'CURRENT',
  "openingBalancePaise" INTEGER NOT NULL DEFAULT 0,
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankAccount_tenantId_isActive_idx" ON "BankAccount"("tenantId", "isActive");
ALTER TABLE "BankAccount"
  ADD CONSTRAINT "BankAccount_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 4. BankTransaction
-- ---------------------------------------------------------------------

CREATE TABLE "BankTransaction" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "accountId"       TEXT NOT NULL,
  "direction"       "BankTxnDirection" NOT NULL,
  "amountPaise"     INTEGER NOT NULL,
  "balancePaise"    INTEGER,
  "description"     TEXT NOT NULL,
  "referenceId"     TEXT,
  "occurredAt"      TIMESTAMP(3) NOT NULL,
  "billId"          TEXT,
  "expenseId"       TEXT,
  "vendorPaymentId" TEXT,
  "reconciledAt"    TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankTransaction_tenantId_accountId_occurredAt_idx"
  ON "BankTransaction"("tenantId", "accountId", "occurredAt");
CREATE INDEX "BankTransaction_tenantId_reconciledAt_idx"
  ON "BankTransaction"("tenantId", "reconciledAt");
ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 5. VendorPayment
-- ---------------------------------------------------------------------

CREATE TABLE "VendorPayment" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "vendorId"      TEXT NOT NULL,
  "shopId"        TEXT,
  "amountPaise"   INTEGER NOT NULL,
  "paymentMode"   "PaymentMode" NOT NULL,
  "referenceId"   TEXT,
  "paidAt"        TIMESTAMP(3) NOT NULL,
  "notes"         TEXT,
  "bankAccountId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VendorPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VendorPayment_tenantId_vendorId_paidAt_idx"
  ON "VendorPayment"("tenantId", "vendorId", "paidAt");
CREATE INDEX "VendorPayment_tenantId_paidAt_idx"
  ON "VendorPayment"("tenantId", "paidAt");
ALTER TABLE "VendorPayment"
  ADD CONSTRAINT "VendorPayment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorPayment"
  ADD CONSTRAINT "VendorPayment_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorPayment"
  ADD CONSTRAINT "VendorPayment_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 6. Expense -> Vendor / BankAccount FKs
-- ---------------------------------------------------------------------

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 7. Reconciliation log
-- ---------------------------------------------------------------------

CREATE TABLE "Reconciliation" (
  "id"                  TEXT NOT NULL,
  "tenantId"            TEXT NOT NULL,
  "shopId"              TEXT NOT NULL,
  "reconciledDate"      DATE NOT NULL,
  "expectedCashPaise"   INTEGER NOT NULL DEFAULT 0,
  "countedCashPaise"    INTEGER NOT NULL DEFAULT 0,
  "expectedUpiPaise"    INTEGER NOT NULL DEFAULT 0,
  "settledUpiPaise"     INTEGER NOT NULL DEFAULT 0,
  "expectedCardPaise"   INTEGER NOT NULL DEFAULT 0,
  "settledCardPaise"    INTEGER NOT NULL DEFAULT 0,
  "varianceCashPaise"   INTEGER NOT NULL DEFAULT 0,
  "varianceUpiPaise"    INTEGER NOT NULL DEFAULT 0,
  "varianceCardPaise"   INTEGER NOT NULL DEFAULT 0,
  "notes"               TEXT,
  "reconciledByUserId"  TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Reconciliation_tenantId_shopId_reconciledDate_key"
  ON "Reconciliation"("tenantId", "shopId", "reconciledDate");
CREATE INDEX "Reconciliation_tenantId_reconciledDate_idx"
  ON "Reconciliation"("tenantId", "reconciledDate");
ALTER TABLE "Reconciliation"
  ADD CONSTRAINT "Reconciliation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
