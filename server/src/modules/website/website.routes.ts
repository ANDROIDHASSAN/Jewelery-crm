// Public website routes — NO auth, NO tenant scope (tenant derived from subdomain in v1.5).
// For now we expose published products + storefront content.

import { Router } from 'express';
import { z } from 'zod';
import { LeadInputSchema, IndianPhoneSchema } from '@goldos/shared/schemas';
import { rawPrisma } from '../../lib/prisma.js';
import { runWithTenant } from '../../lib/async-context.js';
import { resolveCanonicalTenantId } from '../../lib/canonical-tenant.js';
import { readGoldRatePaise } from '../../lib/redis.js';

export const websiteRouter: Router = Router();

// Public GET endpoints are read-mostly + tenant-public — let Vercel's edge cache
// them. `s-maxage` controls CDN cache; `stale-while-revalidate` lets the edge
// serve stale-but-fast while it revalidates in the background. Storefront content
// only changes when an admin clicks Publish (which we can invalidate via webhook
// later); a 60s cache is safe and turns repeat visits into single-digit-ms responses.
websiteRouter.use((req, res, next) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  }
  next();
});

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

// Public live gold/silver rate. Hydrated by the worker from GoldAPI.io once a
// day; we just expose what's in Redis so the storefront ticker, PDP rate pill,
// and homepage rate strip can show today's actual number instead of a stale
// CMS string. No tenant scope — the metal rate is national.
websiteRouter.get('/gold-rate', async (_req, res, next) => {
  try {
    const purities = [2400, 2200, 1800, 1400, 0] as const;
    const rows = await Promise.all(purities.map((p) => readGoldRatePaise(p)));
    res.json({
      data: {
        rates: purities.map((p, i) => ({
          purity: p,
          ratePerGramPaise: rows[i]?.paise ?? 0,
          stale: rows[i]?.stale ?? true,
        })),
        asOf: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

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

// Slugify category names so storefront URLs (/store/collections/<slug>) can
// resolve to a Category row. We don't store slug on the Category model yet
// (v1.5), so derive it deterministically here.
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

websiteRouter.get('/collections', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const categories = await rawPrisma.category.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    const withSlugs = categories.map((c) => ({ ...c, slug: slugifyName(c.name) }));
    res.json({ data: withSlugs, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

websiteRouter.get('/products', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const products = await rawPrisma.product.findMany({
      where: { tenantId, isPublished: true },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    res.json({ data: products, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

// Public storefront checkout. Creates (or reuses by phone) a Customer, then
// builds an Order with line items. Admin's EcommerceAdminPage picks it up
// via the protected /ecommerce/orders endpoint.
const OrderItemPublicSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().positive().max(99),
});
const OrderCreatePublicSchema = z.object({
  customer: z.object({
    name: z.string().min(2).max(120),
    phone: IndianPhoneSchema,
  }),
  items: z.array(OrderItemPublicSchema).min(1).max(50),
  paymentMethod: z.enum(['reserve-at-store', 'razorpay', 'cod']).default('reserve-at-store'),
  shippingPaise: z.number().int().min(0).default(0),
});

websiteRouter.post('/orders', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const body = OrderCreatePublicSchema.parse(req.body);

    // Look up each product to compute the authoritative server-side price.
    // Never trust client-sent paise.
    const productIds = body.items.map((i) => i.productId);
    const products = await rawPrisma.product.findMany({
      where: { tenantId, id: { in: productIds }, isPublished: true },
      select: { id: true, basePricePaise: true, stoneChargePaise: true },
    });
    const priceByProductId = new Map(products.map((p) => [p.id, p.basePricePaise + p.stoneChargePaise]));
    for (const it of body.items) {
      if (!priceByProductId.has(it.productId)) {
        res.status(400).json({ error: { code: 'PRODUCT_UNAVAILABLE', message: `Product ${it.productId} not available` } });
        return;
      }
    }
    const subtotalPaise = body.items.reduce(
      (s, i) => s + (priceByProductId.get(i.productId) ?? 0) * i.qty,
      0,
    );
    const taxPaise = Math.round((subtotalPaise * 300) / 10_000); // 3% GST
    const totalPaise = subtotalPaise + body.shippingPaise + taxPaise;

    // Build a human-readable interest string mirroring the PDP reserve modal so
    // the Reservations tab can parse both the same way (piece · qty · total ·
    // store · visit by).
    const productNames = await rawPrisma.product.findMany({
      where: { tenantId, id: { in: productIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(productNames.map((p) => [p.id, p.name]));
    const piecesLabel = body.items
      .map((i) => `${nameById.get(i.productId) ?? 'Piece'} × ${i.qty}`)
      .join(', ');
    const totalLabel = `Total ₹${(totalPaise / 100).toLocaleString('en-IN')}`;
    const interest = `RESERVE: ${piecesLabel} · ${totalLabel} · via cart checkout`.slice(0, 400);

    const { order } = await runWithTenant({ tenantId }, async () => {
      // Upsert customer by phone.
      const existing = await rawPrisma.customer.findFirst({
        where: { tenantId, phone: body.customer.phone },
      });
      const customer = existing
        ? existing
        : await rawPrisma.customer.create({
            data: {
              tenantId,
              name: body.customer.name,
              phone: body.customer.phone,
              tags: ['Storefront'],
            },
          });

      // Shiprocket-style default arrival SLA: 5 calendar days from order
      // placement. Admin can override per-order from EcommerceAdminPage; when
      // a real Shiprocket AWB is attached the courier's estimate replaces this.
      const expectedDeliveryAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

      const created = await rawPrisma.order.create({
        data: {
          tenantId,
          customerId: customer.id,
          status: 'PENDING',
          subtotalPaise,
          shippingPaise: body.shippingPaise,
          taxPaise,
          totalPaise,
          paymentMethod: body.paymentMethod,
          expectedDeliveryAt,
          items: {
            create: body.items.map((i) => ({
              productId: i.productId,
              qty: i.qty,
              pricePaise: priceByProductId.get(i.productId) ?? 0,
            })),
          },
          // Seed the timeline with the initial PENDING event so the customer
          // tracking page renders something the moment they open it. Without
          // this the new redesigned track page would show an empty list until
          // the first admin transition.
          events: {
            create: [
              {
                tenantId,
                status: 'PENDING',
                note: 'Order placed',
                actorName: 'System',
              },
            ],
          },
        },
        include: { items: true },
      });

      // Also drop a Lead so the admin Reservations tab surfaces this reserve
      // regardless of which "Reserve at store" button (PDP vs cart) was used.
      // Failure here must NOT roll back the order — wrap in try/catch.
      try {
        await rawPrisma.lead.create({
          data: {
            tenantId,
            source: 'store-reservation',
            name: body.customer.name,
            phone: body.customer.phone,
            interest,
            status: 'NEW',
          },
        });
      } catch {
        /* lead-mirror failure shouldn't break checkout */
      }

      return { order: created };
    });

    res.status(201).json({
      data: {
        id: order.id,
        totalPaise: order.totalPaise,
        expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      },
    });
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
websiteRouter.get('/orders/by-phone', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const q = z.object({ phone: z.string().min(10) }).parse(req.query);
    const tenantId = await tenantFromQueryOrFirst(req);
    const normPhone = q.phone.startsWith('+') ? q.phone : `+91${q.phone.replace(/\D/g, '').slice(-10)}`;
    const orders = await rawPrisma.order.findMany({
      where: { tenantId, customer: { phone: normPhone } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        totalPaise: true,
        createdAt: true,
        expectedDeliveryAt: true,
        items: { select: { id: true, qty: true, product: { select: { name: true, images: true } } } },
      },
    });
    res.json({ data: orders });
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
  // Optional bag merge — if the visitor had localStorage items before signing
  // in, we upsert those into the persisted cart so they don't lose work.
  mergeCart: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().positive().max(99) }))
    .max(50)
    .optional(),
  mergeWishlist: z.array(z.object({ productId: z.string().min(1) })).max(50).optional(),
});

websiteRouter.post('/customers/identify', async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const body = CustomerIdentifySchema.parse(req.body);

    // Pull the snapshot of what we'll return at the end + create/upsert the
    // customer row in one go. Wrap in runWithTenant so the Prisma extension
    // injects tenantId on the customer create.
    const result = await runWithTenant({ tenantId }, async () => {
      const existing = await rawPrisma.customer.findFirst({
        where: { tenantId, phone: body.phone },
      });
      // NB: the Customer model intentionally stores no email — admin POS
      // bills use phone as the canonical contact. Email coming in on the
      // identify payload is kept client-side only (shopSlice.account.email).
      const customer = existing
        ? // Lightly patch name if the client passed an updated value and the
          // existing row's name is generic ("Customer"). Never overwrite an
          // already-edited name — that would erase admin edits.
          existing.name && existing.name !== 'Customer'
          ? existing
          : await rawPrisma.customer.update({
              where: { id: existing.id },
              data: { name: body.name ?? existing.name },
            })
        : await rawPrisma.customer.create({
            data: {
              tenantId,
              name: body.name ?? 'Customer',
              phone: body.phone,
              tags: ['Storefront'],
            },
          });

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

      const [cart, wishlist] = await Promise.all([
        rawPrisma.cartItem.findMany({
          where: { customerId: customer.id },
          orderBy: { addedAt: 'desc' },
          include: { product: { select: hydratedProductSelect() } },
        }),
        rawPrisma.wishlistItem.findMany({
          where: { customerId: customer.id },
          orderBy: { addedAt: 'desc' },
          include: { product: { select: hydratedProductSelect() } },
        }),
      ]);
      return { customer, cart, wishlist };
    });

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
        cart: result.cart.map(serializeCartItem),
        wishlist: result.wishlist.map(serializeWishlistItem),
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
      where: { customerId: customer.id },
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
        where: { customerId: customer.id, productId: body.productId },
      });
      res.json({ data: { deleted: true } });
      return;
    }
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
    await rawPrisma.cartItem.deleteMany({ where: { customerId: customer.id } });
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
      where: { customerId: customer.id },
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
    // existing localStorage shopSlice.toggleWishlist semantic.
    const existing = await rawPrisma.wishlistItem.findUnique({
      where: { customerId_productId: { customerId: customer.id, productId: body.productId } },
    });
    if (existing) {
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
