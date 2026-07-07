-- Custom "Details & Dimensions" spec rows: free-form [{ label, value }] arrays.
-- Captured at intake (Add item / PO), mirrored onto the storefront Product and
-- rendered under the PDP Specification. Item/Product columns are nullable
-- (null = none); the PO line defaults to an empty array like its sibling JSON
-- columns. Additive and non-destructive.

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "specs" JSONB;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "specs" JSONB;

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "specs" JSONB NOT NULL DEFAULT '[]';
