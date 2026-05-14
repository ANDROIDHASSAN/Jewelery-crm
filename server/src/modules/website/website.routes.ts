// Public website routes — NO auth, NO tenant scope (tenant derived from subdomain in v1.5).
// For now we expose published products + storefront content.

import { Router } from 'express';
import { LeadInputSchema } from '@goldos/shared/schemas';
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
