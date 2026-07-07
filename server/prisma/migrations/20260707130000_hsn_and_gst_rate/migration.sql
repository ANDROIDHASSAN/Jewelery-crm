-- HSN code + per-item GST rate for rate-wise (GSTR-1) GST reporting.
--
-- Item / PurchaseOrderItem / Product carry the HSN + GST rate set at intake.
-- BillLine additionally snapshots the per-line taxable base and CGST/SGST/IGST
-- computed at sale time, so the GST report can produce an exact HSN-wise
-- summary. gstRateBps defaults to 300 (3%), the standard jewellery rate; the PO
-- line's rate is nullable (falls back to the item's 3% on receive).

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "gstRateBps" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "hsnCode" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "gstRateBps" INTEGER,
ADD COLUMN     "hsnCode" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gstRateBps" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "hsnCode" TEXT;

-- AlterTable
ALTER TABLE "BillLine" ADD COLUMN     "cgstPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gstRateBps" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "igstPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sgstPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxablePaise" INTEGER NOT NULL DEFAULT 0;
