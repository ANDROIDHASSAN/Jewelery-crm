// Admin-side storefront content editor.
// PUT replaces the full content blob; tenant scope comes from auth ALS context.

import { Router } from 'express';
import { StorefrontContentSchema } from '@goldos/shared/schemas';
import { rawPrisma } from '../../lib/prisma.js';
import { getTenantId } from '../../lib/async-context.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { requirePermission } from '../../middleware/require-permission.js';

export const storefrontRouter: Router = Router();

storefrontRouter.get('/', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) throw new UnauthorizedError();
    const row = await rawPrisma.storefrontContent.findUnique({ where: { tenantId } });
    if (!row) {
      res.status(404).json({ error: { code: 'STOREFRONT_NOT_FOUND', message: 'No storefront content yet' } });
      return;
    }
    res.json({ data: { content: row.content, version: row.version, updatedAt: row.updatedAt } });
  } catch (err) {
    next(err);
  }
});

storefrontRouter.put('/', requirePermission('website.write'), async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) throw new UnauthorizedError();
    const userId = req.user?.userId ?? null;
    const content = StorefrontContentSchema.parse(req.body);
    const row = await rawPrisma.storefrontContent.upsert({
      where: { tenantId },
      create: { tenantId, content, updatedBy: userId, version: 1 },
      update: { content, updatedBy: userId, version: { increment: 1 } },
    });
    res.json({ data: { content: row.content, version: row.version, updatedAt: row.updatedAt } });
  } catch (err) {
    next(err);
  }
});
