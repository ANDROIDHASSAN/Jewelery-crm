// Gold/silver rate poller — DB-backed, one API call per IST calendar day.
//
// Stores the raw spot rate from GoldAPI.io with no markup. Indian retail vs
// spot delta (import duty, GST, jeweller margin) is the jeweller's business
// and is handled per-tenant via making charges on items/products — NOT baked
// into the metal rate. The same raw rate is used everywhere: POS bill metal
// value, stock valuation, dashboard tiles, storefront product live price.
//
// Flow:
//   1. Compute today's IST date.
//   2. Look up `GoldRateDaily` row for that date.
//   3a. Row exists → hydrate Redis from DB, log "already cached", return.
//   3b. Row missing → call GoldAPI.io once, upsert DB row, hydrate Redis.
//
// Daily call budget is bulletproof against restarts: tsx-watch reloads,
// redeploys, crash-loops, multi-instance races all converge on a single row
// per day (Date is the PK). Target ≈ 30 calls/month.
//
// On API failure: keep Redis as-is, hydrate from the most recent DB row if any,
// flag `stale: true` in meta. No silent dev fallback — staleness must be visible.

import type { GoldRateDaily } from '@prisma/client';
import { rawPrisma } from './prisma.js';
import { redis } from './redis.js';
import { env } from '../env.js';
import { logger } from './logger.js';

const XAU_URL = 'https://www.goldapi.io/api/XAU/INR';
const XAG_URL = 'https://www.goldapi.io/api/XAG/INR';

// 26h TTL — survives a single missed poll. DB is source of truth; Redis is the
// hot-path cache that request handlers read.
const RATE_TTL_SECONDS = 26 * 60 * 60;

interface GoldApiResponse {
  metal: string;
  currency: string;
  price: number;
  price_gram_24k: number;
  price_gram_22k: number;
  price_gram_18k: number;
  price_gram_14k: number;
}

/** Returns the IST calendar date for `d` as a UTC-midnight Date (matches Postgres DATE storage). */
function istCalendarDate(d: Date = new Date()): Date {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

async function fetchPurities(url: string, expectedMetal: 'XAU' | 'XAG'): Promise<GoldApiResponse> {
  const res = await fetch(url, {
    headers: {
      'x-access-token': env.GOLDAPI_KEY,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GoldAPI ${expectedMetal} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as GoldApiResponse;
  if (body.metal !== expectedMetal || body.currency !== 'INR' || !Number.isFinite(body.price_gram_24k)) {
    throw new Error(`GoldAPI ${expectedMetal} payload invalid`);
  }
  return body;
}

/** INR per gram → paise per gram, raw spot (no premium). */
function toPaise(inrPerGram: number): number {
  return Math.round(inrPerGram * 100);
}

async function writeRatesToRedis(row: GoldRateDaily, stale: boolean): Promise<void> {
  const writes: Array<[number, number]> = [
    [2400, row.rate24KPaise],
    [2200, row.rate22KPaise],
    [1800, row.rate18KPaise],
    [1400, row.rate14KPaise],
    [0,    row.silverPaise],
  ];
  for (const [purity, paise] of writes) {
    await redis.set(`goldrate:${purity}`, String(paise), 'EX', RATE_TTL_SECONDS);
  }
  await redis.set(
    'goldrate:meta',
    JSON.stringify({
      asOf: row.fetchedAt.toISOString(),
      date: row.date.toISOString().slice(0, 10),
      stale,
      source: row.source,
      premiumBps: row.premiumBps,
    }),
    'EX',
    RATE_TTL_SECONDS,
  );
}

async function fetchAndPersistToday(today: Date): Promise<GoldRateDaily> {
  const [gold, silver] = await Promise.all([
    fetchPurities(XAU_URL, 'XAU'),
    fetchPurities(XAG_URL, 'XAG'),
  ]);
  // Upsert is idempotent — if another worker raced and won, we no-op on update.
  return rawPrisma.goldRateDaily.upsert({
    where: { date: today },
    create: {
      date: today,
      source: 'goldapi.io',
      premiumBps: 0,
      rate24KPaise: toPaise(gold.price_gram_24k),
      rate22KPaise: toPaise(gold.price_gram_22k),
      rate18KPaise: toPaise(gold.price_gram_18k),
      rate14KPaise: toPaise(gold.price_gram_14k),
      silverPaise:  toPaise(silver.price_gram_24k),
    },
    update: {},
  });
}

// Function name preserved for callers in workers/index.ts. Despite the legacy
// name this no longer touches MCX — it consults the DB and only calls GoldAPI
// when today's row is missing.
export async function pollMcxAndCache(): Promise<void> {
  const today = istCalendarDate();
  const todayKey = today.toISOString().slice(0, 10);

  const existing = await rawPrisma.goldRateDaily.findUnique({ where: { date: today } });
  if (existing) {
    await writeRatesToRedis(existing, false);
    logger.info({ date: todayKey }, '[gold-rate] today already in DB — skipped API call');
    return;
  }

  try {
    const row = await fetchAndPersistToday(today);
    await writeRatesToRedis(row, false);
    logger.info(
      {
        date: todayKey,
        rate24KPaise: row.rate24KPaise,
        rate22KPaise: row.rate22KPaise,
        silverPaise: row.silverPaise,
        premiumBps: row.premiumBps,
      },
      '[gold-rate] fetched + cached',
    );
  } catch (err) {
    // Hydrate Redis from the most recent prior row (if any) so the dashboard
    // doesn't go blank. Flag stale either way.
    const latest = await rawPrisma.goldRateDaily.findFirst({ orderBy: { date: 'desc' } });
    if (latest) {
      await writeRatesToRedis(latest, true);
      logger.error(
        { err, fallbackDate: latest.date.toISOString().slice(0, 10) },
        '[gold-rate] poll failed; serving last DB row, flagged stale',
      );
    } else {
      await redis.set(
        'goldrate:meta',
        JSON.stringify({ asOf: new Date().toISOString(), stale: true, source: 'goldapi.io', error: true }),
        'EX',
        RATE_TTL_SECONDS,
      );
      logger.error({ err }, '[gold-rate] poll failed and no prior DB row to serve');
    }
  }
}
