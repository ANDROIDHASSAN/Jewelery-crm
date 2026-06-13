-- Full item-detail fields on PurchaseOrderItem so a new piece can be fully
-- described at PO-creation time and the Item row is complete on receive.

ALTER TABLE "PurchaseOrderItem" ADD COLUMN "name"                    TEXT;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "description"             TEXT;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "images"                  JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "hallmarkStatus"          TEXT  NOT NULL DEFAULT 'PENDING';
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "hallmarkRef"             TEXT;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "stoneWeightMg"           INTEGER;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "makingChargeMode"        TEXT;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "makingChargePerGramPaise" INTEGER;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "isSerialized"            BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "collectionIds"           JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "diamondsJson"            JSONB NOT NULL DEFAULT '[]';
