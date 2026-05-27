// Lot-aware transfer workflow: createTransfer / approveTransfer /
// completeTransfer must respect TransferLine.quantity for lot items.
// Hits the real DB so the $transaction + tenant-scoped extension is
// exercised. Skips itself if the DB is unreachable.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTransfer,
  approveTransfer,
  completeTransfer,
} from '../modules/transfers/transfers.service.js';
import { rawPrisma } from '../lib/prisma.js';
import { runWithTenant } from '../lib/async-context.js';

interface SeedRefs {
  tenantId: string;
  fromShopId: string;
  toShopId: string;
  categoryId: string;
}

let seed: SeedRefs | null = null;
const createdItemIds: string[] = [];
const createdTransferIds: string[] = [];

beforeAll(async () => {
  try {
    const tenant = await rawPrisma.tenant.findFirst({
      where: { ownerEmail: 'owner@goldos.dev' },
      select: { id: true },
    });
    if (!tenant) {
      console.warn('[lot-transfer.test] seed tenant missing — skipping');
      return;
    }
    const shops = await rawPrisma.shop.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
      take: 2,
    });
    const category = await rawPrisma.category.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    if (shops.length < 2 || !category) {
      console.warn('[lot-transfer.test] need 2 shops + 1 category to run — skipping');
      return;
    }
    seed = {
      tenantId: tenant.id,
      fromShopId: shops[0]!.id,
      toShopId: shops[1]!.id,
      categoryId: category.id,
    };
  } catch (err) {
    console.warn('[lot-transfer.test] DB unreachable — skipping', err);
  }
});

afterAll(async () => {
  if (createdTransferIds.length > 0) {
    await rawPrisma.transferLine.deleteMany({ where: { transferId: { in: createdTransferIds } } });
    await rawPrisma.transfer.deleteMany({ where: { id: { in: createdTransferIds } } });
  }
  if (createdItemIds.length > 0) {
    await rawPrisma.itemMovement.deleteMany({ where: { itemId: { in: createdItemIds } } });
    await rawPrisma.item.deleteMany({ where: { id: { in: createdItemIds } } });
  }
});

async function makeLotItem(quantity: number): Promise<{ id: string; sku: string }> {
  if (!seed) throw new Error('seed missing');
  const sku = `LOTXFER-${Date.now()}-${Math.random().toString(36).slice(-4)}`.toUpperCase();
  const item = await rawPrisma.item.create({
    data: {
      tenantId: seed.tenantId,
      shopId: seed.fromShopId,
      categoryId: seed.categoryId,
      sku,
      barcodeData: sku,
      weightMg: 1000,
      purityCaratX100: 2200,
      costPricePaise: 64_200,
      hallmarkStatus: 'PENDING',
      status: 'IN_STOCK',
      isSerialized: false,
      quantityOnHand: quantity,
    },
    select: { id: true, sku: true },
  });
  createdItemIds.push(item.id);
  return item;
}

describe('Lot transfer workflow', { timeout: 30_000 }, () => {
  it('decrements source quantity on approve, creates a destination row on complete', async () => {
    if (!seed) return;
    const lot = await makeLotItem(100);

    const created = await runWithTenant({ tenantId: seed.tenantId }, () =>
      createTransfer({
        fromShopId: seed!.fromShopId,
        toShopId: seed!.toShopId,
        lines: [{ itemId: lot.id, quantity: 20 }],
        reason: 'Warehouse → Camp distribution',
      }),
    );
    createdTransferIds.push(created.id);

    // Pending state — source row should still have full quantityOnHand.
    const beforeApprove = await rawPrisma.item.findUnique({ where: { id: lot.id } });
    expect(beforeApprove?.quantityOnHand).toBe(100);

    // Approve — source loses 20.
    await runWithTenant({ tenantId: seed.tenantId }, () => approveTransfer(created.id));
    const afterApprove = await rawPrisma.item.findUnique({ where: { id: lot.id } });
    expect(afterApprove?.quantityOnHand).toBe(80);
    expect(afterApprove?.status).toBe('IN_STOCK'); // lot still has 80 on hand

    // One TRANSFER movement with qty=20 at approve time.
    const xferMovements = await rawPrisma.itemMovement.findMany({
      where: { itemId: lot.id, type: 'TRANSFER' },
    });
    expect(xferMovements).toHaveLength(1);
    expect(xferMovements[0]?.qty).toBe(20);
    expect(xferMovements[0]?.fromShopId).toBe(seed.fromShopId);
    expect(xferMovements[0]?.toShopId).toBe(seed.toShopId);

    // Complete — destination row gets created (or incremented).
    await runWithTenant({ tenantId: seed.tenantId }, () => completeTransfer(created.id));

    const destRow = await rawPrisma.item.findFirst({
      where: { tenantId: seed.tenantId, shopId: seed.toShopId, isSerialized: false, sku: { startsWith: lot.sku } },
    });
    expect(destRow).not.toBeNull();
    expect(destRow!.quantityOnHand).toBe(20);
    expect(destRow!.status).toBe('IN_STOCK');
    if (destRow) createdItemIds.push(destRow.id);

    // Source row unchanged on complete (it already lost 20 at approve).
    const finalSource = await rawPrisma.item.findUnique({ where: { id: lot.id } });
    expect(finalSource?.quantityOnHand).toBe(80);
  });

  it('rejects a lot transfer whose quantity exceeds quantityOnHand', async () => {
    if (!seed) return;
    const lot = await makeLotItem(5);

    await expect(
      runWithTenant({ tenantId: seed.tenantId }, () =>
        createTransfer({
          fromShopId: seed!.fromShopId,
          toShopId: seed!.toShopId,
          lines: [{ itemId: lot.id, quantity: 10 }],
          reason: 'Overdraw attempt',
        }),
      ),
    ).rejects.toMatchObject({ code: 'LOT_QUANTITY_EXCEEDS_STOCK' });
  });

  it('rejects a serialized line with quantity != 1', async () => {
    if (!seed) return;
    const sku = `UQXFER-${Date.now()}`.toUpperCase();
    const uniq = await rawPrisma.item.create({
      data: {
        tenantId: seed.tenantId,
        shopId: seed.fromShopId,
        categoryId: seed.categoryId,
        sku,
        barcodeData: sku,
        weightMg: 5000,
        purityCaratX100: 2200,
        costPricePaise: 200_000,
        hallmarkStatus: 'PENDING',
        status: 'IN_STOCK',
        isSerialized: true,
        quantityOnHand: 1,
      },
      select: { id: true },
    });
    createdItemIds.push(uniq.id);

    await expect(
      runWithTenant({ tenantId: seed.tenantId }, () =>
        createTransfer({
          fromShopId: seed!.fromShopId,
          toShopId: seed!.toShopId,
          lines: [{ itemId: uniq.id, quantity: 3 }],
          reason: 'Bad quantity for a unique piece',
        }),
      ),
    ).rejects.toMatchObject({ code: 'SERIALIZED_QUANTITY_INVALID' });
  });
});
