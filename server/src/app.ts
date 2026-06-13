// server/src/app.ts — Express app factory. Exported so tests can mount it
// via supertest without binding to a port.
//
// Route protection model (post RBAC v2):
//   * Every protected endpoint goes through authMiddleware → tenantScope.
//   * Module-level access is gated here in the mount with requirePermission().
//   * Action-level gates (write/delete/refund) live inside each route file.

import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { env } from './env.js';
import { logger } from './lib/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { tenantScope } from './middleware/tenant-scope.js';
import { apiRateLimit } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import { requirePermission, requireAnyPermission } from './middleware/require-permission.js';
import { securityHeaders } from './middleware/security-headers.js';

import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { rolesRouter } from './modules/roles/roles.routes.js';
import { shopsRouter } from './modules/shops/shops.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { transfersRouter } from './modules/transfers/transfers.routes.js';
import { stockRequestsRouter } from './modules/stock-requests/stock-requests.routes.js';
import { posRouter } from './modules/pos/pos.routes.js';
import { posFeaturesRouter } from './modules/pos/pos-features.routes.js';
import { counterRouter } from './modules/counter/counter.routes.js';
import { financeRouter } from './modules/finance/finance.routes.js';
import { crmRouter } from './modules/crm/crm.routes.js';
import { ecommerceRouter } from './modules/ecommerce/ecommerce.routes.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';
import { websiteRouter } from './modules/website/website.routes.js';
import { storefrontRouter } from './modules/storefront/storefront.routes.js';
import { webhooksRouter } from './modules/webhooks/webhooks.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';

export function createApp(): express.Express {
  const app = express();

  // Trust 1 proxy hop in prod (Nginx).
  app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);

  // Security headers FIRST so every response (including errors) carries them.
  app.use(securityHeaders);

  app.use(compression());

  // Webhook routes need the raw request body to verify HMAC signatures —
  // mount the raw-body parser BEFORE express.json so the JSON middleware
  // doesn't consume the stream. The handlers JSON.parse manually after
  // signature verification passes.
  app.use('/api/v1/webhooks', express.raw({ type: 'application/json', limit: '512kb' }), webhooksRouter);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  const origins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));
  app.use(pinoHttp({ logger }));

  // Health check — never tenant scoped.
  app.get('/api/v1/health', (_req, res) => {
    res.json({ data: { ok: true, env: env.NODE_ENV } });
  });

  // Public auth endpoints (login, refresh, OTP). Authenticated endpoints
  // inside authRouter (me, change-password, 2FA) use authMiddleware inline.
  app.use('/api/v1/auth', authRouter);

  // Public website endpoints (no auth, no tenant scope — tenant derived from
  // subdomain or ?tenant=).
  app.use('/api/v1/website', websiteRouter);

  // Protected: auth → tenant-scope → routes.
  const protectedRouter = express.Router();
  protectedRouter.use(authMiddleware);
  protectedRouter.use(tenantScope);
  protectedRouter.use(apiRateLimit);

  // User + role admin (super admin or anyone with explicit grants).
  protectedRouter.use('/users', usersRouter);
  protectedRouter.use('/roles', rolesRouter);

  // Shop list — readable by ANY authenticated tenant user (the POS, inventory,
  // transfers, and the shop switcher all need to resolve shop names; a POS_USER
  // cashier must see at least their assigned shop or the panel shows "No shop
  // assigned"). Writes are still gated per-route by requirePermission('shops.write').
  protectedRouter.use('/shops', shopsRouter);

  // Inventory: anyone with at least read access can hit the mount; the
  // routes handle further write/delete checks.
  protectedRouter.use(
    '/inventory',
    requireAnyPermission(
      'inventory.read',
      'inventory.write',
      'inventory.delete',
      'inventory.transfer',
      'inventory.wastage',
      'inventory.purchase_order',
    ),
    inventoryRouter,
  );

  // Stock transfer workflow (warehouse <-> shop). Anyone with inventory.read
  // can browse the queue; mutating actions are gated by inventory.transfer
  // inside the router itself.
  protectedRouter.use(
    '/transfers',
    requireAnyPermission('inventory.read', 'inventory.transfer'),
    transfersRouter,
  );

  // Stock requests (replenishment indents). POS cashiers file them
  // (inventory.stock_request); reviewers manage them (inventory.transfer).
  // Per-route gates + shop-scoping live inside the router.
  protectedRouter.use(
    '/stock-requests',
    requireAnyPermission('inventory.read', 'inventory.transfer', 'inventory.stock_request'),
    stockRequestsRouter,
  );

  // POS — two routers, two audiences:
  //   * pos.access:  cashier on the POS subdomain. Can ring up, park bills,
  //                  open/close their till.
  //   * pos.monitor: owner / accountant from the admin panel. READ-ONLY
  //                  window into every shop's POS activity. Cannot write.
  // Action-level gates inside each route file ensure pos.monitor never
  // unlocks bill_create / bill_void / refund / day_open / day_close /
  // cash_drawer / parked_bill / estimate / advance / repair writes.
  protectedRouter.use('/pos', requireAnyPermission('pos.access', 'pos.monitor'), posRouter);
  protectedRouter.use('/pos-x', requireAnyPermission('pos.access', 'pos.monitor'), posFeaturesRouter);
  protectedRouter.use('/counter', requirePermission('pos.monitor'), counterRouter);

  // Finance — gate by either read or any write perm.
  protectedRouter.use(
    '/finance',
    requireAnyPermission(
      'finance.read',
      'finance.expense_write',
      'finance.goldloan_write',
      'finance.payroll_write',
      'finance.ledger_export',
    ),
    financeRouter,
  );

  // CRM
  protectedRouter.use(
    '/crm',
    requireAnyPermission('crm.read', 'crm.write', 'crm.assign', 'crm.whatsapp_send'),
    crmRouter,
  );

  // E-commerce
  protectedRouter.use(
    '/ecommerce',
    requireAnyPermission('ecommerce.read', 'ecommerce.product_write', 'ecommerce.order_fulfil'),
    ecommerceRouter,
  );

  // Analytics
  protectedRouter.use('/analytics', requirePermission('reports.view'), analyticsRouter);

  // Storefront content (CMS)
  protectedRouter.use('/storefront', requireAnyPermission('website.read', 'website.write'), storefrontRouter);

  // Workspace settings — read by anyone with settings.read; writes (PATCH
  // tenant) gated inside the router with settings.write.
  protectedRouter.use(
    '/settings',
    requireAnyPermission('settings.read', 'settings.write'),
    settingsRouter,
  );

  // Uploads helpers. /cloudinary-sign is the only endpoint today; needs auth
  // (any signed-in staffer with inventory.write or ecommerce.product_write
  // can upload product imagery) but no further permission gate so the cashier
  // can also drop in product photos from POS quick-add.
  protectedRouter.use('/uploads', uploadsRouter);

  app.use('/api/v1', protectedRouter);

  app.use(errorHandler);
  return app;
}
