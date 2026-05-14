// Public website routes — NO auth, NO tenant scope (tenant derived from subdomain in v1.5).
// For now we expose published products only.

import { Router } from 'express';
import { z } from 'zod';
import { LeadInputSchema } from '@goldos/shared/schemas';
import { rawPrisma } from '../../lib/prisma.js';
import { runWithTenant } from '../../lib/async-context.js';

export const websiteRouter: Router = Router();

// Day 17 wires per-tenant subdomain resolution; for now require ?tenant= as a dev shim.
function tenantFromQuery(req: { query: Record<string, unknown> }): string {
  const t = req.query['tenant'];
  if (typeof t !== 'string') throw new Error('?tenant= required in dev');
  return t;
}

websiteRouter.get('/collections', async (req, res, next) => {
  try {
    const tenantId = tenantFromQuery(req);
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
    const tenantId = tenantFromQuery(req);
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
    const tenantId = tenantFromQuery(req);
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
