// Inventory service — Prisma operations stay tenant-scoped automatically via the extension.

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BusinessRuleError } from '../../lib/errors.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { computeGoldValuePaise } from '../../lib/money.js';
import { getTenantId } from '../../lib/async-context.js';
import type { ItemInput, VendorInput, PurchaseOrderCreate } from '@goldos/shared/types';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export async function listItems(opts: { shopId?: string; categoryId?: string; cursor?: string; limit?: number }) {
  const take = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const items = await prisma.item.findMany({
    where: {
      ...(opts.shopId ? { shopId: opts.shopId } : {}),
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > take;
  const page = items.slice(0, take);
  return { data: page, page: { nextCursor: hasMore ? page.at(-1)?.id : undefined, hasMore } };
}

export async function getItem(id: string) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError();
  return item;
}

export async function createItem(input: ItemInput, performedByUserId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const item = await prisma.item.create({ data: { ...input, tenantId } });
  // Audit + PURCHASE movement on first insert.
  await prisma.itemMovement.create({
    data: {
      tenantId,
      itemId: item.id,
      toShopId: item.shopId,
      type: 'PURCHASE',
      reason: 'Item added to inventory',
      performedByUserId: performedByUserId ?? null,
    },
  });
  void writeAudit('Item', item.id, 'CREATE', null, item, performedByUserId);
  return item;
}

export async function updateItem(id: string, patch: Partial<ItemInput>, performedByUserId?: string) {
  const before = await prisma.item.findUnique({ where: { id } });
  if (!before) throw new NotFoundError();
  const item = await prisma.item.update({ where: { id }, data: patch });
  void writeAudit('Item', id, 'UPDATE', before, item, performedByUserId);
  return item;
}

export async function deleteItem(id: string, performedByUserId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const before = await prisma.item.findUnique({ where: { id } });
  if (!before) throw new NotFoundError();
  if (before.status === 'SOLD') {
    throw new BusinessRuleError('ITEM_SOLD', 'Sold items cannot be deleted — they live on the bill.');
  }
  // Soft delete: mark MELTED and log the action. Hard-deleting an item would
  // orphan bill lines, movements, and audit history.
  const after = await prisma.item.update({ where: { id }, data: { status: 'MELTED' } });
  await prisma.itemMovement.create({
    data: {
      tenantId,
      itemId: id,
      fromShopId: before.shopId,
      type: 'WASTAGE',
      reason: 'Manually removed from inventory',
      performedByUserId: performedByUserId ?? null,
    },
  });
  void writeAudit('Item', id, 'DELETE', before, after, performedByUserId);
}

export async function transferItem(id: string, toShopId: string, reason: string, performedByUserId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError();
  if (item.status !== 'IN_STOCK') throw new BusinessRuleError('ITEM_NOT_IN_STOCK', 'Item is not in stock');
  const [updated] = await prisma.$transaction([
    prisma.item.update({ where: { id }, data: { status: 'IN_TRANSIT', shopId: toShopId } }),
    prisma.itemMovement.create({
      data: {
        tenantId,
        itemId: id,
        fromShopId: item.shopId,
        toShopId,
        type: 'TRANSFER',
        reason,
        performedByUserId: performedByUserId ?? null,
      },
    }),
  ]);
  void writeAudit('Item', id, 'TRANSFER', item, updated, performedByUserId);
  return updated;
}

export async function recordWastage(id: string, reason: string, performedByUserId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError();
  if (item.status !== 'IN_STOCK') throw new BusinessRuleError('ITEM_NOT_IN_STOCK', 'Item is not in stock');
  const [updated, movement] = await prisma.$transaction([
    prisma.item.update({ where: { id }, data: { status: 'MELTED' } }),
    prisma.itemMovement.create({
      data: {
        tenantId,
        itemId: id,
        fromShopId: item.shopId,
        type: 'WASTAGE',
        reason,
        performedByUserId: performedByUserId ?? null,
      },
    }),
  ]);
  void writeAudit('Item', id, 'WASTAGE', item, updated, performedByUserId);
  return movement;
}

export async function listMovements(opts: { itemId?: string; type?: string; cursor?: string }) {
  const take = DEFAULT_PAGE_LIMIT;
  const movements = await prisma.itemMovement.findMany({
    where: {
      ...(opts.itemId ? { itemId: opts.itemId } : {}),
      ...(opts.type ? { type: opts.type as 'PURCHASE' | 'TRANSFER' | 'SALE' | 'RETURN' | 'WASTAGE' | 'ADJUSTMENT' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    // Join the item only — shop relations on ItemMovement aren't declared in
    // the Prisma schema (the FK columns exist as bare strings). InventoryPage
    // falls back to a client-side shopName(...) lookup, so a join isn't
    // required. To enable a server-side join, add fromShop/toShop @relation()
    // to model ItemMovement in schema.prisma and re-generate the client.
    include: {
      item: { select: { id: true, sku: true } },
    },
  });
  const hasMore = movements.length > take;
  const page = movements.slice(0, take);
  return { data: page, page: { nextCursor: hasMore ? page.at(-1)?.id : undefined, hasMore } };
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } });
}

export async function updateCategoryMakingCharge(id: string, bps: number) {
  return prisma.category.update({ where: { id }, data: { defaultMakingChargeBps: bps } });
}

export async function computeValuation(opts: { shopId?: string }) {
  const items = await prisma.item.findMany({
    where: {
      status: 'IN_STOCK',
      ...(opts.shopId ? { shopId: opts.shopId } : {}),
    },
    select: { weightMg: true, purityCaratX100: true, shopId: true, categoryId: true },
  });
  // Resolve each distinct purity's rate once, in parallel. Previously this
  // hit Redis inside the per-item loop — for a tenant with thousands of
  // items, that was thousands of sequential round-trips per request.
  const purities = Array.from(new Set(items.map((i) => i.purityCaratX100)));
  const rateEntries = await Promise.all(
    purities.map(async (p) => [p, (await readGoldRatePaise(p))?.paise ?? 642_000] as const),
  );
  const rateByPurity = new Map<number, number>(rateEntries);

  let totalPaise = 0;
  const byShop = new Map<string, { totalPaise: number; itemCount: number }>();
  const byCategory = new Map<string, { totalPaise: number; itemCount: number }>();
  for (const it of items) {
    const ratePerGramPaise = rateByPurity.get(it.purityCaratX100) ?? 642_000;
    const value = computeGoldValuePaise(it.weightMg, it.purityCaratX100, ratePerGramPaise);
    totalPaise += value;
    const shopAgg = byShop.get(it.shopId) ?? { totalPaise: 0, itemCount: 0 };
    shopAgg.totalPaise += value;
    shopAgg.itemCount += 1;
    byShop.set(it.shopId, shopAgg);
    const catAgg = byCategory.get(it.categoryId) ?? { totalPaise: 0, itemCount: 0 };
    catAgg.totalPaise += value;
    catAgg.itemCount += 1;
    byCategory.set(it.categoryId, catAgg);
  }
  return {
    totalPaise,
    itemCount: items.length,
    byShop: Array.from(byShop.entries()).map(([shopId, v]) => ({ shopId, ...v })),
    byCategory: Array.from(byCategory.entries()).map(([categoryId, v]) => ({ categoryId, ...v })),
    asOf: new Date().toISOString(),
  };
}

export async function computeLowStock(threshold: number) {
  const grouped = await prisma.item.groupBy({
    by: ['categoryId', 'shopId'],
    where: { status: 'IN_STOCK' },
    _count: { _all: true },
  });
  const lowBuckets = grouped
    .map((g) => ({
      categoryId: g.categoryId,
      shopId: g.shopId,
      itemCount: g._count._all,
    }))
    .filter((r) => r.itemCount <= threshold);
  if (lowBuckets.length === 0) return { threshold, rows: [], items: [] };
  // Pull every IN_STOCK item that lives in a low bucket so the UI can render
  // an actual product list (SKU / weight / purity / cost) instead of just
  // "Bridal — 2 items".
  const items = await prisma.item.findMany({
    where: {
      status: 'IN_STOCK',
      OR: lowBuckets.map((b) => ({ categoryId: b.categoryId, shopId: b.shopId })),
    },
    orderBy: [{ shopId: 'asc' }, { categoryId: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      sku: true,
      shopId: true,
      categoryId: true,
      weightMg: true,
      purityCaratX100: true,
      costPricePaise: true,
      hallmarkStatus: true,
    },
  });
  return { threshold, rows: lowBuckets, items };
}

// --- Vendors ---

export async function listVendors() {
  const vendors = await prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  return { data: vendors, page: { hasMore: false } };
}

export async function createVendor(input: VendorInput) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const vendor = await prisma.vendor.create({ data: { ...input, tenantId } });
  void writeAudit('Vendor', vendor.id, 'CREATE', null, vendor);
  return vendor;
}

export async function updateVendor(id: string, patch: Partial<VendorInput>) {
  const before = await prisma.vendor.findUnique({ where: { id } });
  if (!before) throw new NotFoundError();
  const vendor = await prisma.vendor.update({ where: { id }, data: patch });
  void writeAudit('Vendor', id, 'UPDATE', before, vendor);
  return vendor;
}

export async function deleteVendor(id: string) {
  const before = await prisma.vendor.findUnique({ where: { id } });
  if (!before) throw new NotFoundError();
  // Refuse if linked POs exist — vendor history matters for accounting.
  const poCount = await prisma.purchaseOrder.count({ where: { vendorId: id } });
  if (poCount > 0) {
    throw new BusinessRuleError(
      'VENDOR_HAS_POS',
      `Cannot delete vendor with ${poCount} purchase order${poCount === 1 ? '' : 's'}.`,
    );
  }
  await prisma.vendor.delete({ where: { id } });
  void writeAudit('Vendor', id, 'DELETE', before, null);
}

// --- Purchase Orders ---

export async function listPurchaseOrders() {
  const pos = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      items: true,
      vendor: { select: { id: true, name: true } },
    },
  });
  return { data: pos, page: { hasMore: false } };
}

