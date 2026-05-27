// Tests the POS SALE-movement audit row + lot-aware decrement / void flow.
//
// These hit the real DB; they skip themselves if the seed tenant isn't there.
// We bypass the auth + register-session machinery by calling the services
// directly inside runWithTenant — the tenant extension handles isolation.

import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBill } from '../modules/pos/pos.service.js';
import { voidBill } from '../modules/pos/pos-features.service.js';
import { rawPrisma } from '../lib/prisma.js';
import { runWithTenant } from '../lib/async-context.js';

interface SeedRefs {
  tenantId: string;
  shopId: string;
  categoryId: string;
}

let seed: SeedRefs | null = null;
const createdItemIds: string[] = [];
const createdBillIds: string[] = [];

beforeAll(async () => {
  try {
    const tenant = await rawPrisma.tenant.findFirst({
      where: { ownerEmail: 'owner@goldos.dev' },
      select: { id: true },
    });
    if (!tenant) {
      console.warn('[pos-sale-movement.test] seed tenant missing — skipping');
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
      console.warn('[pos-sale-movement.test] seed shop/category missing — skipping');
      return;
    }
    seed = { tenantId: tenant.id, shopId: shop.id, categoryId: category.id };
  } catch (err) {
    console.warn('[pos-sale-movement.test] DB unreachable — skipping', err);
  }
});

afterAll(async () => {
  if (createdBillIds.length > 0) {
    await rawPrisma.billLine.deleteMany({ where: { billId: { in: createdBillIds } } });
    await rawPrisma.payment.deleteMany({ where: { billId: { in: createdBillIds } } });
    await rawPrisma.bill.deleteMany({ where: { id: { in: createdBillIds } } });
  }
  if (createdItemIds.length > 0) {
    await rawPrisma.itemMovement.deleteMany({ where: { itemId: { in: createdItemIds } } });
    await rawPrisma.item.deleteMany({ where: { id: { in: createdItemIds } } });
  }
});

async function makeItem(opts: {
  isSerialized: boolean;
  quantityOnHand?: number;
}): Promise<{ id: string; sku: string }> {
  if (!seed) throw new Error('seed missing');
  const sku = `POSSALE-${opts.isSerialized ? 'UQ' : 'LOT'}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(-4)}`.toUpperCase();
  const item = await rawPrisma.item.create({
    data: {
      tenantId: seed.tenantId,
      shopId: seed.shopId,
      categoryId: seed.categoryId,
      sku,
      barcodeData: sku,
      weightMg: 5_000,
      purityCaratX100: 2200,
      costPricePaise: 100_000,
      makingChargeBps: 1200,
      hallmarkStatus: 'PENDING',
      status: 'IN_STOCK',
      isSerialized: opts.isSerialized,
      quantityOnHand: opts.quantityOnHand ?? (opts.isSerialized ? 1 : 1),
    },
    select: { id: true, sku: true },
  });
  createdItemIds.push(item.id);
  return item;
}

