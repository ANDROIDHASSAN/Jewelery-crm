-- Optional size variants for rate-priced storefront pieces (rings, bangles).
-- Each entry is `{ label: string, weightMg: number }`. When non-empty the PDP
-- renders a size selector and prices the piece off the SELECTED size's weight
-- at the live metal rate (only the metal value changes between sizes).
ALTER TABLE "Product" ADD COLUMN "sizes" JSONB;

-- Record the selected size on each order line so the store knows which size to
-- fulfil — the charged pricePaise was computed off that size's weight.
ALTER TABLE "OrderItem" ADD COLUMN "sizeLabel" TEXT;
