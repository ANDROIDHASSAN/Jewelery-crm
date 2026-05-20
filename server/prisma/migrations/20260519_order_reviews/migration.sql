-- Customer-authored order reviews. One row per Order (the @@unique on
-- orderId enforces it). Rating is 1-5, body is required, title + photos
-- optional. Photos are Cloudinary URLs (same pipeline as product images).
-- Tenant isolation: tenantId is denormalised from the parent Order so
-- tenant-scoped lists don't have to join through Order.

CREATE TABLE "OrderReview" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "orderId"    TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating"     INTEGER NOT NULL,
    "title"      TEXT,
    "body"       TEXT NOT NULL,
    "photos"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderReview_orderId_key" ON "OrderReview"("orderId");
CREATE INDEX "OrderReview_tenantId_createdAt_idx" ON "OrderReview"("tenantId", "createdAt");
CREATE INDEX "OrderReview_customerId_idx" ON "OrderReview"("customerId");

ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sanity check: rating is constrained to 1..5 at the DB level so a stray
-- 0 or 6 from a client bug still gets rejected.
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_rating_range_chk"
    CHECK ("rating" >= 1 AND "rating" <= 5);
