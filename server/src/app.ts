// server/src/app.ts — Express app factory. Exported so tests can mount it via supertest
// without binding to a port.

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { env } from './env.js';
import { logger } from './lib/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { tenantScope } from './middleware/tenant-scope.js';
import { apiRateLimit } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';

import { authRouter } from './modules/auth/auth.routes.js';
import { shopsRouter } from './modules/shops/shops.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { posRouter } from './modules/pos/pos.routes.js';
import { financeRouter } from './modules/finance/finance.routes.js';
import { crmRouter } from './modules/crm/crm.routes.js';
import { ecommerceRouter } from './modules/ecommerce/ecommerce.routes.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';
import { websiteRouter } from './modules/website/website.routes.js';
import { storefrontRouter } from './modules/storefront/storefront.routes.js';

export function createApp(): express.Express {
  const app = express();

  // Trust 1 proxy hop in prod (Nginx).
  app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  const origins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));
  app.use(pinoHttp({ logger }));

  // Health check — never tenant scoped.
  app.get('/api/v1/health', (_req, res) => {
    res.json({ data: { ok: true, env: env.NODE_ENV } });
  });

  // Public auth endpoints.
  app.use('/api/v1/auth', authRouter);

  // Public website endpoints (no auth, no tenant scope — tenant derived from subdomain or ?tenant=).
  app.use('/api/v1/website', websiteRouter);

  // Protected: auth → tenant-scope → routes.
  const protectedRouter = express.Router();
  protectedRouter.use(authMiddleware);
  protectedRouter.use(tenantScope);
  protectedRouter.use(apiRateLimit);
  protectedRouter.use('/shops', shopsRouter);
  protectedRouter.use('/inventory', inventoryRouter);
  protectedRouter.use('/pos', posRouter);
  protectedRouter.use('/finance', financeRouter);
  protectedRouter.use('/crm', crmRouter);
  protectedRouter.use('/ecommerce', ecommerceRouter);
  protectedRouter.use('/analytics', analyticsRouter);
  protectedRouter.use('/storefront', storefrontRouter);
  app.use('/api/v1', protectedRouter);

  app.use(errorHandler);
  return app;
}
