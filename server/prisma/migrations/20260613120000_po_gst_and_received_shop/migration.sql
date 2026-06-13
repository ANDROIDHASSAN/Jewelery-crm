-- Purchase (input) GST on a PO + the shop/date it was received into.
-- GST: one total per PO — CGST+SGST (intra-state) OR IGST (inter-state).
-- Feeds finance as Input Tax Credit (ITC) once the PO is RECEIVED.
-- received* columns record where the stock landed (null for legacy POs).

ALTER TABLE "PurchaseOrder" ADD COLUMN "cgstPaise"      INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "sgstPaise"      INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "igstPaise"      INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "gstInterState"  BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE "PurchaseOrder" ADD COLUMN "receivedShopId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "receivedAt"     TIMESTAMP(3);

CREATE INDEX "PurchaseOrder_tenantId_status_receivedAt_idx"
  ON "PurchaseOrder" ("tenantId", "status", "receivedAt");
