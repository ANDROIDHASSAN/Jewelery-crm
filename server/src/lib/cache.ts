// Redis-backed tenant-scoped cache (Upstash via the shared ioredis client).
//
// Replaces the in-process Map cache in `finance/finance.cache.ts` for any
// cache that needs to survive a server restart, share across instances, or
// avoid eating Node heap. The Map cache is fine for sub-second hot loops on
// a single process; this one is fine for everything else.
//
// Design principles:
//   1. **Tenant-prefixed keys.** Every key carries the tenant id so a bust
//      of "tenant A" can't accidentally evict "tenant B" data. Required by
//      CLAUDE.md Hard Rule #1 (tenant isolation).
//   2. **JSON in, JSON out.** Callers store anything serialisable; we wrap
//      the encode/decode so the call sites stay clean.
//   3. **Fail-open.** A Redis blip must NOT bring the admin dashboard down.
//      Every read/write swallows the error and logs; callers fall through
//      to the live query.
//   4. **`withCache(key, ttl, fn)` is the only API you should reach for.**
//      It does the read-or-compute-and-write pattern in one call.

import { redis } from './redis.js';
import { logger } from './logger.js';

const KEY_PREFIX = 'cache';

function fullKey(tenantId: string, key: string): string {
  return `${KEY_PREFIX}:${tenantId}:${key}`;
}

/** Read a cached JSON value. Returns null on miss, parse error, or Redis failure. */
export async function readJsonCache<T>(tenantId: string, key: string): Promise<T | null> {
  try {
    const raw = await redis.get(fullKey(tenantId, key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err, key }, '[cache] read failed — falling through');
    return null;
  }
}

/** Write a JSON value with a TTL in seconds. Swallows errors. */
export async function writeJsonCache(
  tenantId: string,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(fullKey(tenantId, key), JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, '[cache] write failed — ignoring');
  }
}

/**
 * Read-or-compute. If `key` is cached, return it. Otherwise call `compute()`,
 * store the result with `ttlSeconds`, and return it.
 *
 * Use for read-heavy endpoints with deterministic output per tenant + arg set.
 * For polling endpoints, pick a TTL slightly under the polling interval so the
 * cache stays warm across polls without ever serving truly-stale data.
 *
 * Example:
 *   const data = await withCache(tenantId, `live-count`, 5, async () => {
 *     return runExpensiveAggregate();
 *   });
 */
export async function withCache<T>(
  tenantId: string,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const cached = await readJsonCache<T>(tenantId, key);
  if (cached !== null) return cached;
  const fresh = await compute();
  // Fire-and-forget the write so the compute path returns to the caller
  // immediately. Even if Redis is slow, the response goes out fast.
  void writeJsonCache(tenantId, key, fresh, ttlSeconds);
  return fresh;
}

/**
 * Drop every cache entry for `tenantId`. Call after a mutation that could
 * invalidate cached aggregates (order placed/updated, bill created, etc.).
 *
 * Uses Redis SCAN to enumerate matching keys — safe for production traffic,
 * unlike KEYS which blocks. Batched DEL keeps the round-trip count low.
 */
export async function bustTenant(tenantId: string): Promise<void> {
  const pattern = `${KEY_PREFIX}:${tenantId}:*`;
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ err, tenantId }, '[cache] tenant bust failed — entries will expire on TTL');
  }
}

/**
 * Drop a single named cache entry for `tenantId`. Cheaper than bustTenant
 * when you know exactly which key to invalidate.
 */
export async function bustKey(tenantId: string, key: string): Promise<void> {
  try {
    await redis.del(fullKey(tenantId, key));
  } catch (err) {
    logger.warn({ err, key }, '[cache] bustKey failed — entry will expire on TTL');
  }
}
