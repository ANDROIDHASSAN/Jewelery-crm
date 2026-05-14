// Worker process — PM2 entry `goldos-worker`. BullMQ consumers + crons.

import { Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { sendWhatsAppTemplate, sendSmsFallback } from '../lib/whatsapp.js';
import { pollMcxAndCache } from '../lib/gold-rate.js';
import { runWithTenant } from '../lib/async-context.js';
import { rawPrisma } from '../lib/prisma.js';
import type { SendWhatsAppJob } from '../lib/queue.js';

// WhatsApp consumer.
new Worker<SendWhatsAppJob>(
  'whatsapp',
  async (job) => {
    const { tenantId, templateName, to, variables, leadId, customerId } = job.data;
    const result = await sendWhatsAppTemplate(to, templateName, variables);
    if (!result.ok && (job.attemptsMade ?? 0) >= 2) {
      // Fall back to SMS after 2 failed WhatsApp attempts.
      const text = `Update from your jeweller — ${Object.values(variables).slice(0, 2).join(' · ')}`;
      const sms = await sendSmsFallback(to, text);
      if (!sms.ok) throw new Error(`SMS fallback failed: ${sms.error}`);
    } else if (!result.ok) {
      throw new Error(result.error ?? 'whatsapp send failed');
    }
    // Audit + WhatsAppMessage row.
    await runWithTenant({ tenantId }, async () => {
      await rawPrisma.whatsAppMessage.create({
        data: {
          tenantId,
          templateName,
          body: JSON.stringify(variables),
          status: result.ok ? 'SENT' : 'FAILED',
          sentAt: new Date(),
          leadId: leadId ?? null,
          customerId: customerId ?? null,
        },
      });
    });
  },
  { connection: redis, concurrency: 4 },
).on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, '[worker.whatsapp] failed');
});

// Gold rate cron — every 5 minutes.
async function startGoldRateCron(): Promise<void> {
  await pollMcxAndCache();
  setInterval(() => {
    void pollMcxAndCache();
  }, 5 * 60 * 1000);
}

void startGoldRateCron();

logger.info('[worker] started');
