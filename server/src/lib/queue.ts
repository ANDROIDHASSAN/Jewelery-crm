import { Queue, type JobsOptions } from 'bullmq';
import { redis } from './redis.js';

export const whatsappQueue = new Queue('whatsapp', { connection: redis });
export const abandonedCartQueue = new Queue('abandoned-cart', { connection: redis });
export const followupQueue = new Queue('followup', { connection: redis });

export const defaultJobOpts: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

export interface SendWhatsAppJob {
  tenantId: string;
  templateName: string;
  to: string; // E.164
  variables: Record<string, string>;
  leadId?: string;
  customerId?: string;
}

export async function enqueueWhatsApp(payload: SendWhatsAppJob): Promise<void> {
  await whatsappQueue.add('send', payload, defaultJobOpts);
}
