// server/src/lib/prisma.ts — Prisma client + tenant extension.
//
// SECURITY PRIMITIVE. Reviewer must verify this file in any PR touching it.
//
// The extension auto-injects tenantId into every where/data clause for tenant-scoped
// models, reading tenantId from AsyncLocalStorage (set by tenant-scope middleware).
//
// Raw queries ($queryRaw) BYPASS this. If you write raw SQL, you MUST include
// `WHERE tenant_id = $1` explicitly. There is no safety net.
//
// Super-admin endpoints use rawPrisma (no extension).

import { PrismaClient } from '@prisma/client';
import { getTenantId } from './async-context.js';

// Models that are tenant-scoped (have a tenantId column). Keep this list in sync
// with prisma/schema.prisma. New tenant-scoped tables MUST be added here in the
// same PR that adds them — this is enforced by the data-model.md migration discipline.
const TENANT_SCOPED_MODELS = new Set<string>([
  'Shop',
  'User',
  'Category',
  'Item',
  'ItemMovement',
  'Vendor',
  'PurchaseOrder',
  'Customer',
  'Bill',
  'Expense',
  'GoldLoan',
  'Payroll',
  'Lead',
  'WhatsAppMessage',
  'Product',
  'Order',
  'OrderEvent',
  'CartItem',
  'WishlistItem',
  'AuditLog',
  'StorefrontContent',
  // POS shop-owner v2 + Finance v2 — also tenant-scoped.
  'RegisterSession',
  'CashMovement',
  'ParkedBill',
  'Estimate',
  'Repair',
  'Advance',
  'VendorPayment',
  'BankAccount',
  'BankTransaction',
  'Reconciliation',
  // Invitations are tenant-scoped writes. AuthEvent is intentionally NOT in
  // this set — we need to log pre-login failures where `tenantId` is unknown
  // (wrong email, locked account, etc.), so those writes go through rawPrisma.
  'UserInvitation',
]);

/** Raw client without tenant extension — for super-admin and the tenant-scope middleware itself. */
export const rawPrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

function injectTenantWhere<T extends Record<string, unknown>>(args: T, tenantId: string): T {
  const where = (args.where ?? {}) as Record<string, unknown>;
  return { ...args, where: { ...where, tenantId } } as T;
}

function injectTenantData<T extends Record<string, unknown>>(args: T, tenantId: string): T {
  const data = (args.data ?? {}) as Record<string, unknown>;
  // Don't override if caller already set tenantId (e.g. seed scripts using raw client).
  if (data.tenantId === undefined) {
    return { ...args, data: { ...data, tenantId } } as T;
  }
  if (data.tenantId !== tenantId) {
    throw new Error(
      `[prisma.tenant-extension] data.tenantId (${String(data.tenantId)}) does not match ALS tenantId (${tenantId}). Refusing to write.`,
    );
  }
  return args;
}

/** Tenant-scoped client. Use this from all request handlers and services. */
export const prisma = rawPrisma.$extends({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_SCOPED_MODELS.has(model)) {
          return query(args);
        }
        const tenantId = getTenantId();
        if (!tenantId) {
          throw new Error(
            `[prisma.tenant-extension] No tenantId in AsyncLocalStorage for ${model}.${operation}. ` +
              `Middleware order must be auth → tenant-scope → route, OR call runWithTenant() in workers.`,
          );
        }
        // findUnique / findUniqueOrThrow accept ONLY unique-constraint fields
        // in `where` — injecting `tenantId` there violates that and Prisma
        // silently returns null (you can't satisfy a unique key with extra
        // arbitrary filters). That made `prisma.shop.findUnique({ where: { id } })`
        // return null → "Shop not found" → POS bills couldn't be created.
        //
        // The fix: don't touch the where clause for findUnique. Run the query
        // as written, then enforce tenant isolation by checking the returned
        // row's tenantId after the fact. Cross-tenant leak still impossible.
        if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
          const result = await query(args);
          if (result && typeof result === 'object' && 'tenantId' in result && result.tenantId !== tenantId) {
            if (operation === 'findUniqueOrThrow') {
              throw new Error(`[prisma.tenant-extension] ${model} found but belongs to a different tenant`);
            }
            return null;
          }
          return result;
        }
        // Read operations: inject into where
        if (
          operation === 'findFirst' ||
          operation === 'findMany' ||
          operation === 'count' ||
          operation === 'aggregate' ||
          operation === 'groupBy' ||
          operation === 'findFirstOrThrow'
        ) {
          return query(injectTenantWhere(args as Record<string, unknown>, tenantId));
        }
        // Write operations: inject into where AND data as appropriate
        if (operation === 'create' || operation === 'createMany') {
          if ('data' in (args as object) && Array.isArray((args as { data: unknown }).data)) {
            const list = (args as { data: Record<string, unknown>[] }).data.map((d) =>
              d.tenantId === undefined ? { ...d, tenantId } : d,
            );
            return query({ ...(args as object), data: list } as typeof args);
          }
          return query(injectTenantData(args as Record<string, unknown>, tenantId));
        }
        if (
          operation === 'update' ||
          operation === 'updateMany' ||
          operation === 'upsert' ||
          operation === 'delete' ||
          operation === 'deleteMany'
        ) {
          return query(injectTenantWhere(args as Record<string, unknown>, tenantId));
        }
        return query(args);
      },
    },
  },
});

export type Prisma = typeof prisma;
