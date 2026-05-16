// Tiny in-process TTL cache used by Finance summary endpoints. Keyed by
// tenant + scope (e.g. shop id, date range) so the busy dashboard re-fetches
// at most once per minute instead of aggregating on every tile re-render.
// Capped to bound memory; oldest entry evicted past the cap.

type CacheEntry = { value: unknown; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 400;

export function readCache(key: string): unknown | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function writeCache(key: string, value: unknown, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

/** Drop every cache key tied to `tenantId`. Call after any mutation. */
export function bustTenant(tenantId: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(`${tenantId}:`)) cache.delete(key);
  }
}
