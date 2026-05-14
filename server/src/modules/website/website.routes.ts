// Public website routes — NO auth, NO tenant scope (tenant derived from subdomain in v1.5).
// For now we expose published products + storefront content.

import { Router } from 'express';
import { z } from 'zod';
import { LeadInputSchema, IndianPhoneSchema } from '@goldos/shared/schemas';
import { rawPrisma } from '../../lib/prisma.js';
import { runWithTenant } from '../../lib/async-context.js';

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
// back to the first tenant in the database (single-tenant dev mode).
async function resolveTenant(req: { query: Record<string, unknown> }): Promise<string> {
  const t = req.query['tenant'];
  if (typeof t === 'string' && t.length > 0) return t;
  const first = await rawPrisma.tenant.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (!first) throw new Error('No tenant configured. Run `npm run db:seed`.');
  return first.id;
}

// Resolve tenant from ?tenant= (subdomain support arrives in v1.5). For
// single-tenant deployments, fall back to the first tenant so the public site
// works without query strings.
async function tenantFromQueryOrFirst(req: { query: Record<string, unknown> }): Promise<string> {
  const t = req.query['tenant'];
  if (typeof t === 'string' && t.length > 0) return t;
  const first = await rawPrisma.tenant.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (!first) throw new Error('No tenant configured. Run `npm run db:seed`.');
  return first.id;
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
          items: {
            create: body.items.map((i) => ({
              productId: i.productId,
              qty: i.qty,
              pricePaise: priceByProductId.get(i.productId) ?? 0,
            })),
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

    res.status(201).json({ data: { id: order.id, totalPaise: order.totalPaise } });
  } catch (err) {
    next(err);
  }
});

// Public order lookup. Customers paste the order id (or last 6 chars) +
// their phone — we match the order's customerId.phone. Never exposes
// other customers' orders; phone is the auth here.
websiteRouter.get('/orders/lookup', async (req, res, next) => {
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
