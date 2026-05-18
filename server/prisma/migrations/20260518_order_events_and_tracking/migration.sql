-- Add cancelReason to Order
ALTER TABLE "Order" ADD COLUMN "cancelReason" TEXT;

-- OrderEvent: append-only timeline of state transitions on an Order.
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "location" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");
CREATE INDEX "OrderEvent_tenantId_createdAt_idx" ON "OrderEvent"("tenantId", "createdAt");

ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing order needs at least one event so the timeline UI
-- has something to render on day 0. Use the order's createdAt + current status
-- so historical orders look reasonable.
INSERT INTO "OrderEvent" ("id", "orderId", "tenantId", "status", "note", "actorName", "createdAt")
SELECT
    'evt_' || substr(md5(random()::text || "id"), 1, 24) AS id,
    "id" AS "orderId",
    "tenantId",
    'PENDING'::"OrderStatus" AS status,
    'Order placed' AS note,
    'System' AS "actorName",
    "createdAt"
FROM "Order";

-- For orders that are past PENDING, add a second event recording the
-- current status so the timeline shows it. Best-effort backfill — we
-- don't know when the transition happened, so we use createdAt + 1 min.
INSERT INTO "OrderEvent" ("id", "orderId", "tenantId", "status", "note", "actorName", "createdAt")
SELECT
    'evt_' || substr(md5(random()::text || "id" || 'b'), 1, 24) AS id,
    "id" AS "orderId",
    "tenantId",
    "status",
    'Status backfilled from order record' AS note,
    'System' AS "actorName",
    "createdAt" + interval '1 minute' AS "createdAt"
FROM "Order"
WHERE "status" <> 'PENDING';
