// server/src/lib/redis.ts — single ioredis instance for cache + BullMQ.

import IORedis from 'ioredis';
import { env } from '../env.js';

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export async function readGoldRatePaise(purityCaratX100: number): Promise<{ paise: number; stale: boolean } | null> {
  const raw = await redis.get(`goldrate:${purityCaratX100}`);
  if (!raw) return null;
  const meta = await redis.get('goldrate:meta');
  let stale = false;
  if (meta) {
    try {
      stale = (JSON.parse(meta) as { stale?: boolean }).stale === true;
    } catch {
      stale = true;
    }
  }
  return { paise: Number(raw), stale };
}
