// server/src/lib/metal-rate.ts — resolves the per-gram rates every valuation
// and display surface runs on. Call this; never read `goldrate:*` directly.
//
// PRECEDENCE (gold + silver):
//   1. Live GoldAPI feed, when GOLDAPI_KEY is attached and the cached rate is
//      fresh. The key being present is the signal that the jeweller wants live
//      rates — the feed then wins everywhere.
//   2. The rate typed into Website → Gold rates (CMS). This is the documented
//      fallback for "no API key attached".
//   3. A stale live rate, if one is cached and the CMS is blank. Better than
//      showing nothing; flagged `stale` so the UI can badge it.
//   4. null → callers fall back to the piece's recorded cost.
//
// This INVERTS the pre-existing behaviour, where a CMS string overrode the live
// feed for display. Live now wins when a key is attached.
//
// PLATINUM is CMS-only at every step — GoldAPI serves XAU/XAG and nothing else,
// so there is no platinum feed to prefer.
//
// Gold is quoted and stored at 9K (`goldrate:900`, derived from 24K by the
// poller). Everything downstream scales off that basis — see shared/metal-rate.

import {
  GOLD_RATE_BASIS_PURITY,
  parseRateStringToPaise,
  SILVER_PURITY_SENTINEL,
  type MetalRates,
} from '@goldos/shared/metal-rate';
import { prisma, rawPrisma } from './prisma.js';
import { readGoldRatePaise } from './redis.js';
import { env } from '../env.js';
import { logger } from './logger.js';

/** Where a resolved rate actually came from. Surfaced for badges + debugging. */
export type RateSource = 'live' | 'cms' | 'live-stale' | 'none';

export interface ResolvedMetalRates extends MetalRates {
  goldSource: RateSource;
  silverSource: RateSource;
  platinumSource: RateSource;
  /** True when any displayed rate is a stale live value. */
  stale: boolean;
  /** Editor-typed "as of" label from the CMS; null when blank. */
  cmsUpdatedAt: string | null;
  /** Whether a GOLDAPI_KEY is attached at all. */
  liveFeedConfigured: boolean;
}

interface CmsRates {
  gold9kPaise: number | null;
  silverPaise: number | null;
  platinum950Paise: number | null;
  updatedAt: string | null;
}

const EMPTY_CMS: CmsRates = {
  gold9kPaise: null,
  silverPaise: null,
  platinum950Paise: null,
  updatedAt: null,
};

/**
 * Read + parse the CMS rate fields. Tolerates a missing row and a malformed
 * content blob — a broken CMS must never take valuation down, it just means we
 * have no fallback and callers use cost.
 *
 * `tenantId` is required from unscoped contexts (the public storefront route);
 * inside a tenant-scoped request the extension supplies it.
 */
async function readCmsRates(tenantId?: string): Promise<CmsRates> {
  try {
    const row = tenantId
      ? await rawPrisma.storefrontContent.findUnique({ where: { tenantId } })
      : await prisma.storefrontContent.findFirst({});
    if (!row) return EMPTY_CMS;
    const content = row.content as Record<string, unknown> | null;
    const rates = (content?.['rates'] ?? null) as Record<string, unknown> | null;
    if (!rates) return EMPTY_CMS;
    const str = (k: string): string | null =>
      typeof rates[k] === 'string' ? (rates[k] as string) : null;
    const updatedAt = (str('updatedAt') ?? '').trim();
    return {
      gold9kPaise: parseRateStringToPaise(str('g9')),
      silverPaise: parseRateStringToPaise(str('silver')),
      platinum950Paise: parseRateStringToPaise(str('platinum')),
      updatedAt: updatedAt || null,
    };
  } catch (err) {
    logger.warn({ err, tenantId }, '[metal-rate] CMS rate read failed; continuing without fallback');
    return EMPTY_CMS;
  }
}

/** Apply the precedence ladder for one live-feed-backed metal. */
function pick(
  live: { paise: number; stale: boolean } | null,
  cmsPaise: number | null,
  liveFeedConfigured: boolean,
): { paise: number | null; source: RateSource } {
  if (liveFeedConfigured && live && !live.stale && live.paise > 0) {
    return { paise: live.paise, source: 'live' };
  }
  if (cmsPaise != null) return { paise: cmsPaise, source: 'cms' };
  if (live && live.paise > 0) return { paise: live.paise, source: 'live-stale' };
  return { paise: null, source: 'none' };
}

/**
 * The rates for gold (9K basis), silver, and platinum (Pt 950 basis).
 *
 * Pass `tenantId` when calling from a route with no tenant in AsyncLocalStorage
 * (i.e. the public storefront feed). Omit it inside authenticated requests.
 */
export async function resolveMetalRates(opts: { tenantId?: string } = {}): Promise<ResolvedMetalRates> {
  const liveFeedConfigured = Boolean(env.GOLDAPI_KEY);
  const [live9k, liveSilver, cms] = await Promise.all([
    readGoldRatePaise(GOLD_RATE_BASIS_PURITY),
    readGoldRatePaise(SILVER_PURITY_SENTINEL),
    readCmsRates(opts.tenantId),
  ]);

  const gold = pick(live9k, cms.gold9kPaise, liveFeedConfigured);
  const silver = pick(liveSilver, cms.silverPaise, liveFeedConfigured);

  return {
    gold9kPaise: gold.paise,
    silverPaise: silver.paise,
    // No live platinum feed exists — CMS is the only source, key or no key.
    platinum950Paise: cms.platinum950Paise,
    goldSource: gold.source,
    silverSource: silver.source,
    platinumSource: cms.platinum950Paise != null ? 'cms' : 'none',
    stale: gold.source === 'live-stale' || silver.source === 'live-stale',
    cmsUpdatedAt: cms.updatedAt,
    liveFeedConfigured,
  };
}
