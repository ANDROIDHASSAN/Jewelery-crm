-- Optional making-charge override (basis points) on a purchase-order line.
-- Applied to the Item created when the PO is received; null = inherit the
-- category default at bill time.
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "makingChargeBps" INTEGER;
