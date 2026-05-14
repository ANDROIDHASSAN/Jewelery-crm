// Public website routes — NO auth, NO tenant scope (tenant derived from subdomain in v1.5).
// For now we expose published products + storefront content.

import { Router } from 'express';
import { z } from 'zod';
import { LeadInputSchema, IndianPhoneSchema } from '@goldos/shared/schemas';
import { rawPrisma } from '../../lib/prisma.js';
import { runWithTenant } from '../../lib/async-context.js';

export const websiteRouter: Router = Router();

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

websiteRouter.get('/collections', async (req, res, next) => {
  try {
    const tenantId = await tenantFromQueryOrFirst(req);
    const categories = await rawPrisma.category.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    res.json({ data: categories, page: { hasMore: false } });
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

    const order = await runWithTenant({ tenantId }, async () => {
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

      return rawPrisma.order.create({
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
    });

    res.status(201).json({ data: { id: order.id, totalPaise: order.totalPaise } });
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
