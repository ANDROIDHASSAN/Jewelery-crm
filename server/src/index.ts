// server/src/index.ts — boot the HTTP server.

import { env } from './env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`[boot] Gold OS server listening on :${env.PORT} (${env.NODE_ENV})`);
});
