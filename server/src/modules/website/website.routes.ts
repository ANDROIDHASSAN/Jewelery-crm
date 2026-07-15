// Public website routes — NO auth, NO tenant scope (tenant derived from subdomain in v1.5).
// For now we expose published products + storefront content.

import { Router } from 'express';
import { z } from 'zod';
import { LeadInputSchema, IndianPhoneSchema } from '@goldos/shared/schemas';
import { applySaleToPrePaise, computeBogoDiscountPaise, type SaleOffer } from '@goldos/shared/sale';
import { slugify } from '@goldos/shared/slug';
import { rawPrisma } from '../../lib/prisma.js';
import { runWithTenant } from '../../lib/async-context.js';
import { resolveCanonicalTenantId } from '../../lib/canonical-tenant.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { resolveMetalRates } from '../../lib/metal-rate.js';
import { bustKey } from '../../lib/cache.js';
import {
  createRazorpayOrder,
  verifyCheckoutSignature,
} from '../../lib/razorpay.js';
import { env } from '../../env.js';
import { enqueueWhatsApp } from '../../lib/queue.js';
import { createShiprocketAwb, isShiprocketConfigured } from '../../lib/shiprocket.js';
import { sendEmail, getCustomerWelcomeEmailHTML } from '../../lib/mailer.js';
import { logger } from '../../lib/logger.js';
import { validateAndComputeCoupon, recordCouponUsageInTx } from '../promotions/coupon.service.js';
import {
  validateRedemption,
  redeemPointsInTx,
  getBalance,
  computeEarnable,
  fetchLoyaltyConfig,
  pointsToPaise,
} from '../promotions/loyalty.service.js';
import { registerSitemapRoutes } from './sitemap.js';

export const websiteRouter: Router = Router();

// Public GET endpoints are read-mostly + tenant-public — let Vercel's edge cache
// them. `s-maxage` controls CDN cache; `stale-while-revalidate` lets the edge
// serve stale-but-fast while it revalidates in the background. Storefront content
// only changes when an admin clicks Publish (which we can invalidate via webhook
// later); a 60s cache is safe and turns repeat visits into single-digit-ms responses.
websiteRouter.use((req, res, next) => {
  if (req.method === 'GET') {
    // CMS content + product listings should reflect Publish within a few
    // seconds, not the previous 60s edge cache (which made the storefront
    // feel "broken" after editors saved). Trade-off: a busy storefront now
    // hits the API every 10s per edge node instead of every 60s.
    // - max-age=5     : browser keeps a fresh copy for 5s
    // - s-maxage=10   : Vercel edge keeps a fresh copy for 10s
    // - stale-while-revalidate=60 : edge can serve stale up to 60s while
    //   it revalidates in the background, so a single-digit-ms response is
    //   still the norm for the customer.
    // CMS publishes propagate to every visitor within ~10s of the click.
    res.setHeader(
      'Cache-Control',
      'public, max-age=5, s-maxage=10, stale-while-revalidate=60',
    );
  }
  next();
});

// SEO surfaces — sitemap.xml (index + per-type children) + robots.txt.
// Generated from live data; exposed at the clean storefront paths via
// vercel.json rewrites. Each handler sets its own longer Cache-Control.
registerSitemapRoutes(websiteRouter);

// Day 17 wires per-tenant subdomain resolution; for now accept ?tenant=, falling
// back to the canonical tenant (same one the admin sentinel resolves to — see
// lib/canonical-tenant.ts) so storefront writes and admin reads always agree.
async function resolveTenant(req: { query: Record<string, unknown> }): Promise<string> {
  const t = req.query['tenant'];
  if (typeof t === 'string' && t.length > 0) return t;
  return resolveCanonicalTenantId();
}

// Same resolver — kept under the old name so downstream call-sites don't
// need touching. Both used to diverge (`asc` vs `desc`) and silently routed
// public-form writes to a different tenant than the admin reads from.
async function tenantFromQueryOrFirst(req: { query: Record<string, unknown> }): Promise<string> {
  const t = req.query['tenant'];
  if (typeof t === 'string' && t.length > 0) return t;
  return resolveCanonicalTenantId();
}

