-- Adds:
--   1. Customer.email — captured on storefront signup, used for invoice + marketing.
--   2. CustomerAddress — saved shipping address book per customer, so the
--      checkout form can auto-fill the next time the same customer buys.
--      Order.shipping* still holds the snapshot at order time; this table is
--      purely the reusable address book.

ALTER TABLE "Customer" ADD COLUMN "email" TEXT;

CREATE TABLE "CustomerAddress" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label"      TEXT,
  "name"       TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "line1"      TEXT NOT NULL,
  "line2"      TEXT,
  "city"       TEXT NOT NULL,
  "state"      TEXT NOT NULL,
  "pincode"    TEXT NOT NULL,
  "isDefault"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerAddress_tenantId_idx" ON "CustomerAddress" ("tenantId");
CREATE INDEX "CustomerAddress_tenantId_customerId_idx" ON "CustomerAddress" ("tenantId", "customerId");

ALTER TABLE "CustomerAddress"
  ADD CONSTRAINT "CustomerAddress_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerAddress"
  ADD CONSTRAINT "CustomerAddress_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
