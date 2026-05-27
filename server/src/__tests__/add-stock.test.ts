// addStock service tests. Hits the real DB (Neon-backed seed tenant) so we
// exercise the tenant extension + $transaction insert path. Skips itself if
// the DB is unreachable so the unit-test suite still runs in DB-less CI.
//
// Covers:
//   * serialized path: N new Item rows + N PURCHASE movements
//   * lot path: quantityOnHand bumped + 1 PURCHASE movement
//   * cost-price override propagation
//   * rejection when the item is no longer IN_STOCK

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addStock } from '../modules/inventory/inventory.service.js';
import { rawPrisma } from '../lib/prisma.js';
import { runWithTenant } from '../lib/async-context.js';

interface SeedRefs {
  tenantId: string;
  shopId: string;
  categoryId: string;
}

let seed: SeedRefs | null = null;
const createdItemIds: string[] = [];

beforeAll(async () => {
  try {
    const tenant = await rawPrisma.tenant.findFirst({
      where: { ownerEmail: 'owner@goldos.dev' },
      select: { id: true },
    });
    if (!tenant) {
      console.warn('[add-stock.test] seed tenant missing — skipping');
      return;
    }
    const shop = await rawPrisma.shop.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    const category = await rawPrisma.category.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    if (!shop || !category) {
      console.warn('[add-stock.test] seed shop/category missing — skipping');
      return;
    }
    seed = { tenantId: tenant.id, shopId: shop.id, categoryId: category.id };
  } catch (err) {
    console.warn('[add-stock.test] DB unreachable — skipping', err);
  }
});

afterAll(async () => {
  if (createdItemIds.length === 0) return;
  await rawPrisma.itemMovement.deleteMany({ where: { itemId: { in: createdItemIds } } });
  await rawPrisma.auditLog.deleteMany({
    where: { entityType: 'Item', entityId: { in: createdItemIds } },
  });
  await rawPrisma.item.deleteMany({ where: { id: { in: createdItemIds } } });
});

async function makeSourceItem(opts: {
  isSerialized: boolean;
  quantityOnHand?: number;
}): Promise<{ id: string; sku: string }> {
  if (!seed) throw new Error('seed missing');
  const sku = `ADDSTOCK-${opts.isSerialized ? 'UQ' : 'LOT'}-${Date.now()}-${Math.random().toString(36).slice(-4)}`.toUpperCase();
  const item = await rawPrisma.item.create({
    data: {
      tenantId: seed.tenantId,
      shopId: seed.shopId,
      categoryId: seed.categoryId,
      sku,
      barcodeData: sku,
      weightMg: 5000,
      purityCaratX100: 2200,
      costPricePaise: 100_000,
      makingChargeBps: 1200,
      hallmarkStatus: 'PENDING',
      status: 'IN_STOCK',
      isSerialized: opts.isSerialized,
      quantityOnHand: opts.quantityOnHand ?? (opts.isSerialized ? 1 : 0),
    },
    select: { id: true, sku: true },
  });
  createdItemIds.push(item.id);
  return item;
}

describe('addStock', { timeout: 30_000 }, () => {
  it('serialized: clones N new Item rows + N PURCHASE movements', async () => {
    if (!seed) return;
    const source = await makeSourceItem({ isSerialized: true });

    const result = await runWithTenant({ tenantId: seed.tenantId }, () =>
      addStock(source.id, { quantity: 5, reason: 'Best-seller rerun' }),
    );

    expect(result.mode).toBe('serialized');
    expect(result.added).toBe(5);
    expect(result.newItemIds).toHaveLength(5);
    for (const id of result.newItemIds ?? []) createdItemIds.push(id);

    // Every clone should be IN_STOCK, isSerialized=true, qty=1, distinct SKU.
    const clones = await rawPrisma.item.findMany({
      where: { id: { in: result.newItemIds ?? [] } },
    });
    expect(clones).toHaveLength(5);
    for (const c of clones) {
      expect(c.isSerialized).toBe(true);
      expect(c.quantityOnHand).toBe(1);
      expect(c.status).toBe('IN_STOCK');
      expect(c.sku).toMatch(new RegExp(`^${source.sku}-[A-Z0-9]{6}$`));
      expect(c.shopId).toBe(seed.shopId);
      expect(c.categoryId).toBe(seed.categoryId);
    }
    // SKUs are all distinct.
    expect(new Set(clones.map((c) => c.sku)).size).toBe(5);

    // One PURCHASE movement per clone with qty=1.
    const movements = await rawPrisma.itemMovement.findMany({
      where: { itemId: { in: result.newItemIds ?? [] } },
    });
    expect(movements).toHaveLength(5);
    for (const m of movements) {
      expect(m.type).toBe('PURCHASE');
      expect(m.qty).toBe(1);
      expect(m.toShopId).toBe(seed.shopId);
      expect(m.reason).toBe('Best-seller rerun');
    }

    // Source row is unchanged.
    const after = await rawPrisma.item.findUnique({ where: { id: source.id } });
    expect(after?.quantityOnHand).toBe(1);
    expect(after?.status).toBe('IN_STOCK');
  });

  it('lot: increments quantityOnHand + writes 1 PURCHASE movement with qty=N', async () => {
    if (!seed) return;
    const source = await makeSourceItem({ isSerialized: false, quantityOnHand: 10 });

    const result = await runWithTenant({ tenantId: seed.tenantId }, () =>
      addStock(source.id, { quantity: 50, reason: 'Restock from vendor' }),
    );

    expect(result.mode).toBe('lot');
    expect(result.added).toBe(50);
    expect(result.newQuantity).toBe(60);
    expect(result.newItemIds).toBeUndefined();

    const after = await rawPrisma.item.findUnique({ where: { id: source.id } });
    expect(after?.quantityOnHand).toBe(60);
    expect(after?.isSerialized).toBe(false);

    const movements = await rawPrisma.itemMovement.findMany({
      where: { itemId: source.id },
      orderBy: { createdAt: 'desc' },
    });
    // findMany returns all movements ever recorded for the item — at this
    // point there should be exactly one PURCHASE row from this test.
    const purchases = movements.filter((m) => m.type === 'PURCHASE');
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.qty).toBe(50);
    expect(purchases[0]?.toShopId).toBe(seed.shopId);
    expect(purchases[0]?.reason).toBe('Restock from vendor');
  });

  it('lot: cost-price override updates the source row in place', async () => {
    if (!seed) return;
    const source = await makeSourceItem({ isSerialized: false, quantityOnHand: 5 });

    await runWithTenant({ tenantId: seed.tenantId }, () =>
      addStock(source.id, { quantity: 3, costPricePaise: 250_000 }),
    );

    const after = await rawPrisma.item.findUnique({ where: { id: source.id } });
    expect(after?.costPricePaise).toBe(250_000);
    expect(after?.quantityOnHand).toBe(8);
  });

  it('rejects when the target item is not IN_STOCK', async () => {
    if (!seed) return;
    const source = await makeSourceItem({ isSerialized: false, quantityOnHand: 0 });
    // Flip status manually to simulate a sold-out lot.
    await rawPrisma.item.update({
      where: { id: source.id },
      data: { status: 'SOLD' },
    });

    await expect(
      runWithTenant({ tenantId: seed.tenantId }, () =>
        addStock(source.id, { quantity: 1 }),
      ),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_IN_STOCK' });
  });
});