export async function createPurchaseOrder(input: PurchaseOrderCreate) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const totalPaise = input.items.reduce((s, i) => s + i.costPaise, 0);
  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      vendorId: input.vendorId,
      totalPaise,
      items: { create: input.items },
    },
    include: { items: true, vendor: { select: { id: true, name: true } } },
  });
  void writeAudit('PurchaseOrder', po.id, 'CREATE', null, po);
  return po;
}

// Receive a PO: mark it RECEIVED and turn each PO line into an Item +
// PURCHASE ItemMovement so stock actually grows. Idempotent: a PO already
// RECEIVED is a no-op.
export async function receivePurchaseOrder(
  poId: string,
  shopId: string,
  categoryId: string,
  userId?: string,
) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: true },
  });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (po.status === 'RECEIVED') return po;

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new NotFoundError('Shop not found');
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new NotFoundError('Category not found');

  const updated = await prisma.$transaction(async (tx) => {
    for (const line of po.items) {
      // Make SKU unique per (tenant, sku) — append PO-line id suffix.
      const sku = `${line.itemSku}-${line.id.slice(-6).toUpperCase()}`;
      const item = await tx.item.create({
        data: {
          tenantId,
          shopId,
          categoryId,
          sku,
          barcodeData: sku,
          weightMg: line.weightMg,
          purityCaratX100: line.purity,
          costPricePaise: line.costPaise,
          hallmarkStatus: 'PENDING',
          status: 'IN_STOCK',
        },
      });
      await tx.itemMovement.create({
        data: {
          tenantId,
          itemId: item.id,
          toShopId: shopId,
          type: 'PURCHASE',
          reason: `Received PO ${poId.slice(-6).toUpperCase()}`,
          performedByUserId: userId ?? null,
        },
      });
    }
    return tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'RECEIVED' },
      include: { items: true, vendor: { select: { id: true, name: true } } },
    });
  });
  void writeAudit('PurchaseOrder', poId, 'RECEIVE', po, updated, userId);
  return updated;
}

// --- Audit log ---

export async function listAuditLog(opts: { entityType?: string; entityId?: string; cursor?: string }) {
  const take = 50;
  const logs = await prisma.auditLog.findMany({
    where: {
      ...(opts.entityType ? { entityType: opts.entityType } : {}),
      ...(opts.entityId ? { entityId: opts.entityId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = logs.length > take;
  const page = logs.slice(0, take);
  return { data: page, page: { nextCursor: hasMore ? page.at(-1)?.id : undefined, hasMore } };
}

async function writeAudit(
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
  userId?: string,
): Promise<void> {
  try {
    const tenantId = getTenantId();
    if (!tenantId) return;
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId ?? null,
        entityType,
        entityId,
        action,
        beforeJson:
          before === null || before === undefined
            ? Prisma.DbNull
            : (before as Prisma.InputJsonValue),
        afterJson:
          after === null || after === undefined
            ? Prisma.DbNull
            : (after as Prisma.InputJsonValue),
      },
    });
  } catch {
    // Audit failures must never break the primary mutation.
  }
}
