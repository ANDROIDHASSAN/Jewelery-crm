// client/src/features/pos/offline.ts — POS offline bill queue.
//
// Uses Dexie (IndexedDB) so queued bills survive a page reload, a browser
// crash, or a tablet sleep cycle — localStorage would lose them if the disk
// got full or a parallel tab cleared it. IndexedDB is the right primitive
// for transactional POS data; it gives us atomic writes and async access.
//
// Lifecycle per spec (claude/specs/gotchas.md):
//   1. Cashier hits "Save" → bill enqueued with a client-generated
//      idempotencyKey + timestamp. Returns immediately, no network needed.
//   2. Background syncer ticks every 5s when online, drains the queue.
//      Server is idempotent on `Idempotency-Key`, so a duplicate POST is a
//      no-op.
//   3. 422 from server = stock conflict / rejected line; mark rejected so
//      the cashier sees it and re-rings.
//   4. navigator.onLine lies under captive portals; we also ping /health.
//
// The Service Worker (client/public/sw.js) registers a background-sync tag
// so even if the cashier closes the tab, an open browser can still drain the
// queue when connectivity returns.

import Dexie from 'dexie';
import type { Table } from 'dexie';

export type BillStatus = 'pending' | 'syncing' | 'synced' | 'rejected';

export interface QueuedBill {
  /** Auto-incremented PK; the idempotencyKey is what the server dedupes on. */
  id?: number;
  idempotencyKey: string;
  payload: unknown;
  /** ISO timestamp captured at enqueue. */
  createdAt: string;
  status: BillStatus;
  /** Last server-side error captured (only relevant for `rejected`). */
  rejectionReason?: string;
  attempts: number;
}

class PosOfflineDb extends Dexie {
  bills!: Table<QueuedBill, number>;

  constructor() {
    super('goldos-pos-offline');
    this.version(1).stores({
      // [idempotencyKey] is also indexed so we can dedupe before enqueue.
      bills: '++id, &idempotencyKey, status, createdAt',
    });
  }
}

const db = new PosOfflineDb();

export async function enqueueOffline(idempotencyKey: string, payload: unknown): Promise<void> {
  // Dedupe — if the same bill is somehow saved twice (network blip + click),
  // we keep the first record and ignore the duplicate. The server would also
  // dedupe, but we save a round trip.
  const existing = await db.bills.where({ idempotencyKey }).first();
  if (existing) return;
  await db.bills.add({
    idempotencyKey,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
  });
  // Hint the Service Worker to register a background-sync tag, in case the
  // tab gets backgrounded or the device goes offline before our interval ticks.
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    void navigator.serviceWorker.ready.then((reg) => {
      const swReg = reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
      swReg.sync?.register('pos-bill-sync').catch(() => undefined);
    });
  }
}

export async function pendingCount(): Promise<number> {
  return db.bills.where('status').anyOf(['pending', 'syncing']).count();
}

export async function listQueued(): Promise<QueuedBill[]> {
  return db.bills.orderBy('createdAt').toArray();
}

/**
 * Drains every pending bill into the server's idempotent /pos/sync endpoint.
 * Marks status transitions: pending → syncing → synced | rejected.
 * Returns a summary the toast / queue indicator surfaces in the POS shell.
 */
export async function syncPending(): Promise<{ synced: number; rejected: number; remaining: number }> {
  const pending = await db.bills.where('status').anyOf(['pending']).toArray();
  let synced = 0;
  let rejected = 0;
  for (const item of pending) {
    if (item.id == null) continue;
    await db.bills.update(item.id, { status: 'syncing', attempts: item.attempts + 1 });
    try {
      const res = await fetch('/api/v1/pos/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': item.idempotencyKey,
        },
        body: JSON.stringify({ bills: [item.payload] }),
        credentials: 'include',
      });
      if (res.ok) {
        await db.bills.update(item.id, { status: 'synced' });
        synced += 1;
      } else if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        await db.bills.update(item.id, {
          status: 'rejected',
          rejectionReason: body.error?.message ?? 'Server rejected bill (stock or RBAC)',
        });
        rejected += 1;
      } else {
        // 5xx / network error — drop back to pending so the next tick retries.
        await db.bills.update(item.id, { status: 'pending' });
      }
    } catch {
      await db.bills.update(item.id, { status: 'pending' });
    }
  }
  const remaining = await pendingCount();
  return { synced, rejected, remaining };
}

/** Cashier explicitly clears a rejected bill (after re-ringing it). */
export async function discardRejected(id: number): Promise<void> {
  await db.bills.delete(id);
}

/** Clear long-synced bills so the queue doesn't grow forever. Older than 7 days. */
export async function gcSynced(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.bills.where('status').equals('synced').and((b) => b.createdAt < cutoff).delete();
}

/** Returns true if a /health ping succeeds. navigator.onLine alone is not trustworthy. */
export async function isReallyOnline(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const res = await fetch('/api/v1/health', {
      method: 'GET',
      cache: 'no-store',
      // Tight timeout so a captive portal doesn't hang the POS shell.
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Starts a 5-second drain loop. Returns a stop function the POS shell calls
 * on unmount. Only one loop per tab — the Service Worker handles drainage
 * when the tab is closed.
 */
let activeLoop: ReturnType<typeof setInterval> | null = null;

export function startBackgroundSync(): () => void {
  if (activeLoop) return () => undefined;
  const tick = async (): Promise<void> => {
    if (!(await isReallyOnline())) return;
    await syncPending().catch(() => undefined);
  };
  void tick();
  activeLoop = setInterval(() => void tick(), 5000);
  // Drain whenever the tab regains focus / the device comes back online.
  const onOnline = (): void => void tick();
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onOnline);
  return () => {
    if (activeLoop) {
      clearInterval(activeLoop);
      activeLoop = null;
    }
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onOnline);
  };
}
