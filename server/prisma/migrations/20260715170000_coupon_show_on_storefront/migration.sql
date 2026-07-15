-- Opt-in flag for advertising a coupon in the storefront announcement bar.
--
-- `isActive` only means "redeemable". Many live codes are private — a goodwill
-- code for one customer, a partner code — so broadcasting every active code
-- would leak them. Publishing is therefore a separate, explicit choice.
--
-- Defaults to FALSE: no existing coupon starts being advertised because of this
-- migration. Additive and non-destructive.
--
-- NOTE: `prisma migrate diff` also reports a missing UNIQUE INDEX on
-- Product(linkedItemId). That is PRE-EXISTING drift between the live database
-- and schema.prisma, unrelated to this change, and is deliberately NOT included
-- here — creating it would fail if any duplicate linkedItemId rows exist.

-- AlterTable
ALTER TABLE "CouponCode" ADD COLUMN     "showOnStorefront" BOOLEAN NOT NULL DEFAULT false;
