// server/src/lib/async-context.ts — AsyncLocalStorage carrying { tenantId, userId? } per request.
// Read by the Prisma tenant extension; written by tenant-scope middleware and runWithTenant().

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  shopId?: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function getTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

/** Run `fn` with the given tenant scope. Used by workers and tests. */
export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return tenantStorage.run(ctx, fn);
}