describe('POS SALE movement + lot-aware void', { timeout: 30_000 }, () => {
  it('serialized: createBill writes a SALE movement and flips item SOLD; void restores it', async () => {
    if (!seed) return;
    const item = await makeItem({ isSerialized: true });

    const bill = await runWithTenant({ tenantId: seed.tenantId }, () =>
      createBill({
        shopId: seed!.shopId,
        lines: [
          { itemId: item.id, weightMg: 5_000, purityCaratX100: 2200, stoneChargePaise: 0 },
        ],
        discountPaise: 0,
        payments: [{ mode: 'CASH', amountPaise: 1_000_000 }],
        idempotencyKey: crypto.randomUUID(),
      }),
    );
    createdBillIds.push(bill.id);

    // Item is now SOLD.
    const after = await rawPrisma.item.findUnique({ where: { id: item.id } });
    expect(after?.status).toBe('SOLD');

    // Exactly one SALE movement with qty=1 referencing this bill.
    const sales = await rawPrisma.itemMovement.findMany({
      where: { itemId: item.id, type: 'SALE' },
    });
    expect(sales).toHaveLength(1);
    expect(sales[0]?.qty).toBe(1);
    expect(sales[0]?.fromShopId).toBe(seed.shopId);
    expect(sales[0]?.reason).toContain(bill.billNumber);

    // Void within 24h must restore stock + write a RETURN movement.
    await runWithTenant({ tenantId: seed.tenantId }, () =>
      voidBill(bill.id, 'pos-sale-movement test cleanup', 'system-test-user'),
    );
    const restored = await rawPrisma.item.findUnique({ where: { id: item.id } });
    expect(restored?.status).toBe('IN_STOCK');
    const returns = await rawPrisma.itemMovement.findMany({
      where: { itemId: item.id, type: 'RETURN' },
    });
    expect(returns).toHaveLength(1);
    expect(returns[0]?.qty).toBe(1);
    expect(returns[0]?.toShopId).toBe(seed.shopId);
  });

  it('lot: createBill decrements quantityOnHand without flipping SOLD; void restores +1', async () => {
    if (!seed) return;
    const item = await makeItem({ isSerialized: false, quantityOnHand: 5 });

    const bill = await runWithTenant({ tenantId: seed.tenantId }, () =>
      createBill({
        shopId: seed!.shopId,
        lines: [
          { itemId: item.id, weightMg: 5_000, purityCaratX100: 2200, stoneChargePaise: 0 },
        ],
        discountPaise: 0,
        payments: [{ mode: 'CASH', amountPaise: 1_000_000 }],
        idempotencyKey: crypto.randomUUID(),
      }),
    );
    createdBillIds.push(bill.id);

    // Lot row stays IN_STOCK; quantityOnHand drops by 1.
    const after = await rawPrisma.item.findUnique({ where: { id: item.id } });
    expect(after?.status).toBe('IN_STOCK');
    expect(after?.quantityOnHand).toBe(4);

    // SALE movement still written.
    const sales = await rawPrisma.itemMovement.findMany({
      where: { itemId: item.id, type: 'SALE' },
    });
    expect(sales).toHaveLength(1);

    // Void restores the unit back to the lot.
    await runWithTenant({ tenantId: seed.tenantId }, () =>
      voidBill(bill.id, 'pos-sale-movement test cleanup', 'system-test-user'),
    );
    const restored = await rawPrisma.item.findUnique({ where: { id: item.id } });
    expect(restored?.quantityOnHand).toBe(5);
    expect(restored?.status).toBe('IN_STOCK');
  });

  it('lot drains to zero: last unit sold flips status to SOLD; void brings it back', async () => {
    if (!seed) return;
    const item = await makeItem({ isSerialized: false, quantityOnHand: 1 });

    const bill = await runWithTenant({ tenantId: seed.tenantId }, () =>
      createBill({
        shopId: seed!.shopId,
        lines: [
          { itemId: item.id, weightMg: 5_000, purityCaratX100: 2200, stoneChargePaise: 0 },
        ],
        discountPaise: 0,
        payments: [{ mode: 'CASH', amountPaise: 1_000_000 }],
        idempotencyKey: crypto.randomUUID(),
      }),
    );
    createdBillIds.push(bill.id);

    const after = await rawPrisma.item.findUnique({ where: { id: item.id } });
    expect(after?.quantityOnHand).toBe(0);
    expect(after?.status).toBe('SOLD');

    await runWithTenant({ tenantId: seed.tenantId }, () =>
      voidBill(bill.id, 'pos-sale-movement test cleanup', 'system-test-user'),
    );
    const restored = await rawPrisma.item.findUnique({ where: { id: item.id } });
    expect(restored?.quantityOnHand).toBe(1);
    expect(restored?.status).toBe('IN_STOCK');
  });
});
