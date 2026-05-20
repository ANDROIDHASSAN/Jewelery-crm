// server/src/index.ts — boot the HTTP server.

import { env } from './env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { syncPermissionCatalog, syncBuiltInRoles } from './lib/seed-permissions.js';
import { pollMcxAndCache } from './lib/gold-rate.js';

async function boot(): Promise<void> {
  // RBAC self-heal: ensure the Permission catalog and built-in roles match
  // what the code expects. Adds new perms/roles on first deploy after a
  // shared/constants.ts change. Never deletes — manual migration owns removals.
  try {
    await syncPermissionCatalog();
    await syncBuiltInRoles();
  } catch (err) {
    logger.error({ err }, '[boot] RBAC sync failed (continuing)');
  }

  // Loud warning if the admin-sentinel bypass is configured in production.
  // It's defence-disabled inside authMiddleware regardless, but its presence
  // means someone may attempt to rely on it — surface that in the boot logs
  // so the operator removes the env var.
  if (env.NODE_ENV === 'production' && env.ADMIN_API_TOKEN) {
    logger.warn(
      { configured: true },
      '[boot] SECURITY: ADMIN_API_TOKEN is set in production. The bypass is hard-disabled in NODE_ENV=production, so it cannot grant access — but the env var should be removed to avoid confusion and lateral-movement risk if NODE_ENV is ever misconfigured.',
    );
  }

  // Hydrate today's gold/silver rate from GoldAPI.io so storefront ticker,
  // POS bills, and dashboard tiles show live numbers. Worker process owns the
  // daily cron in prod, but kicking off at API boot guarantees fresh rates in
  // dev (where only `npm run dev` is typically running) and overwrites any
  // stale seed values primed in Redis. Idempotent — one row per IST day.
  void pollMcxAndCache().catch((err) => {
    logger.error({ err }, '[boot] initial gold-rate poll failed');
  });

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`[boot] Gold OS server listening on :${env.PORT} (${env.NODE_ENV})`);
  });
}

void boot();
