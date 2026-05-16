// server/src/index.ts — boot the HTTP server.

import { env } from './env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { syncPermissionCatalog, syncBuiltInRoles } from './lib/seed-permissions.js';

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

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`[boot] Gold OS server listening on :${env.PORT} (${env.NODE_ENV})`);
  });
}

void boot();