// Public metal rates for the storefront ticker + PDP rate pill.
//
// The storefront quotes 9K gold only (plus silver, and platinum for Pt pieces).
// With GOLDAPI_KEY attached the live feed wins; without it we serve the rates an
// editor typed into Website → Gold rates. Platinum is CMS-only either way.
//
// Unlike the live feed (national), the CMS fallback is per-tenant, so this route
// has to resolve a tenant before it can read it.
websiteRouter.get('/gold-rate', async (req, res, next) => {
  try {
    const tenantId = await resolveTenant(req);
    const rates = await resolveMetalRates({ tenantId });
    res.json({
      data: {
        gold9kPaise: rates.gold9kPaise,
        silverPaise: rates.silverPaise,
        platinum950Paise: rates.platinum950Paise,
        goldSource: rates.goldSource,
        silverSource: rates.silverSource,
        platinumSource: rates.platinumSource,
        stale: rates.stale,
        cmsUpdatedAt: rates.cmsUpdatedAt,
        // Legacy shape: the per-purity array the storefront pricing helpers and
        // PDP still resolve a piece's own purity against. 9K is the published
        // basis; the rest stay populated for pieces registered at other purities.
        rates: (await legacyPurityRates()).map((r) => r),
        asOf: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** The per-purity rate array kept for product pricing (which prices a piece at its own purity). */
async function legacyPurityRates(): Promise<
  Array<{ purity: number; ratePerGramPaise: number; stale: boolean }>
> {
  const purities = [900, 2400, 2200, 1800, 1400, 0] as const;
  const rows = await Promise.all(purities.map((p) => readGoldRatePaise(p)));
  return purities.map((p, i) => ({
    purity: p,
    ratePerGramPaise: rows[i]?.paise ?? 0,
    stale: rows[i]?.stale ?? true,
  }));
}

// Public read of the storefront content blob. Drives the entire homepage.
websiteRouter.get('/storefront', async (req, res, next) => {
  try {
    const tenantId = await resolveTenant(req);
    const row = await rawPrisma.storefrontContent.findUnique({ where: { tenantId } });
    if (!row) {
      res.status(404).json({ error: { code: 'STOREFRONT_NOT_FOUND', message: 'Storefront content not seeded for this tenant' } });
      return;
    }
    res.json({ data: { content: row.content, version: row.version, updatedAt: row.updatedAt } });
  } catch (err) {
    next(err);
  }
});

// Category slugs for storefront URLs (/store/collections/<slug>) are derived
// deterministically from the name via the SHARED slugify() (see
// @goldos/shared/slug) — the same function the CMS uses to auto-fill tile
// slugs, so a tile link and a category slug can never drift apart.

websiteRouter.get('/collections', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    // sortOrder first so the storefront honours the admin's chosen ordering
    // (e.g. showing "Demifine Jewellery" before "9KT Fine Gold" in the mobile
    // nav tone tabs), with name as a stable tie-breaker. Both default to 0, so
    // untouched catalogues keep alphabetical order.
    const categories = await rawPrisma.category.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const withSlugs = categories.map((c) => ({ ...c, slug: slugify(c.name) }));
    res.json({ data: withSlugs, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

// Public get items in an inventory collection by slug. Returns published products
// linked to items in the collection. Used by the storefront collection page.
websiteRouter.get('/collections/:slug/items', async (req, res, next) => {
  try {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const tenantId = await tenantFromQueryOrFirst(req);

    // Find the collection by slug
    const collection = await rawPrisma.collection.findFirst({
      where: { tenantId, slug },
    });
    if (!collection) {
      res.status(404).json({ error: { message: 'Collection not found' } });
      return;
    }

    // Get all items in this collection
    const itemCollections = await rawPrisma.itemCollection.findMany({
      where: { tenantId, collectionId: collection.id },
      select: { itemId: true },
    });
    const itemIds = itemCollections.map((ic) => ic.itemId);

    // For each item, find the published product linked to it
    const products = await rawPrisma.product.findMany({
      where: {
        tenantId,
        isPublished: true,
        linkedItemId: { in: itemIds },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        linkedItem: {
          select: {
            sku: true,
            categoryId: true,
            status: true,
            isSerialized: true,
            quantityOnHand: true,
            gender: true,
            makingChargeMode: true,
            makingChargePerGramPaise: true,
            category: { select: { metalType: true } },
          },
        },
      },
    });

    // Compute a single `inStock` boolean per product
    const enriched = products.map((p) => {
      const { linkedItem, ...rest } = p;
      let inStock = true;
      if (linkedItem) {
        const isSerializedSold = linkedItem.isSerialized && linkedItem.status !== 'IN_STOCK';
        const lotEmpty = !linkedItem.isSerialized && linkedItem.quantityOnHand <= 0;
        inStock = !(isSerializedSold || lotEmpty);
      }
      return {
        ...rest,
        // Use the linked item's current category (the back-office source of
        // truth) so recategorising an item moves it on the storefront
        // immediately, even if the Product mirror's own categoryId is stale.
        categoryId: linkedItem?.categoryId ?? rest.categoryId,
        inStock,
        gender: linkedItem?.gender ?? rest.gender ?? null,
        sku: linkedItem?.sku ?? null,
        metalType: linkedItem?.category?.metalType ?? null,
        makingChargeMode: linkedItem?.makingChargeMode ?? null,
        makingChargePerGramPaise: linkedItem?.makingChargePerGramPaise ?? null,
      };
    });

    res.json({ data: enriched, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

// Public list of inventory Collections (curated cross-category groupings) for
// the storefront "Shop by Collection" menu. Only collections that contain at
// least one published product are returned, so the menu never links to an
// empty page. Items within a collection are fetched via /collections/:slug/items.
/** Human offer text for a coupon, e.g. "10% off" / "₹500 off" / "Buy 2 Get 1 free". */
function couponOfferLabel(c: {
  type: string;
  valueBps: number;
  valuePaise: number;
  bxgyJson: unknown;
}): string {
  switch (c.type) {
    case 'PERCENT':
      return `${Math.round(c.valueBps / 100)}% off`;
    case 'FIXED':
      return `₹${Math.round(c.valuePaise / 100).toLocaleString('en-IN')} off`;
    case 'FREE_SHIPPING':
      return 'Free shipping';
    case 'FIRST_ORDER':
      // FIRST_ORDER carries either a % or a flat amount — whichever is set.
      return c.valueBps > 0
        ? `${Math.round(c.valueBps / 100)}% off your first order`
        : `₹${Math.round(c.valuePaise / 100).toLocaleString('en-IN')} off your first order`;
    case 'BXGY': {
      const b = (c.bxgyJson ?? {}) as { buyQty?: number; getQty?: number };
      if (b.buyQty && b.getQty) return `Buy ${b.buyQty} Get ${b.getQty} free`;
      return 'Buy X Get Y free';
    }
    default:
      return 'Offer';
  }
}

// Coupons to advertise in the storefront announcement bar.
//
// Gated on `showOnStorefront`, NOT on `isActive` alone: active only means
// redeemable, and private codes (a goodwill code for one customer, a partner
// code) are active too. Publishing is an explicit per-coupon opt-in in
// Website → Coupons.
//
// We also re-check everything that would make a code fail at the till — expiry,
// not-yet-started, exhausted usage limit — because advertising a code that
// errors on redemption is worse than advertising nothing.
websiteRouter.get('/coupons', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const now = new Date();
    const rows = await rawPrisma.couponCode.findMany({
      where: {
        tenantId,
        showOnStorefront: true,
        isActive: true,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        code: true,
        type: true,
        valueBps: true,
        valuePaise: true,
        minCartPaise: true,
        validUntil: true,
        usageLimitTotal: true,
        usageCount: true,
        bxgyJson: true,
      },
      take: 8,
    });
    const data = rows
      // Exhausted codes can't be redeemed — don't advertise them. Prisma can't
      // compare two columns in `where`, so this is filtered here.
      .filter((c) => c.usageLimitTotal == null || c.usageCount < c.usageLimitTotal)
      .map((c) => ({
        code: c.code,
        offerLabel: couponOfferLabel(c),
        minCartPaise: c.minCartPaise,
        validUntil: c.validUntil ? c.validUntil.toISOString() : null,
      }));
    res.json({ data, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

// Collections that have at least one PUBLISHED product, with a live published
// count broken down by metal.
//
// The homepage renders one collections row per jewellery line (Demifine, 9KT
// fine gold, silver), and a Collection is an Item↔Collection M2M with no metal
// of its own — it can legitimately span lines. So we report the published count
// per metal and let each row pick its own; a collection appears in every row it
// actually has stock for.
//
// Metal comes from the linked ITEM's category, not the Product mirror, matching
// how /products resolves it — recategorising an item moves it immediately even
// if the mirror's own categoryId is stale.
websiteRouter.get('/collections-list', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const collections = await rawPrisma.collection.findMany({
      where: {
        tenantId,
        items: { some: { item: { storefrontProduct: { isPublished: true } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        sortOrder: true,
        items: {
          where: { item: { storefrontProduct: { isPublished: true } } },
          select: { item: { select: { category: { select: { metalType: true } } } } },
        },
      },
    });
    const data = collections.map((c) => {
      const countByMetal: Record<string, number> = {};
      for (const ic of c.items) {
        const metal = ic.item.category.metalType;
        countByMetal[metal] = (countByMetal[metal] ?? 0) + 1;
      }
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        sortOrder: c.sortOrder,
        // Live — unlike the CMS tile's stored `count`, which is a frozen
        // snapshot from the last "Sync from Inventory" click and counts
        // unpublished items too.
        publishedCount: c.items.length,
        countByMetal,
      };
    });
    res.json({ data, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

const STOREFRONT_SECTION_VALUES = ['NEW_ARRIVAL', 'BEST_SELLER', 'FEATURED', 'TRENDING', 'DEAL'];

websiteRouter.get('/products', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    // Optional ?section=BEST_SELLER filters to products featured in that
    // homepage section (one product can be in several — still one record).
    const section =
      typeof req.query['section'] === 'string' && STOREFRONT_SECTION_VALUES.includes(req.query['section'])
        ? req.query['section']
        : undefined;
    const products = await rawPrisma.product.findMany({
      where: {
        tenantId,
        isPublished: true,
        ...(section ? { sections: { some: { section: section as never } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      // Pull the linked inventory row (if any) so we can compute live stock
      // for the "Sold out" badge on the storefront card and expose metal type
      // + making charge mode for accurate PDP price breakdown.
      include: {
        linkedItem: {
          select: {
            sku: true,
            categoryId: true,
            status: true,
            isSerialized: true,
            quantityOnHand: true,
            gender: true,
            makingChargeMode: true,
            makingChargePerGramPaise: true,
            category: { select: { metalType: true } },
            diamonds: {
              select: { shape: true, caratWeightX100: true, count: true, sellingPricePaise: true },
            },
            saleItem: SALE_ITEM_CAMPAIGN_SELECT,
          },
        },
      },
    });
    // Compute a single `inStock` boolean per product. Products without a
    // linked Item (legacy, admin-created from the e-commerce tab) default to
    // in-stock — those have no inventory backing in v1, so we can't tell.
    const enriched = products.map((p) => {
      const { linkedItem, ...rest } = p;
      let inStock = true;
      if (linkedItem) {
        const isSerializedSold = linkedItem.isSerialized && linkedItem.status !== 'IN_STOCK';
        const lotEmpty = !linkedItem.isSerialized && linkedItem.quantityOnHand <= 0;
        inStock = !(isSerializedSold || lotEmpty);
      }
      return {
        ...rest,
        // Use the linked item's current category (the back-office source of
        // truth) so recategorising an item moves it on the storefront
        // immediately, even if the Product mirror's own categoryId is stale.
        categoryId: linkedItem?.categoryId ?? rest.categoryId,
        inStock,
        // Target audience — prefer the linked item's value (back-office source
        // of truth), falling back to the mirrored Product column. Powers the
        // storefront "Shop by Gender" filter.
        gender: linkedItem?.gender ?? rest.gender ?? null,
        // SKU from the linked inventory item (null for legacy products)
        sku: linkedItem?.sku ?? null,
        // Expose metalType so the storefront can gate gold vs silver/non-precious
        // price calculations correctly. Null for legacy products without a linked item.
        metalType: linkedItem?.category?.metalType ?? null,
        // Expose making charge mode + per-gram rate so the PDP can compute the
        // correct making charge (percentage of metal value OR flat ₹/g × weight).
        makingChargeMode: linkedItem?.makingChargeMode ?? null,
        makingChargePerGramPaise: linkedItem?.makingChargePerGramPaise ?? null,
        // Customer-facing diamond value (Σ stone selling prices). Already folded
        // into stoneChargePaise on the Product, so it's part of the price; the PDP
        // uses this for a "Diamond value" summary fallback.
        diamondValuePaise: (linkedItem?.diamonds ?? []).reduce(
          (sum, d) => sum + (d.sellingPricePaise ?? 0),
          0,
        ),
        // Per-stone-group detail for the PDP price breakup (carat · count ·
        // value), like the metal block. Only customer-safe fields — never the
        // internal purchase cost. Priced groups only (a value to show).
        diamonds: (linkedItem?.diamonds ?? [])
          .filter((d) => (d.sellingPricePaise ?? 0) > 0)
          .map((d) => ({
            shape: d.shape,
            caratWeightX100: d.caratWeightX100,
            count: d.count,
            valuePaise: d.sellingPricePaise ?? 0,
          })),
        // Season Sale offer (PERCENT / FLAT / BOGO) resolved from the item's
        // active campaign, null when not on sale — lets the PDP + cards render
        // the struck price + offer badge.
        sale: (() => {
          const offer = resolveSaleOffer(linkedItem?.saleItem ?? null);
          return offer
            ? {
                type: offer.type,
                discountBps: offer.discountBps,
                discountFlatPaise: offer.discountFlatPaise,
                bogo: offer.type === 'BOGO',
              }
            : null;
        })(),
      };
    });
    res.json({ data: enriched, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

// Public batch availability check for the storefront cart. Given the cart's
// slugs, returns per slug whether the piece still exists as a PUBLISHED product
// and whether it's currently in stock. The cart uses this to drop pieces that
// were deleted/unpublished from inventory and to badge sold-out pieces —
// without trusting the (edge-cached, capped-at-60) /products listing, which
// can't distinguish "deleted" from "not in the first 60". Always fresh.
websiteRouter.post('/products/availability', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const { slugs } = z
      .object({ slugs: z.array(z.string().min(1).max(200)).max(100) })
      .parse(req.body);
    if (slugs.length === 0) {
      res.json({ data: [] });
      return;
    }
    const products = await rawPrisma.product.findMany({
      where: { tenantId, isPublished: true, slug: { in: slugs } },
      select: {
        slug: true,
        name: true,
        linkedItem: {
          select: { status: true, isSerialized: true, quantityOnHand: true },
        },
      },
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const data = slugs.map((slug) => {
      const p = bySlug.get(slug);
      // Absent from the published set → deleted or unpublished. Not orderable.
      if (!p) return { slug, available: false, inStock: false, name: null };
      // Same in-stock rule the /products listing uses: a serialized piece must
      // be IN_STOCK; a lot must have units left. No linked item = always in
      // stock (marketing-only catalogue entry, no inventory backing).
      let inStock = true;
      const li = p.linkedItem;
      if (li) {
        const soldSerialized = li.isSerialized && li.status !== 'IN_STOCK';
        const lotEmpty = !li.isSerialized && li.quantityOnHand <= 0;
        inStock = !(soldSerialized || lotEmpty);
      }
      return { slug, available: true, inStock, name: p.name };
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// Public Season Sale feed — published products whose linked inventory item is
// in an ACTIVE Season Sale campaign. Each item carries its own campaign's offer
// (PERCENT / FLAT / BOGO), so multiple campaigns show side by side.
websiteRouter.get('/sale-items', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const products = await rawPrisma.product.findMany({
      where: {
        tenantId,
        isPublished: true,
        // Only items whose campaign is currently running.
        linkedItem: { saleItem: { campaign: { isActive: true } } },
      },
      take: 60,
      include: {
        linkedItem: {
          select: {
            sku: true,
            categoryId: true,
            status: true,
            isSerialized: true,
            quantityOnHand: true,
            makingChargeMode: true,
            makingChargePerGramPaise: true,
            category: { select: { metalType: true } },
            saleItem: {
              select: {
                sortOrder: true,
                createdAt: true,
                campaign: {
                  select: { id: true, discountType: true, discountBps: true, discountFlatPaise: true, isActive: true },
                },
              },
            },
          },
        },
      },
    });
    const enriched = products
      .map((p) => {
        const { linkedItem, ...rest } = p;
        let inStock = true;
        if (linkedItem) {
          const isSerializedSold = linkedItem.isSerialized && linkedItem.status !== 'IN_STOCK';
          const lotEmpty = !linkedItem.isSerialized && linkedItem.quantityOnHand <= 0;
          inStock = !(isSerializedSold || lotEmpty);
        }
        const s = linkedItem?.saleItem;
        const offer = resolveSaleOffer(s ?? null);
        return {
          ...rest,
          categoryId: linkedItem?.categoryId ?? rest.categoryId,
          inStock,
          sku: linkedItem?.sku ?? null,
          metalType: linkedItem?.category?.metalType ?? null,
          makingChargeMode: linkedItem?.makingChargeMode ?? null,
          makingChargePerGramPaise: linkedItem?.makingChargePerGramPaise ?? null,
          // This item's campaign offer (null if the campaign was paused between
          // the where-filter and now).
          sale: offer
            ? {
                type: offer.type,
                discountBps: offer.discountBps,
                discountFlatPaise: offer.discountFlatPaise,
                bogo: offer.type === 'BOGO',
              }
            : null,
          _sortOrder: s?.sortOrder ?? 0,
          _addedAt: s?.createdAt ?? rest.createdAt,
        };
      })
      // Sale curators control order via sortOrder; newest-added breaks ties.
      .sort((a, b) => a._sortOrder - b._sortOrder || (a._addedAt < b._addedAt ? 1 : -1))
      .map(({ _sortOrder, _addedAt, ...rest }) => rest);
    res.json({ data: enriched, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

// Public per-product reviews. Reviews live on Orders (not directly on Products)
// so we resolve through OrderItem — any review on an order that included this
// product counts toward the product's review list. Returns:
//   - summary: { avg, count, distribution: { 5: n, 4: n, 3: n, 2: n, 1: n } }
//   - reviews: list of recent reviews with a privacy-redacted customer name
//
// Tenant-scoped via the product lookup; the review query is then filtered to
// the same tenant so a leaked review-id from one tenant can never appear under
// a slug-collision in another (slugs are unique within a tenant, not globally).
websiteRouter.get('/products/:slug/reviews', async (req, res, next) => {
  try {
    const params = z.object({ slug: z.string().min(1) }).parse(req.params);
    const limit = z.coerce.number().int().min(1).max(50).default(20).parse(req.query['limit'] ?? 20);
    const tenantId = await tenantFromQueryOrFirst(req);

    const product = await rawPrisma.product.findFirst({
      where: { tenantId, slug: params.slug, isPublished: true },
      select: { id: true },
    });
    if (!product) {
      res.status(404).json({ error: { message: 'Product not found' } });
      return;
    }

    // Reviews on every order that included this product. The OrderItem
    // -> Order -> OrderReview chain is enforced server-side; we only return
    // reviews whose order is in this tenant (defence-in-depth against
    // slug-collision edge cases).
    const reviewRows = await rawPrisma.orderReview.findMany({
      where: {
        tenantId,
        order: {
          items: { some: { productId: product.id } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        photos: true,
        createdAt: true,
        customer: { select: { name: true, phone: true } },
      },
    });

    // Aggregate stats across ALL reviews for this product (not just the
    // limited slice we return). A separate groupBy keeps the average accurate
    // even when the listing is paginated.
    const allRatings = await rawPrisma.orderReview.groupBy({
      by: ['rating'],
      where: {
        tenantId,
        order: { items: { some: { productId: product.id } } },
      },
      _count: { rating: true },
    });
    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let weighted = 0;
    for (const row of allRatings) {
      const r = row.rating as 1 | 2 | 3 | 4 | 5;
      const c = row._count.rating;
      distribution[r] = c;
      total += c;
      weighted += r * c;
    }
    const avg = total > 0 ? weighted / total : 0;

    // Privacy: render customer name as "First L." + a masked phone tail so
    // a casual reader can't read a phone off the public review. The
    // OrderReviewSheet already promises this to the customer.
    const reviews = reviewRows.map((r) => {
      const parts = (r.customer?.name ?? 'Customer').trim().split(/\s+/);
      const first = parts[0] ?? 'Customer';
      const lastInitial = parts[1]?.[0] ? `${parts[1][0]}.` : '';
      const phoneTail = r.customer?.phone ? r.customer.phone.slice(-4) : '';
      return {
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        photos: r.photos,
        createdAt: r.createdAt,
        author: {
          name: lastInitial ? `${first} ${lastInitial}` : first,
          phoneMasked: phoneTail ? `••• ${phoneTail}` : null,
        },
      };
    });

    res.json({
      data: {
        summary: {
          avg: Math.round(avg * 10) / 10, // one-decimal precision
          count: total,
          distribution,
        },
        reviews,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Per-size pricing helpers — shared by the pricing preview and order endpoints
// so a sized piece is charged off the SELECTED size's weight, not its base.
// ============================================================================

type RateLookup = {
  findRate: (purityCaratX100: number) => number | undefined;
  live22: number | undefined;
  liveSilver: number | undefined;
};

type PriceableProduct = {
  basePricePaise: number;
  fixedPricePaise: number | null;
  stoneChargePaise: number;
  weightMg: number;
  purityCaratX100: number;
  makingChargeBps: number;
  sizes?: unknown;
  linkedItem?: {
    makingChargeMode?: string | null;
    makingChargePerGramPaise?: number | null;
    category?: { metalType?: string | null } | null;
  } | null;
};

// Shape of the `saleItem` include used across the storefront queries — carries
// the item's campaign so we can resolve its effective offer.
type SaleItemCampaign = {
  campaign: {
    id: string;
    discountType: 'PERCENT' | 'FLAT' | 'BOGO' | 'FIXED_PRICE';
    discountBps: number;
    discountFlatPaise: number;
    isActive: boolean;
  } | null;
} | null;

// Prisma select fragment: the item's campaign, for resolving its live offer.
const SALE_ITEM_CAMPAIGN_SELECT = {
  select: {
    campaign: {
      select: { id: true, discountType: true, discountBps: true, discountFlatPaise: true, isActive: true },
    },
  },
} as const;

// The effective offer for an item — its campaign's offer, or null when the item
// isn't in a campaign or the campaign is paused. `campaignId` lets BOGO pair
// only within the same campaign.
function resolveSaleOffer(si: SaleItemCampaign): (SaleOffer & { campaignId: string }) | null {
  const c = si?.campaign;
  if (!c || !c.isActive) return null;
  return {
    type: c.discountType,
    discountBps: c.discountBps,
    discountFlatPaise: c.discountFlatPaise,
    campaignId: c.id,
  };
}

// Sum BOGO free-unit value across many campaigns — pair only within a campaign.
function computeBogoAcrossCampaigns(unitsByCampaign: Map<string, number[]>): number {
  let total = 0;
  for (const units of unitsByCampaign.values()) total += computeBogoDiscountPaise(units);
  return total;
}

// (Sale offer math now lives in shared/sale.ts — applySaleToPrePaise +
// computeBogoDiscountPaise are imported so the storefront and POS strike the
// same price. The per-item offer is resolved from the item's SaleCampaign via
// resolveSaleOffer above.)

// The Product.sizes column is free-form Json; parse it defensively into a typed
// list, dropping any malformed/zero-weight entries.
function parseProductSizes(sizes: unknown): Array<{ label: string; weightMg: number }> {
  if (!Array.isArray(sizes)) return [];
  const out: Array<{ label: string; weightMg: number }> = [];
  for (const s of sizes) {
    if (s && typeof s === 'object') {
      const label = (s as { label?: unknown }).label;
      const weightMg = (s as { weightMg?: unknown }).weightMg;
      if (typeof label === 'string' && typeof weightMg === 'number' && weightMg > 0) {
        out.push({ label, weightMg });
      }
    }
  }
  return out;
}

function productHasSizes(p: { sizes?: unknown }): boolean {
  return parseProductSizes(p.sizes).length > 0;
}

// Weight to price a line at: the selected size's weight when sized and a
// matching label is supplied, otherwise the base weight.
function resolveLineWeightMg(p: { weightMg: number; sizes?: unknown }, sizeLabel?: string | null): number {
  if (!sizeLabel) return p.weightMg;
  const match = parseProductSizes(p.sizes).find((s) => s.label === sizeLabel);
  return match ? match.weightMg : p.weightMg;
}

// Pre-GST line price (metal value + making + stone) for `weightMg` mg of this
// product. Mirrors the storefront PDP calc. A fixed selling price overrides the
// live-rate calc. Sized fixed-price pieces scale that base linearly by the
// selected size's weight (per-gram from base), so heavier sizes cost
// proportionally more — matching the Add/Edit Item size preview.
function computeLinePricePaise(
  p: PriceableProduct,
  weightMg: number,
  rates: RateLookup,
  offer?: SaleOffer | null,
): number {
  if (p.fixedPricePaise != null) {
    const base =
      productHasSizes(p) && p.weightMg > 0
        ? Math.round((p.fixedPricePaise * weightMg) / p.weightMg)
        : p.fixedPricePaise;
    return applySaleToPrePaise(base, offer);
  }
  const metalType = p.linkedItem?.category?.metalType;
  const isGold = metalType === 'GOLD' || metalType === 'DIAMOND' || metalType == null;
  const isSilver = metalType === 'SILVER';
  // Coerce missing/zero rates to undefined so the `?? fallback` chain behaves
  // the same whether findRate returns 0 or undefined for an absent purity.
  const exactRaw = rates.findRate(p.purityCaratX100);
  const exact = exactRaw && exactRaw > 0 ? exactRaw : undefined;
  const live22 = rates.live22 && rates.live22 > 0 ? rates.live22 : undefined;
  const liveSilver = rates.liveSilver && rates.liveSilver > 0 ? rates.liveSilver : undefined;

  let metalValuePaise = 0;
  if (isGold) {
    const ratePerGramPaise = exact ?? live22 ?? 642000;
    metalValuePaise = exact
      ? Math.round((weightMg * exact) / 1000)
      : Math.round((weightMg * ratePerGramPaise * p.purityCaratX100) / (1000 * 2200));
  } else if (isSilver) {
    metalValuePaise = Math.round((weightMg * (liveSilver ?? 0)) / 1000);
  } else {
    metalValuePaise = p.basePricePaise;
  }

  let making = 0;
  if (p.linkedItem?.makingChargeMode === 'PER_GRAM' && p.linkedItem.makingChargePerGramPaise != null) {
    making = Math.round((p.linkedItem.makingChargePerGramPaise * weightMg) / 1000);
  } else if (p.makingChargeBps > 0 && metalValuePaise > 0) {
    making = Math.round((metalValuePaise * p.makingChargeBps) / 10000);
  }
  return applySaleToPrePaise(metalValuePaise + making + p.stoneChargePaise, offer);
}

// ============================================================================
// Checkout pricing — unified price breakdown with coupon + loyalty
// ============================================================================

const PricingRequestSchema = z.object({
  cart_items: z.array(
    z.object({
      productId: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
      qty: z.number().int().positive().max(99),
      // Selected size label for sized pieces — resolved server-side to that
      // size's weight so the previewed price matches what's charged.
      sizeLabel: z.string().max(24).optional(),
    }).refine((v) => v.productId || v.slug, { message: 'productId or slug required' }),
  ).min(1).max(50),
  coupon_code: z.string().max(60).optional(),
  use_loyalty_points: z.boolean().default(false),
  loyalty_points_amount: z.number().int().positive().optional(),
  customer_phone: IndianPhoneSchema.optional(),
  shipping_paise: z.number().int().min(0).default(0),
});

// POST /website/checkout/pricing
// Computes a full price breakdown for the cart with optional coupon and loyalty.
// Safe to call repeatedly (no mutations). Returns the breakdown for the checkout UI.
websiteRouter.post('/checkout/pricing', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const body = PricingRequestSchema.parse(req.body);

    // Resolve products
    const candidateIds = body.cart_items.map((i) => i.productId).filter((v): v is string => !!v);
    const candidateSlugs = body.cart_items.map((i) => i.slug).filter((v): v is string => !!v);
    const products = await rawPrisma.product.findMany({
      where: {
        tenantId,
        isPublished: true,
        OR: [
          candidateIds.length > 0 ? { id: { in: candidateIds } } : undefined,
          candidateSlugs.length > 0 ? { slug: { in: candidateSlugs } } : undefined,
        ].filter((c): c is NonNullable<typeof c> => c !== undefined),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        basePricePaise: true,
        fixedPricePaise: true,
        stoneChargePaise: true,
        weightMg: true,
        sizes: true,
        purityCaratX100: true,
        makingChargeBps: true,
        categoryId: true,
        linkedItem: {
          select: {
            makingChargeMode: true,
            makingChargePerGramPaise: true,
            category: { select: { metalType: true } },
            saleItem: SALE_ITEM_CAMPAIGN_SELECT,
          },
        },
      },
    });

    const byId = new Map(products.map((p) => [p.id, p]));
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    // Live rates
    const purities = [2400, 2200, 1800, 1400, 0] as const;
    const ratesArray = await Promise.all(purities.map((p) => readGoldRatePaise(p)));
    const findRate = (p: number) => ratesArray[purities.indexOf(p as typeof purities[number])]?.paise ?? 0;
    const rates: RateLookup = { findRate, live22: findRate(2200), liveSilver: findRate(0) };

    // Build resolved lines for coupon service. Price each line off its selected
    // size weight (sized pieces) so the preview matches what's charged, applying
    // each item's own campaign offer. Collect BOGO-eligible units grouped by
    // campaign so the cheaper of each pair is freed within its campaign.
    const cartLines: Array<{ productId: string; qty: number; pricePaise: number; categoryId?: string }> = [];
    const bogoByCampaign = new Map<string, number[]>();
    for (const ci of body.cart_items) {
      const product = (ci.slug && bySlug.get(ci.slug)) || (ci.productId && byId.get(ci.productId)) || null;
      if (!product) continue;
      const offer = resolveSaleOffer(product.linkedItem?.saleItem ?? null);
      const weightMg = resolveLineWeightMg(product, ci.sizeLabel);
      const pricePaise = computeLinePricePaise(product, weightMg, rates, offer);
      cartLines.push({ productId: product.id, qty: ci.qty, pricePaise, categoryId: product.categoryId });
      if (offer?.type === 'BOGO') {
        const units = bogoByCampaign.get(offer.campaignId) ?? [];
        for (let i = 0; i < ci.qty; i += 1) units.push(pricePaise);
        bogoByCampaign.set(offer.campaignId, units);
      }
    }

    const subtotalPaise = cartLines.reduce((s, l) => s + l.pricePaise * l.qty, 0);
    const bogoDiscountPaise = computeBogoAcrossCampaigns(bogoByCampaign);
    const subtotalAfterBogo = Math.max(0, subtotalPaise - bogoDiscountPaise);

    // Resolve customer
    let customerId: string | null = null;
    if (body.customer_phone) {
      const customer = await rawPrisma.customer.findFirst({
        where: { tenantId, phone: body.customer_phone },
        select: { id: true },
      });
      customerId = customer?.id ?? null;
    }

    // Coupon
    let couponDiscountPaise = 0;
    let freeShipping = false;
    let couponMeta: { id: string; code: string; type: string; stackable: boolean } | null = null;
    let couponError: string | null = null;

    if (body.coupon_code) {
      const result = await validateAndComputeCoupon(
        body.coupon_code,
        customerId,
        cartLines,
        // Coupons compute on the post-BOGO amount so a % coupon doesn't discount
        // units the sale already gave away free.
        subtotalAfterBogo,
        tenantId,
      );
      if (result.valid) {
        couponDiscountPaise = result.discountPaise;
        freeShipping = result.freeShipping;
        couponMeta = result.coupon ?? null;
      } else {
        couponError = result.error ?? 'Invalid coupon';
      }
    }

    const subtotalAfterCoupon = Math.max(0, subtotalAfterBogo - couponDiscountPaise);
    const shippingPaise = freeShipping ? 0 : body.shipping_paise;

    // Loyalty — fetch config once, pass to all loyalty functions
    const loyaltyCfg = await fetchLoyaltyConfig(tenantId);
    let loyaltyDiscountPaise = 0;
    let loyaltyPointsUsed = 0;
    let loyaltyBalance = 0;
    let loyaltyError: string | null = null;
    let stackabilityConflict: string | null = null;

    if (customerId) {
      loyaltyBalance = await getBalance(customerId);
    }

    if (body.use_loyalty_points && customerId) {
      // Stackability gate
      if (couponMeta && !couponMeta.stackable) {
        stackabilityConflict = 'This coupon cannot be combined with loyalty points';
      } else {
        const pointsRequested = body.loyalty_points_amount ?? loyaltyBalance;
        const validation = await validateRedemption(customerId, tenantId, pointsRequested, subtotalAfterCoupon, loyaltyCfg);
        if (validation.valid) {
          loyaltyPointsUsed = validation.pointsToUse;
          loyaltyDiscountPaise = validation.discountPaise;
        } else {
          loyaltyError = validation.error ?? 'Cannot redeem points';
        }
      }
    }

    const discountedSubtotal = Math.max(0, subtotalAfterCoupon - loyaltyDiscountPaise);
    const taxPaise = Math.round((discountedSubtotal * 300) / 10_000);
    const totalPaise = discountedSubtotal + taxPaise + shippingPaise;
    const pointsEarnable = computeEarnable(totalPaise - loyaltyDiscountPaise, loyaltyCfg);

    res.json({
      data: {
        subtotalPaise,
        bogoDiscountPaise,
        couponDiscountPaise,
        loyaltyDiscountPaise,
        shippingPaise,
        taxPaise,
        totalPaise,
        pointsEarnable,
        coupon: couponMeta,
        couponError,
        loyalty: customerId
          ? { balance: loyaltyBalance, pointsUsed: loyaltyPointsUsed }
          : null,
        loyaltyError,
        stackabilityConflict,
        breakdown: {
          subtotal: subtotalPaise,
          afterBogo: subtotalAfterBogo,
          afterCoupon: subtotalAfterCoupon,
          afterLoyalty: discountedSubtotal,
          shipping: shippingPaise,
          tax: taxPaise,
          total: totalPaise,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Public storefront checkout. Creates (or reuses by phone) a Customer, then
// builds an Order with line items. Admin's EcommerceAdminPage picks it up
// via the protected /ecommerce/orders endpoint.
// Order line items accept EITHER a productId or a slug — slug takes
// precedence so the client can be immune to stale cached IDs from the
// Vercel-edge-cached /website/products listing. (Pre-fix: client posted
// the cached id, server checked live DB, ID had been recycled by a reseed
// or unpublish → 400 PRODUCT_UNAVAILABLE. With slug we resolve once at
// write time from the fresh DB.)
const OrderItemPublicSchema = z
  .object({
    productId: z.string().min(1).optional(),
    slug: z.string().min(1).max(140).optional(),
    qty: z.number().int().positive().max(99),
    // Selected size label for sized pieces; the server resolves it to that
    // size's weight to price the line. Ignored for single-weight pieces.
    sizeLabel: z.string().max(24).optional(),
  })
  .refine((v) => v.productId || v.slug, { message: 'Either productId or slug is required' });
// Shipping address. Optional in v1 — reserve-at-store and walk-in COD don't
// need it. Required when paymentMethod=razorpay and shippingPaise > 0 (i.e.
// real online courier order).
const ShippingAddressSchema = z.object({
  name: z.string().min(2).max(120),
  phone: IndianPhoneSchema,
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional().default(''),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  pincode: z.string().regex(/^\d{6}$/, 'Indian PIN code is 6 digits'),
});

const OrderCreatePublicSchema = z.object({
  customer: z.object({
    name: z.string().min(2).max(120),
    phone: IndianPhoneSchema,
    // Optional contact extras — captured at checkout when the visitor hasn't
    // already filled them in via /customers/identify. Server persists them
    // on the Customer row if (and only if) the column is still empty, so an
    // admin edit never gets overwritten by a self-service checkout.
    email: z.string().email().max(180).optional(),
  }),
  items: z.array(OrderItemPublicSchema).min(1).max(50),
  paymentMethod: z.enum(['reserve-at-store', 'razorpay', 'cod']).default('reserve-at-store'),
  shippingPaise: z.number().int().min(0).default(0),
  shippingAddress: ShippingAddressSchema.optional(),
  // Free-form note from the visitor (engraving requests, size confirmation,
  // gift wrap instructions). Surfaced to the sales team via the Lead
  // activity timeline + the admin order detail page.
  notes: z.string().max(800).optional(),
  // If true, the shipping address gets saved to the address book so the next
  // checkout pre-fills it. Defaults to true since that's the expected UX.
  saveAddress: z.boolean().default(true),
  // Promotions
  couponCode: z.string().max(60).optional(),
  useLoyaltyPoints: z.boolean().default(false),
  loyaltyPointsAmount: z.number().int().positive().optional(),
});

websiteRouter.post('/orders', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const body = OrderCreatePublicSchema.parse(req.body);

    // Resolve every line item to a live product row. Looking up by BOTH
    // candidate IDs and candidate slugs in a single OR query keeps this at
    // one round trip; the slug branch is the resilient one (cuids in the
    // listing payload can be served stale from the Vercel edge cache).
    const candidateIds = body.items.map((i) => i.productId).filter((v): v is string => !!v);
    const candidateSlugs = body.items.map((i) => i.slug).filter((v): v is string => !!v);
    const products = await rawPrisma.product.findMany({
      where: {
        tenantId,
        isPublished: true,
        OR: [
          candidateIds.length > 0 ? { id: { in: candidateIds } } : undefined,
          candidateSlugs.length > 0 ? { slug: { in: candidateSlugs } } : undefined,
        ].filter((c): c is NonNullable<typeof c> => c !== undefined),
      },
      // Pull the linked inventory Item so the order-create transaction can
      // decrement stock atomically. Products without a linkedItem stay as
      // marketing-only catalog entries — they don't gate the order.
      select: {
        id: true,
        slug: true,
        name: true,
        basePricePaise: true,
        fixedPricePaise: true,
        stoneChargePaise: true,
        weightMg: true,
        sizes: true,
        purityCaratX100: true,
        makingChargeBps: true,
        linkedItem: {
          select: {
            id: true,
            status: true,
            isSerialized: true,
            quantityOnHand: true,
            shopId: true,
            makingChargeMode: true,
            makingChargePerGramPaise: true,
            category: { select: { metalType: true } },
            saleItem: SALE_ITEM_CAMPAIGN_SELECT,
          },
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    // Build a resolved item list — every line carries the canonical id we'll
    // write to OrderItem, plus the selected size label (sized pieces) so we can
    // price + record the line off that size's weight.
    const resolvedItems: Array<{ product: typeof products[number]; qty: number; sizeLabel: string | null }> = [];
    for (const it of body.items) {
      const product = (it.slug && bySlug.get(it.slug)) || (it.productId && byId.get(it.productId)) || null;
      if (!product) {
        res.status(400).json({
          error: {
            code: 'PRODUCT_UNAVAILABLE',
            message: `Product ${it.slug ?? it.productId ?? ''} not available`,
          },
        });
        return;
      }
      resolvedItems.push({ product, qty: it.qty, sizeLabel: it.sizeLabel ?? null });
    }

    // Stock-availability gate. For every line whose Product is linked to an
    // inventory Item, ensure enough units are in stock. Lot rows: must have
    // quantityOnHand >= qty. Serialized rows: must be IN_STOCK and qty == 1
    // (each piece is unique, can only be reserved once). Products without a
    // linked Item (legacy catalog entries) skip this gate — they have no
    // back-of-house counterpart to deplete. Rejecting up front beats letting
    // the order land and then debugging a phantom oversell.
    for (const { product, qty } of resolvedItems) {
      const link = product.linkedItem;
      if (!link) continue; // legacy product without inventory linkage
      if (link.status !== 'IN_STOCK') {
        res.status(409).json({
          error: {
            code: 'OUT_OF_STOCK',
            message: `${product.name} is sold out.`,
          },
        });
        return;
      }
      if (link.isSerialized && qty !== 1) {
        res.status(400).json({
          error: {
            code: 'SERIALIZED_QTY_LIMIT',
            message: `${product.name} is a unique piece — only 1 can be ordered.`,
          },
        });
        return;
      }
      if (!link.isSerialized && link.quantityOnHand < qty) {
        res.status(409).json({
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: `Only ${link.quantityOnHand} of ${product.name} left in stock.`,
          },
        });
        return;
      }
    }

    // Fetch live rates so we can compute the accurate price at checkout
    // just like the storefront product page does.
    const purities = [2400, 2200, 1800, 1400, 0] as const;
    const ratesArray = await Promise.all(purities.map((p) => readGoldRatePaise(p)));
    const rates = purities.map((p, i) => ({ purity: p, ratePerGramPaise: ratesArray[i]?.paise ?? 0 }));
    const findRate = (p: number): number | undefined => rates.find((r) => r.purity === p)?.ratePerGramPaise || undefined;
    const rateLookup: RateLookup = { findRate, live22: findRate(2200), liveSilver: findRate(0) };

    // Price each resolved line off its selected size weight (sized pieces) or
    // the base weight, applying each item's own campaign offer. Keyed per line,
    // not per product — the same product can appear at two different sizes.
    const pricedItems = resolvedItems.map((line) => {
      const offer = resolveSaleOffer(line.product.linkedItem?.saleItem ?? null);
      return {
        ...line,
        offer,
        pricePaise: computeLinePricePaise(
          line.product,
          resolveLineWeightMg(line.product, line.sizeLabel),
          rateLookup,
          offer,
        ),
      };
    });

    const nameById = new Map(products.map((p) => [p.id, p.name]));
    const subtotalPaise = pricedItems.reduce((s, { pricePaise, qty }) => s + pricePaise * qty, 0);

    // ── Buy-1-Get-1 — free the cheaper of each pair WITHIN each BOGO campaign.
    // Applied before coupon/loyalty. ─────────────────────────────────────────
    const bogoByCampaignOrder = new Map<string, number[]>();
    for (const { offer, qty, pricePaise } of pricedItems) {
      if (offer?.type === 'BOGO') {
        const units = bogoByCampaignOrder.get(offer.campaignId) ?? [];
        for (let i = 0; i < qty; i += 1) units.push(pricePaise);
        bogoByCampaignOrder.set(offer.campaignId, units);
      }
    }
    const bogoDiscountPaise = computeBogoAcrossCampaigns(bogoByCampaignOrder);
    const subtotalAfterBogo = Math.max(0, subtotalPaise - bogoDiscountPaise);

    // ── Promotions: coupon then loyalty ──────────────────────────────────────

    // Resolve customer for promotion checks
    const normPhone = body.customer.phone.startsWith('+')
      ? body.customer.phone
      : `+91${body.customer.phone.replace(/\D/g, '').slice(-10)}`;
    const existingForPromo = await rawPrisma.customer.findFirst({
      where: { tenantId, phone: normPhone },
      select: { id: true },
    });
    const promoCustomerId = existingForPromo?.id ?? null;

    // Coupon resolution
    let couponId: string | null = null;
    let couponCodeSnapshot: string | null = null;
    let couponDiscountPaise = 0;
    let effectiveShippingPaise = body.shippingPaise;
    let useLoyaltyPointsEffective = body.useLoyaltyPoints;

    if (body.couponCode) {
      const cartLinesForCoupon = pricedItems.map(({ product, qty, pricePaise }) => ({
        productId: product.id,
        qty,
        pricePaise,
      }));
      const couponResult = await validateAndComputeCoupon(
        body.couponCode,
        promoCustomerId,
        cartLinesForCoupon,
        subtotalAfterBogo,
        tenantId,
      );
      if (!couponResult.valid) {
        res.status(400).json({ error: { code: 'INVALID_COUPON', message: couponResult.error ?? 'Invalid coupon' } });
        return;
      }
      couponId = couponResult.coupon?.id ?? null;
      couponCodeSnapshot = couponResult.coupon?.code ?? null;
      couponDiscountPaise = couponResult.discountPaise;
      if (couponResult.freeShipping) effectiveShippingPaise = 0;

      // Stackability: if coupon is not stackable, loyalty redemption is blocked
      if (!couponResult.stackable) {
        useLoyaltyPointsEffective = false;
      }
    }

    const subtotalAfterCoupon = Math.max(0, subtotalAfterBogo - couponDiscountPaise);

    // Loyalty redemption — use tenant config for configurable rules
    const loyaltyCfgForOrder = await fetchLoyaltyConfig(tenantId);
    let loyaltyPointsUsed = 0;
    let loyaltyDiscountPaise = 0;

    if (useLoyaltyPointsEffective && promoCustomerId) {
      const pointsRequested = body.loyaltyPointsAmount ?? 999_999;
      const validation = await validateRedemption(promoCustomerId, tenantId, pointsRequested, subtotalAfterCoupon, loyaltyCfgForOrder);
      if (validation.valid) {
        loyaltyPointsUsed = validation.pointsToUse;
        loyaltyDiscountPaise = validation.discountPaise;
      }
      // Validation failure at order time is silent — we just skip points rather
      // than blocking the order. The pricing endpoint showed the warning earlier.
    }

    const discountedSubtotal = Math.max(0, subtotalAfterCoupon - loyaltyDiscountPaise);
    const taxPaise = Math.round((discountedSubtotal * 300) / 10_000); // 3% GST on net
    const totalPaise = discountedSubtotal + taxPaise + effectiveShippingPaise;

    // Human-readable interest string for the admin Reservations tab.
    const piecesLabel = resolvedItems
      .map(({ product, qty }) => `${nameById.get(product.id) ?? product.name} × ${qty}`)
      .join(', ');
    const totalLabel = `Total ₹${(totalPaise / 100).toLocaleString('en-IN')}`;
    const interest = `RESERVE: ${piecesLabel} · ${totalLabel} · via cart checkout`.slice(0, 400);

    const order = await runWithTenant({ tenantId }, async () => {
      // Customer must exist before the order can reference it. The findFirst
      // + conditional create is a single round trip in the common (returning)
      // case; we trade strict atomicity for speed since the customer row is
      // idempotent on (tenantId, phone).
      const existing = await rawPrisma.customer.findFirst({
        where: { tenantId, phone: body.customer.phone },
        select: { id: true, email: true },
      });
      const customer =
        existing ??
        (await rawPrisma.customer.create({
          data: {
            tenantId,
            name: body.customer.name,
            phone: body.customer.phone,
            email: body.customer.email ?? null,
            tags: ['Storefront'],
          },
          select: { id: true, email: true },
        }));

      // Backfill email if the existing customer didn't have one. Never
      // overwrite a stored email — that belongs to admin edits.
      if (existing && !existing.email && body.customer.email) {
        await rawPrisma.customer.update({
          where: { id: existing.id },
          data: { email: body.customer.email },
        });
      }

      // Save the typed shipping address to the customer's address book so
      // the next checkout pre-fills it. Idempotent: if an identical address
      // already exists we just mark it default; otherwise we insert and flip
      // the previous default off. Address book updates never touch the
      // Order.shipping* snapshot — that stays frozen at order time.
      if (body.saveAddress && body.shippingAddress) {
        const addr = body.shippingAddress;
        const dupe = await rawPrisma.customerAddress.findFirst({
          where: {
            tenantId,
            customerId: customer.id,
            line1: addr.line1,
            pincode: addr.pincode,
          },
          select: { id: true },
        });
        if (dupe) {
          await rawPrisma.$transaction([
            rawPrisma.customerAddress.updateMany({
              where: { tenantId, customerId: customer.id, isDefault: true, NOT: { id: dupe.id } },
              data: { isDefault: false },
            }),
            rawPrisma.customerAddress.update({
              where: { id: dupe.id },
              data: { isDefault: true, name: addr.name, phone: addr.phone, line2: addr.line2 || null, city: addr.city, state: addr.state },
            }),
          ]);
        } else {
          await rawPrisma.$transaction([
            rawPrisma.customerAddress.updateMany({
              where: { tenantId, customerId: customer.id, isDefault: true },
              data: { isDefault: false },
            }),
            rawPrisma.customerAddress.create({
              data: {
                tenantId,
                customerId: customer.id,
                name: addr.name,
                phone: addr.phone,
                line1: addr.line1,
                line2: addr.line2 || null,
                city: addr.city,
                state: addr.state,
                pincode: addr.pincode,
                isDefault: true,
              },
            }),
          ]);
        }
      }

      // Shiprocket-style default arrival SLA: 5 calendar days from order
      // placement. Admin can override per-order from EcommerceAdminPage; when
      // a real Shiprocket AWB is attached the courier's estimate replaces this.
      const expectedDeliveryAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

      // Single transaction: create the order + decrement linked inventory
      // (lot rows or flip serialized rows to SOLD) + write one SALE
      // ItemMovement per line. If any step throws (e.g. a serialized row was
      // claimed by another concurrent checkout in the milliseconds between
      // our stock-check and this write), the whole order rolls back and the
      // customer sees a clean error instead of a half-landed order with
      // mismatched stock.
      return rawPrisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            tenantId,
            customerId: customer.id,
            status: 'PENDING',
            subtotalPaise,
            shippingPaise: effectiveShippingPaise,
            taxPaise,
            totalPaise,
            paymentMethod: body.paymentMethod,
            // Promotions — snapshot at order time
            bogoDiscountPaise,
            couponId,
            couponCode: couponCodeSnapshot,
            couponDiscountPaise,
            loyaltyPointsUsed,
            loyaltyDiscountPaise,
            // Reserve-at-store and COD start unpaid; Razorpay flows through the
            // verify endpoint to transition to PAID.
            paymentStatus: 'PENDING',
            expectedDeliveryAt,
            // Snapshot the shipping address onto the order so a later customer
            // profile edit doesn't rewrite shipping history.
            shippingName: body.shippingAddress?.name ?? null,
            shippingPhone: body.shippingAddress?.phone ?? null,
            shippingLine1: body.shippingAddress?.line1 ?? null,
            shippingLine2: body.shippingAddress?.line2 || null,
            shippingCity: body.shippingAddress?.city ?? null,
            shippingState: body.shippingAddress?.state ?? null,
            shippingPincode: body.shippingAddress?.pincode ?? null,
            items: {
              create: pricedItems.map(({ product, qty, pricePaise, sizeLabel }) => ({
                productId: product.id,
                qty,
                pricePaise,
                sizeLabel,
              })),
            },
            events: {
              // Surface the customer's free-form note (engraving, size, gift wrap)
              // on the order timeline so the admin sees it without an extra lookup.
              create: [
                {
                  tenantId,
                  status: 'PENDING',
                  note: body.notes ? `Order placed · Note: ${body.notes}` : 'Order placed',
                  actorName: 'System',
                },
              ],
            },
          },
          select: {
            id: true,
            totalPaise: true,
            expectedDeliveryAt: true,
            paymentMethod: true,
            shippingPincode: true,
          },
        });

        // Atomically record coupon usage and deduct loyalty points
        if (couponId) {
          await recordCouponUsageInTx(tx, couponId, created.id, customer.id, tenantId, couponDiscountPaise);
        }
        if (loyaltyPointsUsed > 0) {
          await redeemPointsInTx(tx, customer.id, tenantId, created.id, loyaltyPointsUsed);
        }

        // Decrement the linked inventory rows. Mirrors pos.service.createBill:
        //   serialized: flip status IN_STOCK -> SOLD (one shot per piece)
        //   lot:        decrement quantityOnHand by qty; flip SOLD if drained
        // Writes one SALE ItemMovement per line so item history balances
        // PURCHASE -> SALE on every piece, regardless of channel (POS or
        // storefront).
        for (const { product, qty } of resolvedItems) {
          const link = product.linkedItem;
          if (!link) continue;
          if (link.isSerialized) {
            // Atomic guard: updateMany filtered by IN_STOCK so a concurrent
            // checkout that already grabbed this piece can't double-sell it.
            const result = await tx.item.updateMany({
              where: { id: link.id, status: 'IN_STOCK' },
              data: { status: 'SOLD' },
            });
            if (result.count === 0) {
              // Lost the race — abort the whole transaction so the order
              // never lands without matching stock movement.
              throw new Error(`OUT_OF_STOCK:${product.name}`);
            }
          } else {
            const updated = await tx.item.update({
              where: { id: link.id },
              data: { quantityOnHand: { decrement: qty } },
              select: { quantityOnHand: true },
            });
            if (updated.quantityOnHand < 0) {
              throw new Error(`OUT_OF_STOCK:${product.name}`);
            }
            if (updated.quantityOnHand === 0) {
              await tx.item.update({
                where: { id: link.id },
                data: { status: 'SOLD' },
              });
            }
          }
          await tx.itemMovement.create({
            data: {
              tenantId,
              itemId: link.id,
              type: 'SALE',
              fromShopId: link.shopId,
              qty,
              reason: `Storefront order ${created.id.slice(-6).toUpperCase()}`,
            },
          });
        }

        return created;
      });
    });

    // If the customer chose Razorpay, create the Razorpay Order up front so
    // the client can immediately hand the order_id to Razorpay Checkout. The
    // Order row is already PENDING; we'll flip paymentStatus to PAID once
    // either /payment/verify or the webhook fires.
    let razorpayPayload: {
      keyId: string;
      orderId: string;
      amountPaise: number;
      currency: 'INR';
      simulated: boolean;
    } | null = null;
    if (body.paymentMethod === 'razorpay') {
      const rzpOrder = await createRazorpayOrder({
        amountPaise: order.totalPaise,
        receipt: order.id,
        notes: {
          tenantId,
          customerName: body.customer.name,
          customerPhone: body.customer.phone,
        },
      });
      await rawPrisma.order.update({
        where: { id: order.id },
        data: { razorpayOrderId: rzpOrder.id },
      });
      razorpayPayload = {
        // Public key id is safe to expose; the secret stays server-side.
        keyId: env.RAZORPAY_KEY_ID || 'rzp_test_simulated',
        orderId: rzpOrder.id,
        amountPaise: rzpOrder.amount,
        currency: 'INR',
        simulated: rzpOrder.simulated,
      };
    }

    // Enqueue order-confirmation WhatsApp. Worker handles delivery, retries,
    // and SMS fallback — never block the response on it.
    void enqueueWhatsApp({
      tenantId,
      to: body.customer.phone,
      templateName: env.WHATSAPP_TEMPLATE_RECEIPT,
      variables: {
        name: body.customer.name,
        order_id: `ZL-${order.id.slice(-6).toUpperCase()}`,
        total: `₹${(order.totalPaise / 100).toLocaleString('en-IN')}`,
        eta: order.expectedDeliveryAt?.toLocaleDateString('en-IN') ?? 'shortly',
      },
      customerId: undefined,
    }).catch(() => undefined);

    // If shipping is required AND Shiprocket is configured, fire-and-forget
    // an AWB creation. The worker writes shiprocketAwb + shiprocketTrackingUrl
    // back to the order. Customers see "Booking courier…" until that lands.
    if (body.shippingAddress && body.shippingPaise > 0 && isShiprocketConfigured()) {
      setImmediate(() => {
        void createShiprocketAwb({
          orderId: order.id,
          tenantId,
          customerName: body.customer.name,
          customerPhone: body.customer.phone,
          shipping: body.shippingAddress!,
          items: pricedItems.map(({ product, qty, pricePaise }) => ({
            name: nameById.get(product.id) ?? product.name,
            sku: product.id,
            qty,
            pricePaise,
          })),
          subtotalPaise,
          shippingPaise: body.shippingPaise,
          taxPaise,
          totalPaise,
        }).catch(() => undefined);
      });
    }

    // Fire-and-forget the Lead mirror AFTER the response is queued. Saves one
    // remote round trip on the user-facing path. A failure here was already
    // ignored under the previous design.
    setImmediate(() => {
      void rawPrisma.lead
        .create({
          data: {
            tenantId,
            source: 'store-reservation',
            name: body.customer.name,
            phone: body.customer.phone,
            interest,
            status: 'NEW',
          },
        })
        .catch(() => undefined);
    });

    // Bust the admin caches so the new order appears on the next 5-10s
    // poll instead of waiting for TTL expiry. Fire-and-forget.
    void bustKey(tenantId, 'orders:live-count');
    void bustKey(tenantId, 'orders:list:ALL');
    void bustKey(tenantId, 'orders:list:PENDING');

    res.status(201).json({
      data: {
        id: order.id,
        totalPaise: order.totalPaise,
        expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
        // razorpay block is present only for razorpay-method orders. The
        // client opens the Razorpay Checkout widget with these fields,
        // then calls /orders/:id/payment/verify with the result.
        razorpay: razorpayPayload,
      },
    });
  } catch (err) {
    // Race-condition aborts from the order-create transaction surface as
    // `OUT_OF_STOCK:<product name>` so we can render a clean 409 instead of
    // a generic 500. The transaction already rolled back; nothing else to
    // clean up.
    if (err instanceof Error && err.message.startsWith('OUT_OF_STOCK:')) {
      const name = err.message.slice('OUT_OF_STOCK:'.length);
      res.status(409).json({
        error: {
          code: 'OUT_OF_STOCK',
          message: name
            ? `${name} was just claimed by another shopper. Refresh the cart.`
            : 'One of the pieces in your cart is no longer in stock.',
        },
      });
      return;
    }
    next(err);
  }
});

// Razorpay checkout success → verify signature → mark paid. The client calls
// this from the Razorpay handler.success callback. Idempotent: if the order is
// already PAID (e.g. the webhook beat us) we return the current state without
// rewriting.
const RazorpayVerifyBodySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

websiteRouter.post('/orders/:id/payment/verify', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const orderId = z.string().min(1).parse(req.params.id);
    const body = RazorpayVerifyBodySchema.parse(req.body);

    const order = await rawPrisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tenantId: true, paymentStatus: true, razorpayOrderId: true, totalPaise: true, customer: { select: { phone: true, name: true } } },
    });
    if (!order) {
      res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' } });
      return;
    }
    if (order.razorpayOrderId !== body.razorpayOrderId) {
      res.status(400).json({ error: { code: 'ORDER_MISMATCH', message: 'razorpayOrderId does not match this order' } });
      return;
    }
    if (order.paymentStatus === 'PAID') {
      // Idempotent — webhook may have arrived first.
      res.json({ data: { id: order.id, paymentStatus: 'PAID', alreadyPaid: true } });
      return;
    }

    const valid = verifyCheckoutSignature({
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
    });
    if (!valid) {
      res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed' } });
      return;
    }

    await runWithTenant({ tenantId: order.tenantId }, async () => {
      await rawPrisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          paidAt: new Date(),
          razorpayPaymentId: body.razorpayPaymentId,
          razorpaySignature: body.razorpaySignature,
          status: 'CONFIRMED',
          events: {
            create: [{
              tenantId: order.tenantId,
              status: 'CONFIRMED',
              note: `Payment captured via Razorpay (${body.razorpayPaymentId})`,
              actorName: 'System',
            }],
          },
        },
      });
    });

    void bustKey(order.tenantId, 'orders:live-count');
    void bustKey(order.tenantId, 'orders:list:ALL');
    void bustKey(order.tenantId, 'orders:list:PENDING');

    res.json({ data: { id: order.id, paymentStatus: 'PAID', alreadyPaid: false } });
  } catch (err) {
    next(err);
  }
});

// Public order lookup. Customers paste the order id (or last 6 chars) +
// their phone — we match the order's customerId.phone. Never exposes
// other customers' orders; phone is the auth here.
//
// Always returns the most recent matching order along with its full event
// timeline (oldest first). The 10s-poll redesigned TrackOrderPage rehits
// this endpoint to pick up new events without a refresh.
//
// Override the route-level s-maxage cache: order tracking is per-customer
// and must reflect admin status changes within the poll window. A 60s CDN
// cache would make the live timeline feel dead.
websiteRouter.get('/orders/lookup', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const q = z
      .object({ id: z.string().min(4), phone: z.string().min(10) })
      .parse(req.query);
    const tenantId = await tenantFromQueryOrFirst(req);
    const normPhone = q.phone.startsWith('+') ? q.phone : `+91${q.phone.replace(/\D/g, '').slice(-10)}`;
    const idFragment = q.id.replace(/^ZL-/i, '').trim().toLowerCase();
    const orders = await rawPrisma.order.findMany({
      where: {
        tenantId,
        customer: { phone: normPhone },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: { select: { name: true, slug: true, images: true } } } },
        customer: { select: { name: true, phone: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
      take: 30,
    });
    const matches = orders.filter((o) => o.id.toLowerCase().endsWith(idFragment));
    if (matches.length === 0) {
      res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'No order matched those details' } });
      return;
    }
    res.json({ data: matches[0] });
  } catch (err) {
    next(err);
  }
});

// All orders for a phone — drives the "My Orders" panel on AccountPage.
// Returns lightweight payload (no events, no item-image blobs) so the list
// renders fast even for a phone with 50+ past orders.
//
// `customerId` (when supplied by a signed-in client) is preferred over `phone`
// because it joins on the immutable PK and is therefore immune to phone-format
// mismatches between the signed-in account and the Customer row the order is
// linked to. `/store/track` still uses the phone path — visitors there don't
// have a customerId in hand.
websiteRouter.get('/orders/by-phone', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const q = z
      .object({
        phone: z.string().min(10).optional(),
        customerId: z.string().min(1).optional(),
      })
      .refine((v) => v.phone || v.customerId, {
        message: 'phone or customerId is required',
      })
      .parse(req.query);
    const tenantId = await tenantFromQueryOrFirst(req);
    // Match orders the visitor placed by EITHER the provided customerId
    // (precise — survives phone-format drift) OR the canonical phone match
    // (resilient — survives a stale customerId in localStorage that points
    // at a Customer row deleted by a re-seed). Pre-fix this used customerId
    // *exclusively* when present, so a visitor whose localStorage held the
    // old id would see "No orders yet" even though their orders sat right
    // there in the DB linked via phone.
    //
    // Cross-customer leak isn't a concern: Customer is unique on
    // (tenantId, phone), so the phone branch only ever resolves to the same
    // visitor's row.
    const normPhone = q.phone
      ? q.phone.startsWith('+')
        ? q.phone
        : `+91${q.phone.replace(/\D/g, '').slice(-10)}`
      : null;
    const where =
      q.customerId && normPhone
        ? {
            tenantId,
            OR: [
              { customerId: q.customerId },
              { customer: { phone: normPhone } },
            ],
          }
        : q.customerId
          ? { tenantId, customerId: q.customerId }
          : { tenantId, customer: { phone: normPhone! } };
    const orders = await rawPrisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        totalPaise: true,
        createdAt: true,
        expectedDeliveryAt: true,
        // Payment surface for the My Orders panel — method ('cod' /
        // 'razorpay' / 'reserve-at-store') drives the badge label, status
        // ('PENDING' / 'PAID' / 'FAILED') drives the colour. Customers see
        // these alongside the fulfilment status so they can tell at a glance
        // whether they still owe money on a COD shipment.
        paymentMethod: true,
        paymentStatus: true,
        items: { select: { id: true, qty: true, product: { select: { name: true, images: true } } } },
        // Review (if any) — the AccountPage uses this to render either a
        // "Write a review" CTA (review === null on a DELIVERED order) or a
        // read-only "Reviewed" pill with the customer's rating.
        review: {
          select: { id: true, rating: true, title: true, body: true, photos: true, createdAt: true },
        },
      },
    });
    res.json({ data: orders });
  } catch (err) {
    next(err);
  }
});

// Loyalty-points balance for the signed-in storefront customer, keyed by phone
// (canonical, unique per tenant) with customerId as a fallback. Feeds the
// "Loyalty wallet" card on the account page. Returns the point balance plus its
// rupee-equivalent worth (computed from the tenant's loyalty config) so the UI
// doesn't have to know the point-value rule. Always fresh — private, no-store.
websiteRouter.get('/customers/loyalty', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const q = z
      .object({
        phone: z.string().min(10).optional(),
        customerId: z.string().min(1).optional(),
      })
      .refine((v) => v.phone || v.customerId, {
        message: 'phone or customerId is required',
      })
      .parse(req.query);
    const tenantId = await tenantFromQueryOrFirst(req);
    const normPhone = q.phone
      ? q.phone.startsWith('+')
        ? q.phone
        : `+91${q.phone.replace(/\D/g, '').slice(-10)}`
      : null;
    // Prefer the canonical phone match (Customer is unique on (tenantId, phone));
    // fall back to customerId when no phone was supplied.
    const customer = await rawPrisma.customer.findFirst({
      where: normPhone ? { tenantId, phone: normPhone } : { tenantId, id: q.customerId! },
      select: { loyaltyPoints: true },
    });
    const points = customer?.loyaltyPoints ?? 0;
    const cfg = await fetchLoyaltyConfig(tenantId);
    res.json({
      data: {
        loyaltyPoints: points,
        worthPaise: pointsToPaise(points, cfg),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Customer-authored order review. Phone-authenticated like the rest of the
// storefront — we verify the phone owns the order before accepting the write.
// One review per order (enforced by the unique index on orderId); a second
// POST returns 409. Only DELIVERED orders can be reviewed — anything else
// returns 422 so the customer isn't reviewing a piece they haven't received.
websiteRouter.post('/orders/:id/review', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z
      .object({
        phone: z.string().min(10),
        rating: z.number().int().min(1).max(5),
        title: z.string().trim().max(120).optional(),
        body: z.string().trim().min(4).max(2000),
        photos: z.array(z.string().url()).max(6).optional(),
      })
      .parse(req.body);

    const tenantId = await tenantFromQueryOrFirst(req);
    const normPhone = body.phone.startsWith('+')
      ? body.phone
      : `+91${body.phone.replace(/\D/g, '').slice(-10)}`;

    const order = await rawPrisma.order.findFirst({
      where: { id: params.id, tenantId },
      select: {
        id: true,
        status: true,
        customerId: true,
        customer: { select: { phone: true } },
      },
    });
    if (!order) {
      res.status(404).json({ error: { message: 'Order not found' } });
      return;
    }
    if (order.customer?.phone !== normPhone) {
      // Same shape as /orders/lookup's wrong-phone response — avoid leaking
      // whether the order exists by collapsing into "not found".
      res.status(404).json({ error: { message: 'Order not found' } });
      return;
    }
    if (order.status !== 'DELIVERED') {
      res
        .status(422)
        .json({ error: { message: 'Reviews can be added once the order is delivered.' } });
      return;
    }

    try {
      const review = await rawPrisma.orderReview.create({
        data: {
          tenantId,
          orderId: order.id,
          customerId: order.customerId,
          rating: body.rating,
          title: body.title?.trim() ? body.title.trim() : null,
          body: body.body.trim(),
          photos: body.photos ?? [],
        },
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          photos: true,
          createdAt: true,
        },
      });
      // Invalidate the per-phone listing so the UI picks up the new review
      // on its next 20s poll without a hard refresh. Kept loose-grained — we
      // don't have a phone-keyed cache entry for this list.
      void bustKey(tenantId, `orders:by-phone:${normPhone}`);
      res.status(201).json({ data: review });
    } catch (e) {
      // P2002 = unique violation — they tried to review twice. Return the
      // existing review so the UI can switch to read-only display instead of
      // surfacing an error toast.
      const err = e as { code?: string };
      if (err.code === 'P2002') {
        const existing = await rawPrisma.orderReview.findUnique({
          where: { orderId: order.id },
          select: {
            id: true,
            rating: true,
            title: true,
            body: true,
            photos: true,
            createdAt: true,
          },
        });
        res.status(409).json({
          error: { message: 'This order has already been reviewed.' },
          data: existing,
        });
        return;
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Storefront customer identity, cart, wishlist
// ============================================================================
//
// V1 auth model: phone is the identity. /customers/identify either finds an
// existing Customer row by (tenantId, phone) or creates one, then returns the
// customer + their persisted cart + wishlist. All subsequent cart/wishlist
// mutations require the phone (same convention as /orders/lookup).
//
// This deliberately omits a session cookie / OTP — for a small jeweller the
// threat is low and the friction would tank conversion. Upgrade path: layer
// a JWT cookie on top of /identify without changing the data model.

const CustomerIdentifySchema = z.object({
  phone: IndianPhoneSchema,
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().max(180).optional(),
  // Optional 6-digit Indian pincode — captured at signup so the storefront
  // knows where to ship and the sales team knows where the lead lives.
  // Stored as a tag on the Customer (no dedicated column yet).
  pincode: z.string().regex(/^[1-9][0-9]{5}$/).optional(),
  // ISO date strings (YYYY-MM-DD). Optional, saved only on first capture so
  // we never overwrite a value the admin already corrected.
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  anniversary: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // What action the visitor was trying to take when the auth wall fired.
  // Drives lead-type derivation: a buy-now signup is hotter than a wishlist one.
  intent: z.enum(['buy-now', 'add-to-cart', 'wishlist', 'checkout', 'browse']).optional(),
  // Free-form interest hint, usually the product or collection that triggered
  // the gate. Stored on the Lead.interest column so sales sees the context.
  interest: z.string().max(180).optional(),
  utmSource: z.string().max(64).optional(),
  utmCampaign: z.string().max(64).optional(),
  // Optional bag merge — if the visitor had localStorage items before signing
  // in, we upsert those into the persisted cart so they don't lose work.
  mergeCart: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().positive().max(99) }))
    .max(50)
    .optional(),
  mergeWishlist: z.array(z.object({ productId: z.string().min(1) })).max(50).optional(),
});

// Map storefront intent → initial Lead status + intent tag for the customer.
// "buy-now" / "checkout" are explicit purchase signals → INTERESTED so sales
// sees them at the top of the queue. Add-to-cart and wishlist sit in NEW
// (warm). Browse-only signups stay NEW (cold). Tag is appended to Customer.tags
// so the admin CRM can filter by warmth.
function deriveLeadIntent(intent: string | undefined): {
  status: 'NEW' | 'INTERESTED';
  warmthTag: 'Hot' | 'Warm' | 'Cold';
} {
  switch (intent) {
    case 'buy-now':
    case 'checkout':
      return { status: 'INTERESTED', warmthTag: 'Hot' };
    case 'add-to-cart':
    case 'wishlist':
      return { status: 'NEW', warmthTag: 'Warm' };
    default:
      return { status: 'NEW', warmthTag: 'Cold' };
  }
}

websiteRouter.post('/customers/identify', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const body = CustomerIdentifySchema.parse(req.body);

    // Pull the snapshot of what we'll return at the end + create/upsert the
    // customer row in one go. Wrap in runWithTenant so the Prisma extension
    // injects tenantId on the customer create.
    const result = await runWithTenant({ tenantId }, async () => {
      // The previous findFirst → create flow had a race: two concurrent
      // identify requests (very common — clicking "Buy now" twice, or the
      // browser retrying a slow request) both saw existing == null and then
      // both tried create(), one of which 500'd with a P2002 unique
      // constraint violation on (tenantId, phone). Using upsert with the
      // composite unique key (tenantId, phone) collapses both calls into
      // one row at the DB layer — no race window.
      //
      // The trade-off: upsert always runs the update branch even when the
      // row already had non-placeholder profile data, so we have to look
      // before deciding what to update. The findFirst probe is still
      // needed for that, but we wrap the actual write in a try/catch that
      // re-resolves the existing row on P2002 (concurrent writer beat us
      // to the insert).
      const preExisting = await rawPrisma.customer.findFirst({
        where: { tenantId, phone: body.phone },
      });
      // NB: the Customer model intentionally stores no email — admin POS
      // bills use phone as the canonical contact. Email coming in on the
      // identify payload is kept client-side only (shopSlice.account.email).
      const isNew = !preExisting;
      const intentMeta = deriveLeadIntent(body.intent);
      // Build the tag list for new signups: Storefront source + warmth tag
      // from intent + optional Pin:<6-digit> so the admin CRM can filter by
      // region without a schema migration.
      const newCustomerTags = ['Storefront', intentMeta.warmthTag];
      if (body.pincode) newCustomerTags.push(`Pin:${body.pincode}`);

      let customer: NonNullable<typeof preExisting>;
      if (preExisting) {
        // Existing customer — patch any missing profile fields the visitor
        // just supplied (dob/anniversary), but never overwrite values the
        // admin has already set. Name only gets touched if the existing one
        // is the placeholder "Customer".
        customer = await rawPrisma.customer.update({
          where: { id: preExisting.id },
          data: {
            name:
              preExisting.name && preExisting.name !== 'Customer'
                ? preExisting.name
                : body.name ?? preExisting.name,
            dob: preExisting.dob ?? (body.dob ? new Date(body.dob) : null),
            anniversary:
              preExisting.anniversary ?? (body.anniversary ? new Date(body.anniversary) : null),
            // Append Pin:<code> tag if missing — non-destructive.
            tags:
              body.pincode && !preExisting.tags.includes(`Pin:${body.pincode}`)
                ? [...preExisting.tags, `Pin:${body.pincode}`]
                : preExisting.tags,
          },
        });
      } else {
        try {
          customer = await rawPrisma.customer.create({
            data: {
              tenantId,
              name: body.name ?? 'Customer',
              phone: body.phone,
              dob: body.dob ? new Date(body.dob) : null,
              anniversary: body.anniversary ? new Date(body.anniversary) : null,
              tags: newCustomerTags,
            },
          });
        } catch (err) {
          // P2002 = unique constraint on (tenantId, phone). Lost the race
          // with another concurrent identify call. Re-fetch the winner's
          // row and continue as if we found it on the first pass.
          const code = (err as { code?: string }).code;
          if (code === 'P2002') {
            const winner = await rawPrisma.customer.findFirst({
              where: { tenantId, phone: body.phone },
            });
            if (!winner) throw err; // can't happen but keeps TS happy
            customer = winner;
          } else {
            throw err;
          }
        }
      }

      // Lead creation rules:
      //   • New customer → always create a Lead so the sales team gets a fresh
      //     row in their CRM with the signup context (intent + interest).
      //   • Existing customer + high-intent (buy-now / checkout) → also create
      //     a Lead so the sales team is alerted that a known customer is hot.
      //     Add-to-cart / wishlist / browse on an existing customer is silent —
      //     they already exist in the CRM and we don't want to spam new rows.
      const shouldCreateLead =
        isNew || body.intent === 'buy-now' || body.intent === 'checkout';
      if (shouldCreateLead) {
        const lead = await rawPrisma.lead.create({
          data: {
            tenantId,
            source: 'storefront',
            customerId: customer.id,
            name: customer.name,
            phone: customer.phone,
            interest: body.interest ?? null,
            status: intentMeta.status,
            utmSource: body.utmSource ?? null,
            utmCampaign: body.utmCampaign ?? null,
          },
        });
        // Activity row gives the salesperson a one-glance reason this lead
        // landed: intent + product/collection context. The admin lead-detail
        // timeline reads from LeadActivity.
        await rawPrisma.leadActivity.create({
          data: {
            leadId: lead.id,
            type: 'storefront_signup',
            notes: [
              body.intent ? `Intent: ${body.intent}` : null,
              body.interest ? `Viewing: ${body.interest}` : null,
              isNew ? 'New signup' : 'Returning customer — re-engaged',
            ]
              .filter(Boolean)
              .join(' · '),
          },
        });
      }

      // Merge localStorage bag → persisted cart. Server-side product lookup
      // validates the product belongs to this tenant + is published, so we
      // never persist a productId the customer doesn't actually have a right
      // to add to a real order.
      if (body.mergeCart && body.mergeCart.length > 0) {
        const ids = body.mergeCart.map((i) => i.productId);
        const valid = await rawPrisma.product.findMany({
          where: { tenantId, id: { in: ids }, isPublished: true },
          select: { id: true },
        });
        const validIds = new Set(valid.map((p) => p.id));
        for (const item of body.mergeCart) {
          if (!validIds.has(item.productId)) continue;
          // Upsert with qty = max(existing, incoming). Mobile-then-desktop
          // pattern: user added 1 on mobile, then added another on desktop;
          // we don't want to silently lose either branch.
          await rawPrisma.cartItem.upsert({
            where: { customerId_productId: { customerId: customer.id, productId: item.productId } },
            create: { tenantId, customerId: customer.id, productId: item.productId, qty: item.qty },
            update: { qty: { set: Math.max(item.qty, 1) } },
          });
        }
      }
      if (body.mergeWishlist && body.mergeWishlist.length > 0) {
        const ids = body.mergeWishlist.map((i) => i.productId);
        const valid = await rawPrisma.product.findMany({
          where: { tenantId, id: { in: ids }, isPublished: true },
          select: { id: true },
        });
        const validIds = new Set(valid.map((p) => p.id));
        for (const item of body.mergeWishlist) {
          if (!validIds.has(item.productId)) continue;
          await rawPrisma.wishlistItem.upsert({
            where: { customerId_productId: { customerId: customer.id, productId: item.productId } },
            create: { tenantId, customerId: customer.id, productId: item.productId },
            update: {}, // idempotent — wishlist is a set
          });
        }
      }

      const [cart, wishlist, addresses] = await Promise.all([
        rawPrisma.cartItem.findMany({
          where: { tenantId, customerId: customer.id },
          orderBy: { addedAt: 'desc' },
          include: { product: { select: hydratedProductSelect() } },
        }),
        rawPrisma.wishlistItem.findMany({
          where: { tenantId, customerId: customer.id },
          orderBy: { addedAt: 'desc' },
          include: { product: { select: hydratedProductSelect() } },
        }),
        // Saved address book — default first so the client can prefill the
        // checkout form. Cheap join (indexed on tenantId+customerId).
        rawPrisma.customerAddress.findMany({
          where: { tenantId, customerId: customer.id },
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        }),
      ]);
      return { customer, cart, wishlist, addresses, isNew };
    });

    // Send welcome email to new customers who provided an email (non-blocking)
    if (result.isNew && body.email) {
      const email = body.email; // Capture for closure
      setImmediate(async () => {
        try {
          const tenant = await rawPrisma.tenant.findUnique({
            where: { id: tenantId },
            select: { businessName: true },
          });
          if (tenant) {
            const storeUrl: string = env.APP_BASE_URL || 'https://app.zehlora.com';
            const emailHTML = getCustomerWelcomeEmailHTML({
              recipientName: result.customer.name,
              businessName: tenant.businessName,
              storeUrl,
            });

            const sent = await sendEmail({
              to: email,
              subject: `Welcome to ${tenant.businessName} on Zehlora! 💎`,
              html: emailHTML,
              text: `Welcome ${result.customer.name}! Thanks for joining ${tenant.businessName} on Zehlora. Visit ${storeUrl} to explore our jewelry collection.`,
            });

            if (!sent) {
              logger.warn(
                { tenantId, customerId: result.customer.id, email },
                'Customer signup complete but welcome email could not be sent (SMTP may not be configured)',
              );
            }
          }
        } catch (err) {
          logger.error(
            { tenantId, customerId: result.customer.id, email, err },
            'Error sending welcome email to customer',
          );
        }
      });
    }

    res.json({
      data: {
        customer: {
          id: result.customer.id,
          name: result.customer.name,
          phone: result.customer.phone,
          // Customer model has no email column — return null so the client's
          // shopSlice can keep its locally-typed email without confusion.
          email: null as string | null,
        },
        // True when this call created a fresh Customer row. The client uses
        // it to choose between a "Welcome back" toast and a profile-completion
        // nudge after the auth sheet closes.
        isNew: result.isNew,
        cart: result.cart.map(serializeCartItem),
        wishlist: result.wishlist.map(serializeWishlistItem),
        // Saved address book — checkout uses the default to prefill the form
        // so returning customers don't retype line1/city/state every time.
        addresses: result.addresses.map((a) => ({
          id: a.id,
          label: a.label,
          name: a.name,
          phone: a.phone,
          line1: a.line1,
          line2: a.line2,
          city: a.city,
          state: a.state,
          pincode: a.pincode,
          isDefault: a.isDefault,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Shape the storefront cart UI needs: product name + image + price are the
// fields that drive the cart row + wishlist tile.
function hydratedProductSelect(): {
  id: true;
  name: true;
  slug: true;
  images: true;
  basePricePaise: true;
  stoneChargePaise: true;
  weightMg: true;
  purityCaratX100: true;
} {
  return {
    id: true,
    name: true,
    slug: true,
    images: true,
    basePricePaise: true,
    stoneChargePaise: true,
    weightMg: true,
    purityCaratX100: true,
  };
}

// Type guard for product-shaped objects returned by hydratedProductSelect().
// We just need name/image/pricing here — exact Prisma type isn't worth
// importing into route code.
interface HydratedProduct {
  id: string;
  name: string;
  slug: string;
  images: string[];
  basePricePaise: number;
  stoneChargePaise: number;
  weightMg: number;
  purityCaratX100: number;
}
interface CartItemRow {
  id: string;
  productId: string;
  qty: number;
  addedAt: Date;
  product: HydratedProduct;
}
interface WishlistItemRow {
  id: string;
  productId: string;
  addedAt: Date;
  product: HydratedProduct;
}
function serializeCartItem(item: CartItemRow): {
  id: string;
  productId: string;
  qty: number;
  pricePaise: number;
  addedAt: string;
  product: HydratedProduct;
} {
  return {
    id: item.id,
    productId: item.productId,
    qty: item.qty,
    pricePaise: item.product.basePricePaise + item.product.stoneChargePaise,
    addedAt: item.addedAt.toISOString(),
    product: item.product,
  };
}
function serializeWishlistItem(item: WishlistItemRow): {
  id: string;
  productId: string;
  addedAt: string;
  product: HydratedProduct;
} {
  return {
    id: item.id,
    productId: item.productId,
    addedAt: item.addedAt.toISOString(),
    product: item.product,
  };
}

// GET cart for a phone. Same auth model as /orders/lookup — phone is the
// gate. Returns hydrated product details so the client renders immediately
// without a second product fetch.
websiteRouter.get('/cart', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const q = z.object({ phone: IndianPhoneSchema }).parse(req.query);
    const tenantId = await tenantFromQueryOrFirst(req);
    const customer = await rawPrisma.customer.findFirst({
      where: { tenantId, phone: q.phone },
      select: { id: true },
    });
    if (!customer) {
      // No customer yet → empty cart. Don't 404, the client just shows empty.
      res.json({ data: [] });
      return;
    }
    const items = await rawPrisma.cartItem.findMany({
      // tenantId redundant in theory (customer.id was tenant-filtered above)
      // but kept as belt-and-braces — see tenant-check audit H1.
      where: { tenantId, customerId: customer.id },
      orderBy: { addedAt: 'desc' },
      include: { product: { select: hydratedProductSelect() } },
    });
    res.json({ data: items.map(serializeCartItem) });
  } catch (err) {
    next(err);
  }
});

// Upsert cart item. POST body: { phone, productId, qty }. Setting qty=0
// is treated as a delete so the client only needs one mutation primitive.
const CartUpsertSchema = z.object({
  phone: IndianPhoneSchema,
  productId: z.string().min(1),
  qty: z.number().int().min(0).max(99),
});
websiteRouter.post('/cart/items', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const body = CartUpsertSchema.parse(req.body);
    const customer = await rawPrisma.customer.findFirst({
      where: { tenantId, phone: body.phone },
      select: { id: true },
    });
    if (!customer) {
      res.status(404).json({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Sign in before adding to bag' },
      });
      return;
    }
    // Validate the product belongs to this tenant + is published.
    const product = await rawPrisma.product.findFirst({
      where: { tenantId, id: body.productId, isPublished: true },
      select: { id: true },
    });
    if (!product) {
      res.status(400).json({
        error: { code: 'PRODUCT_UNAVAILABLE', message: 'That piece is not available right now' },
      });
      return;
    }
    if (body.qty === 0) {
      await rawPrisma.cartItem.deleteMany({
        where: { tenantId, customerId: customer.id, productId: body.productId },
      });
      res.json({ data: { deleted: true } });
      return;
    }
    // Composite unique key carries (customerId, productId) — customerId was
    // tenant-verified above. Explicit tenantId still on create for defense.
    const upserted = await rawPrisma.cartItem.upsert({
      where: { customerId_productId: { customerId: customer.id, productId: body.productId } },
      create: { tenantId, customerId: customer.id, productId: body.productId, qty: body.qty },
      update: { qty: body.qty },
      include: { product: { select: hydratedProductSelect() } },
    });
    res.json({ data: serializeCartItem(upserted) });
  } catch (err) {
    next(err);
  }
});

// Clear the entire cart for a customer. Used post-checkout from the success
// page (which currently nukes localStorage; we mirror that to the server now).
websiteRouter.delete('/cart', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const q = z.object({ phone: IndianPhoneSchema }).parse(req.query);
    const tenantId = await tenantFromQueryOrFirst(req);
    const customer = await rawPrisma.customer.findFirst({
      where: { tenantId, phone: q.phone },
      select: { id: true },
    });
    if (!customer) {
      res.json({ data: { cleared: true } });
      return;
    }
    await rawPrisma.cartItem.deleteMany({ where: { tenantId, customerId: customer.id } });
    res.json({ data: { cleared: true } });
  } catch (err) {
    next(err);
  }
});

// Wishlist endpoints — mirror the cart trio but no qty.
websiteRouter.get('/wishlist', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const q = z.object({ phone: IndianPhoneSchema }).parse(req.query);
    const tenantId = await tenantFromQueryOrFirst(req);
    const customer = await rawPrisma.customer.findFirst({
      where: { tenantId, phone: q.phone },
      select: { id: true },
    });
    if (!customer) {
      res.json({ data: [] });
      return;
    }
    const items = await rawPrisma.wishlistItem.findMany({
      where: { tenantId, customerId: customer.id },
      orderBy: { addedAt: 'desc' },
      include: { product: { select: hydratedProductSelect() } },
    });
    res.json({ data: items.map(serializeWishlistItem) });
  } catch (err) {
    next(err);
  }
});

const WishlistTogglePayload = z.object({
  phone: IndianPhoneSchema,
  productId: z.string().min(1),
});
websiteRouter.post('/wishlist/items', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const body = WishlistTogglePayload.parse(req.body);
    const customer = await rawPrisma.customer.findFirst({
      where: { tenantId, phone: body.phone },
      select: { id: true },
    });
    if (!customer) {
      res.status(404).json({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Sign in before favouriting' },
      });
      return;
    }
    // Toggle behavior: if it's there, remove. Otherwise add. Mirrors the
    // existing localStorage shopSlice.toggleWishlist semantic. We re-verify
    // tenantId on the existing row before deleting — defence in depth in
    // case the unique (customerId, productId) key ever falls out of sync
    // with the tenant scoping.
    const existing = await rawPrisma.wishlistItem.findUnique({
      where: { customerId_productId: { customerId: customer.id, productId: body.productId } },
    });
    if (existing && existing.tenantId === tenantId) {
      await rawPrisma.wishlistItem.delete({ where: { id: existing.id } });
      res.json({ data: { removed: true } });
      return;
    }
    const product = await rawPrisma.product.findFirst({
      where: { tenantId, id: body.productId, isPublished: true },
      select: { id: true },
    });
    if (!product) {
      res.status(400).json({
        error: { code: 'PRODUCT_UNAVAILABLE', message: 'That piece is not available right now' },
      });
      return;
    }
    const created = await rawPrisma.wishlistItem.create({
      data: { tenantId, customerId: customer.id, productId: body.productId },
      include: { product: { select: hydratedProductSelect() } },
    });
    res.json({ data: serializeWishlistItem(created) });
  } catch (err) {
    next(err);
  }
});

websiteRouter.post('/enquiry', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const body = LeadInputSchema.parse(req.body);
    // Use runWithTenant so the tenant Prisma extension scopes the write correctly.
    const lead = await runWithTenant({ tenantId }, async () => {
      return rawPrisma.lead.create({ data: { ...body, tenantId, status: 'NEW' } });
    });
    res.status(201).json({ data: { id: lead.id } });
  } catch (err) {
    next(err);
  }
});

// Admin: Migrate all local images in storefront content to Cloudinary.
// This endpoint requires authentication via middleware (tenant scope).
// Finds data URLs and local paths, uploads to Cloudinary, updates database.
websiteRouter.post('/migrate-images-to-cloudinary', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const { migrateStorefrontImagesToCloudinary } = await import('../../lib/migrate-images-cloudinary.js');

    res.setHeader('Cache-Control', 'private, no-store');
    const result = await migrateStorefrontImagesToCloudinary(tenantId);

    res.json({
      data: {
        message: 'Image migration completed',
        ...result,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Image migration failed. Check server logs.';
    res.status(500).json({ error: { code: 'MIGRATION_FAILED', message } });
  }
});

// Admin: Sync inventory collections to CMS with dynamic product counts.
// Returns all collections from inventory, including the count of products in each.
// Used by the CMS to populate the "Shop by occasion" section dynamically.
websiteRouter.get('/sync-collections-from-inventory', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    res.setHeader('Cache-Control', 'private, no-store');

    // Fetch all collections for this tenant
    const collections = await rawPrisma.collection.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, description: true, sortOrder: true },
    });

    // For each collection, count the items in it
    const collectionsWithCounts = await Promise.all(
      collections.map(async (col) => {
        const itemCount = await rawPrisma.itemCollection.count({
          where: { tenantId, collectionId: col.id },
        });
        return {
          name: col.name,
          slug: col.slug,
          count: itemCount,
          // Note: img is not included; CMS will use existing image or allow upload
        };
      }),
    );

    res.json({
      data: collectionsWithCounts,
      page: { hasMore: false },
    });
  } catch (err) {
    next(err);
  }
});

// Admin: Auto-sync inventory collections to storefront content.
// Updates shopByOccasion array with collections from inventory.
// Preserves existing images; only syncs name, slug, and product count.
websiteRouter.post('/auto-sync-collections', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    res.setHeader('Cache-Control', 'private, no-store');

    // Fetch all collections with product counts
    const collections = await rawPrisma.collection.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const collectionsWithCounts = await Promise.all(
      collections.map(async (col) => {
        const count = await rawPrisma.itemCollection.count({
          where: { tenantId, collectionId: col.id },
        });
        return {
          name: col.name,
          slug: col.slug,
          count,
        };
      }),
    );

    // Get current storefront content
    const storefront = await rawPrisma.storefrontContent.findUnique({
      where: { tenantId },
    });

    if (!storefront) {
      res.status(404).json({
        error: {
          code: 'STOREFRONT_NOT_FOUND',
          message: 'No storefront content found',
        },
      });
      return;
    }

    const content = storefront.content as any;
    const currentShopByOccasion = content.shopByOccasion ?? [];

    // Merge: preserve images from current data, update name/slug/count from inventory
    const mergedShopByOccasion = collectionsWithCounts.map((invCol) => {
      const existing = currentShopByOccasion.find((sbo: any) => sbo.slug === invCol.slug);
      return {
        name: invCol.name,
        slug: invCol.slug,
        count: invCol.count,
        img: existing?.img || '', // Preserve existing image or empty string
      };
    });

    // Update storefront content
    const updatedContent = {
      ...content,
      shopByOccasion: mergedShopByOccasion,
    };

    await rawPrisma.storefrontContent.update({
      where: { tenantId },
      data: {
        content: updatedContent,
        version: (storefront.version ?? 1) + 1,
      },
    });

    // Bust cache so changes appear immediately
    void bustKey(tenantId, 'storefront-content');

    res.json({
      data: {
        message: 'Collections synced successfully',
        synced: mergedShopByOccasion.length,
        collections: mergedShopByOccasion,
      },
    });
  } catch (err) {
    next(err);
  }
});
