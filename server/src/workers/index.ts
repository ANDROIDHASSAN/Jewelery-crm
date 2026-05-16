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

// Gold rate cron — once per day at 10:30 AM IST (5:00 UTC). Indian retail
// gold prices change once a day, after IBJA's morning publish around 11 AM IST.
// Polling at 10:30 IST gives a fresh rate before most shops open, and uses
// ~30 of GoldAPI.io's 100 free requests per month with headroom for restarts.
function msUntilNextIstHour(istHour: number, istMinute: number): number {
  // Convert IST target to UTC. IST = UTC+5:30.
  let utcMinute = istMinute - 30;
  let utcHour = istHour - 5;
  if (utcMinute < 0) {
    utcMinute += 60;
    utcHour -= 1;
  }
  if (utcHour < 0) utcHour += 24;

  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, utcMinute, 0, 0),
  );
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

async function startGoldRateCron(): Promise<void> {
  // Always fetch at boot so a fresh restart never leaves the dashboard blank.
  await pollMcxAndCache();

  const scheduleNext = (): void => {
    const ms = msUntilNextIstHour(10, 30);
    setTimeout(async () => {
      try {
        await pollMcxAndCache();
      } catch (err) {
        logger.error({ err }, '[gold-rate] cron tick threw');
      }
      scheduleNext();
    }, ms);
  };
  scheduleNext();
}

void startGoldRateCron();

logger.info('[worker] started');
