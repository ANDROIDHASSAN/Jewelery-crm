-- Phase 1 (inventory meeting changes): Stainless Steel metal type + per-gram making charge.
-- All changes are additive and non-destructive: a new enum value, a new enum type,
-- and new nullable / defaulted columns. Existing rows and queries are unaffected.

-- CreateEnum
CREATE TYPE "MakingChargeMode" AS ENUM ('PERCENTAGE', 'PER_GRAM');

-- AlterEnum: add STAINLESS_STEEL as a non-precious metal type.
ALTER TYPE "MetalType" ADD VALUE 'STAINLESS_STEEL';

-- AlterTable: category-level making-charge mode + flat per-gram rate.
ALTER TABLE "Category" ADD COLUMN     "defaultMakingChargePerGramPaise" INTEGER,
ADD COLUMN     "makingChargeMode" "MakingChargeMode" NOT NULL DEFAULT 'PERCENTAGE';

-- AlterTable: item-level making-charge override (null mode = inherit category).
ALTER TABLE "Item" ADD COLUMN     "makingChargeMode" "MakingChargeMode",
ADD COLUMN     "makingChargePerGramPaise" INTEGER;
