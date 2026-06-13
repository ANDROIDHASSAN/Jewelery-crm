-- Sale-wide "Buy 1 Get 1 Free" toggle for the Season Sale (applies to all
-- items in the sale pool). Per-item % / ₹ discounts remain independent.
ALTER TABLE "Tenant" ADD COLUMN "seasonSaleBogo" BOOLEAN NOT NULL DEFAULT false;
