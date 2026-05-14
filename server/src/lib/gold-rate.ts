// MCX gold rate poller — writes per-purity keys to Redis. 5-min TTL.
// MCX rate is per 10g — divide by 10 on ingest.

import { redis } from './redis.js';
import { env } from '../env.js';
import { logger } from './logger.js';

interface MCXResponse {
  rates: { purity: string; pricePer10gPaise: number }[];
}

export async function pollMcxAndCache(): Promise<void> {
  try {
    let res: MCXResponse;
    if (!env.MCX_API_KEY) {
      // Dev fallback — stable simulated rates.
      res = {
        rates: [
          { purity: '24K', pricePer10gPaise: 70_00_000 },
          { purity: '22K', pricePer10gPaise: 64_20_000 },
          { purity: '18K', pricePer10gPaise: 52_55_000 },
          { purity: '14K', pricePer10gPaise: 40_85_000 },
          { purity: 'silver', pricePer10gPaise: 84_500 },
        ],
      };
    } else {
      // Real MCX endpoint goes here; out of scope for v1 (spot data is paid).
      res = { rates: [] };
    }
    for (const r of res.rates) {
      const purityX100 =
        r.purity === '24K' ? 2400 : r.purity === '22K' ? 2200 : r.purity === '18K' ? 1800 : r.purity === '14K' ? 1400 : 0;
      const perGram = Math.floor(r.pricePer10gPaise / 10);
      await redis.set(`goldrate:${purityX100}`, String(perGram), 'EX', 360);
    }
    await redis.set('goldrate:meta', JSON.stringify({ asOf: new Date().toISOString(), stale: false }), 'EX', 360);
    logger.info('[gold-rate] cached');
  } catch (err) {
    await redis.set('goldrate:meta', JSON.stringify({ asOf: new Date().toISOString(), stale: true }), 'EX', 3600);
    logger.error({ err }, '[gold-rate] poll failed; flagged stale');
  }
}
