-- Performance indexes for the busiest admin reads.
--
-- /ecommerce/orders polls every 10s with ORDER BY createdAt DESC. The
-- existing (tenantId) index doesn't help with the sort — Postgres still
-- had to fetch and sort all of the tenant's orders. A descending composite
-- lets it serve the page with an index-only scan.
--
-- /ecommerce/orders/live-count filters reservations by paymentMethod each
-- poll. (tenantId, paymentMethod) eliminates the seq-scan there.

CREATE INDEX "Order_tenantId_createdAt_idx"
    ON "Order"("tenantId", "createdAt" DESC);

CREATE INDEX "Order_tenantId_paymentMethod_idx"
    ON "Order"("tenantId", "paymentMethod");
