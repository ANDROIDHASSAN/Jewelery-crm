// Day 12 — IndexedDB sync queue stub. v1 uses Dexie; this scaffold matches the spec contract.
//
// Per specs/gotchas.md:
//   - bills idempotent on idempotencyKey (server returns original on duplicate)
//   - stock conflicts: server-authoritative → 422 rolls back local bill
//   - navigator.onLine is unreliable → attempt sync ping
//
// Wire Dexie in Day 12 implementation; this module exposes the interface other code uses today.

export interface QueuedBill {
  idempotencyKey: string;
  payload: unknown;
  createdAt: string;
  status: 'pending' | 'synced' | 'rejected';
}

const STORAGE_KEY = 'goldos.posQueue';

function load(): QueuedBill[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as QueuedBill[];
  } catch {
    return [];
  }
}

function save(q: QueuedBill[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
}

export function enqueueOffline(idempotencyKey: string, payload: unknown): void {
  const q = load();
  q.push({ idempotencyKey, payload, createdAt: new Date().toISOString(), status: 'pending' });
  save(q);
}

export function pendingCount(): number {
  return load().filter((b) => b.status === 'pending').length;
}

export async function syncPending(): Promise<{ synced: number; rejected: number }> {
  const q = load();
  let synced = 0;
  let rejected = 0;
  for (const item of q) {
    if (item.status !== 'pending') continue;
    try {
      const res = await fetch('/api/v1/pos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.idempotencyKey },
        body: JSON.stringify({ bills: [item.payload] }),
        credentials: 'include',
      });
      if (res.ok) {
        item.status = 'synced';
        synced += 1;
      } else if (res.status === 422) {
        item.status = 'rejected';
        rejected += 1;
      }
    } catch {
      // network error — stay pending.
    }
  }
  save(q);
  return { synced, rejected };
}

/** Returns true if a /health ping succeeds. navigator.onLine alone is not trustworthy. */
export async function isReallyOnline(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/health', { method: 'GET', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}
