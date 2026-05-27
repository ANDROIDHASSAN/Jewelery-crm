// Transfers service — stock movement workflow between shops (incl. warehouse).
//
// State machine:
//   PENDING   -> APPROVED  (items flip to IN_TRANSIT, kept at source shopId)
//   APPROVED  -> COMPLETED (items flip to dest shopId + back to IN_STOCK)
//   PENDING   -> REJECTED  (terminal; no stock change ever happened)
//
// Each Transfer carries N TransferLine rows, one per Item moving. An Item
// cannot be in two active transfers at once — createTransfer rejects if any
// requested itemId is already on a PENDING / APPROVED transfer.
//
// ItemMovement (audit log) gets one TRANSFER row per item at APPROVE time,
// since that's when stock actually leaves source. COMPLETE is a destination
// confirmation, not a new movement.

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BusinessRuleError } from '../../lib/errors.js';
import { getTenantId } from '../../lib/async-context.js';
import type { TransferCreate } from '@goldos/shared/types';

// Normalize the two accepted TransferCreate input shapes into a single
// canonical { itemId, quantity }[] list. Serialized callers using `itemIds`
// get quantity=1 each; lot callers using `lines` get whatever they specified.
type LineRequest = { itemId: string; quantity: number };

function normalizeLines(input: TransferCreate): LineRequest[] {
  if (input.lines && input.lines.length > 0) {
    return input.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity ?? 1 }));
  }
  if (input.itemIds && input.itemIds.length > 0) {
    return input.itemIds.map((itemId) => ({ itemId, quantity: 1 }));
  }
  // Schema-level refine already prevents this, but defensive:
  throw new BusinessRuleError('TRANSFER_NO_LINES', 'Transfer must specify at least one line.');
}

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

type TransferStatusFilter = 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED';

export async function listTransfers(opts: {
  status?: TransferStatusFilter;
  fromShopId?: string;
  toShopId?: string;
  cursor?: string;
  limit?: number;
}) {
  const take = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const transfers = await prisma.transfer.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.fromShopId ? { fromShopId: opts.fromShopId } : {}),
      ...(opts.toShopId ? { toShopId: opts.toShopId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      fromShop: { select: { id: true, name: true, isWarehouse: true } },
      toShop:   { select: { id: true, name: true, isWarehouse: true } },
      _count: { select: { lines: true } },
    },
  });
  const hasMore = transfers.length > take;
  const page = transfers.slice(0, take);
  return { data: page, page: { nextCursor: hasMore ? page.at(-1)?.id : undefined, hasMore } };
}

export async function getTransfer(id: string) {
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      fromShop: { select: { id: true, name: true, isWarehouse: true } },
      toShop:   { select: { id: true, name: true, isWarehouse: true } },
      lines: {
        include: {
          item: {
            select: {
              id: true, sku: true, name: true, weightMg: true,
              purityCaratX100: true, status: true, shopId: true,
              images: true,
            },
          },
        },
      },
    },
  });
  if (!transfer) throw new NotFoundError('Transfer not found');
  return transfer;
}

export async function createTransfer(input: TransferCreate, userId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');

  // Both shops must exist within this tenant. Prisma extension already scopes
  // findUnique by tenantId; an unknown id returns null.
  const [fromShop, toShop] = await Promise.all([
    prisma.shop.findUnique({ where: { id: input.fromShopId } }),
    prisma.shop.findUnique({ where: { id: input.toShopId   } }),
  ]);
  if (!fromShop) throw new NotFoundError('Source shop not found');
  if (!toShop)   throw new NotFoundError('Destination shop not found');

  const lineRequests = normalizeLines(input);
  const itemIds = lineRequests.map((l) => l.itemId);

  // Source items: must exist, be IN_STOCK, and belong to fromShop. For lot
  // items we also enforce quantityOnHand >= requested quantity.
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, shopId: true, status: true, sku: true, isSerialized: true, quantityOnHand: true },
  });
  if (items.length !== itemIds.length) {
    throw new BusinessRuleError('ITEMS_NOT_FOUND', 'One or more items could not be found in this tenant.');
  }
  const itemById = new Map(items.map((i) => [i.id, i] as const));
  const wrongShop = items.find((it) => it.shopId !== input.fromShopId);
  if (wrongShop) {
    throw new BusinessRuleError(
      'ITEM_WRONG_SHOP',
      `Item ${wrongShop.sku} is not in the source shop and cannot be transferred from it.`,
    );
  }
  const notInStock = items.find((it) => it.status !== 'IN_STOCK');
  if (notInStock) {
    throw new BusinessRuleError(
      'ITEM_NOT_IN_STOCK',
      `Item ${notInStock.sku} is not IN_STOCK (current: ${notInStock.status}).`,
    );
  }
  // Per-line validation: serialized rows must be quantity=1; lot rows must
  // not exceed the source row's quantityOnHand.
  for (const l of lineRequests) {
    const it = itemById.get(l.itemId);
    if (!it) continue;
    if (it.isSerialized && l.quantity !== 1) {
      throw new BusinessRuleError(
        'SERIALIZED_QUANTITY_INVALID',
        `Item ${it.sku} is a unique piece — quantity must be 1.`,
      );
    }
    if (!it.isSerialized && l.quantity > it.quantityOnHand) {
      throw new BusinessRuleError(
        'LOT_QUANTITY_EXCEEDS_STOCK',
        `Item ${it.sku} only has ${it.quantityOnHand} on hand — cannot transfer ${l.quantity}.`,
      );
    }
  }

  // No double-booking for serialized items — refuse if any serialized item
  // is already in an active transfer. Lot items can appear in multiple
  // concurrent transfers as long as the cumulative quantity fits, but we
  // skip that more nuanced check for v1 since UI doesn't surface it yet.
  const serializedIds = items.filter((it) => it.isSerialized).map((it) => it.id);
  if (serializedIds.length > 0) {
    const active = await prisma.transferLine.findFirst({
      where: {
        itemId: { in: serializedIds },
        transfer: { status: { in: ['PENDING', 'APPROVED'] } },
      },
      include: { item: { select: { sku: true } } },
    });
    if (active) {
      throw new BusinessRuleError(
        'ITEM_ALREADY_TRANSFERRING',
        `Item ${active.item.sku} is already on an active transfer.`,
      );
    }
  }

  const transfer = await prisma.transfer.create({
    data: {
      tenantId,
      fromShopId: input.fromShopId,
      toShopId: input.toShopId,
      reason: input.reason,
      notes: input.notes ?? null,
      requestedByUserId: userId ?? null,
      lines: {
        create: lineRequests.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
      },
    },
    include: {
      fromShop: { select: { id: true, name: true, isWarehouse: true } },
      toShop:   { select: { id: true, name: true, isWarehouse: true } },
      lines: true,
    },
  });
  return transfer;
}

export async function approveTransfer(id: string, userId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: { lines: { select: { itemId: true, quantity: true } } },
  });
  if (!transfer) throw new NotFoundError('Transfer not found');
  if (transfer.status !== 'PENDING') {
    throw new BusinessRuleError('TRANSFER_NOT_PENDING', `Cannot approve a ${transfer.status.toLowerCase()} transfer.`);
  }

  const itemIds = transfer.lines.map((l) => l.itemId);
  const itemsNow = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, sku: true, shopId: true, status: true, isSerialized: true, quantityOnHand: true },
  });
  const itemById = new Map(itemsNow.map((i) => [i.id, i] as const));
  // Drift detection — for serialized rows, status must still be IN_STOCK
  // and they must still be at the source shop. For lot rows, the source
  // shop must still match AND quantityOnHand must still cover the line.
  for (const line of transfer.lines) {
    const it = itemById.get(line.itemId);
    if (!it) {
      throw new BusinessRuleError('ITEM_DRIFTED', `Line item is missing — reject and re-create this transfer.`);
    }
    if (it.shopId !== transfer.fromShopId) {
      throw new BusinessRuleError(
        'ITEM_DRIFTED',
        `Item ${it.sku} has moved off the source shop — reject and re-create this transfer.`,
      );
    }
    if (it.isSerialized) {
      if (it.status !== 'IN_STOCK') {
        throw new BusinessRuleError(
          'ITEM_DRIFTED',
          `Item ${it.sku} is no longer IN_STOCK (current: ${it.status}). Reject and re-create.`,
        );
      }
    } else {
      if (it.quantityOnHand < line.quantity) {
        throw new BusinessRuleError(
          'LOT_QUANTITY_EXCEEDS_STOCK',
          `Item ${it.sku} only has ${it.quantityOnHand} on hand — cannot approve transfer of ${line.quantity}.`,
        );
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Serialized rows flip to IN_TRANSIT (whole row "leaves" the shop).
    const serializedIds = transfer.lines
      .filter((l) => itemById.get(l.itemId)?.isSerialized !== false)
      .map((l) => l.itemId);
    if (serializedIds.length > 0) {
      await tx.item.updateMany({
        where: { id: { in: serializedIds } },
        data: { status: 'IN_TRANSIT' },
      });
    }
    // Lot rows: decrement quantityOnHand at the source by the line quantity.
    // The lot row itself stays at the source shop (it represents the SKU at
    // that shop). The destination side gets a separate row up/created when
    // the transfer completes.
    for (const line of transfer.lines) {
      const it = itemById.get(line.itemId);
      if (!it || it.isSerialized) continue;
      const updatedLot = await tx.item.update({
        where: { id: line.itemId },
        data: { quantityOnHand: { decrement: line.quantity } },
        select: { quantityOnHand: true },
      });
      if (updatedLot.quantityOnHand <= 0) {
        // Source row drained — mark SOLD so it stops appearing as in-stock.
        // (A future restock against this row will flip it back to IN_STOCK.)
        await tx.item.update({
          where: { id: line.itemId },
          data: { status: 'SOLD' },
        });
      }
    }

    await tx.itemMovement.createMany({
      data: transfer.lines.map((l) => ({
        tenantId,
        itemId: l.itemId,
        fromShopId: transfer.fromShopId,
        toShopId: transfer.toShopId,
        type: 'TRANSFER' as const,
        qty: l.quantity,
        reason: `Transfer ${id.slice(-6).toUpperCase()} approved`,
        performedByUserId: userId ?? null,
      })),
    });
    return tx.transfer.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedByUserId: userId ?? null,
        approvedAt: new Date(),
      },
      include: {
        fromShop: { select: { id: true, name: true, isWarehouse: true } },
        toShop:   { select: { id: true, name: true, isWarehouse: true } },
        lines: true,
      },
    });
  });
  return updated;
}

export async function completeTransfer(id: string, userId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: { lines: { select: { itemId: true, quantity: true } } },
  });
  if (!transfer) throw new NotFoundError('Transfer not found');
  if (transfer.status !== 'APPROVED') {
    throw new BusinessRuleError('TRANSFER_NOT_APPROVED', `Cannot complete a ${transfer.status.toLowerCase()} transfer.`);
  }

  const itemIds = transfer.lines.map((l) => l.itemId);
  const itemsNow = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true, sku: true, name: true, isSerialized: true,
      categoryId: true, barcodeData: true, weightMg: true, purityCaratX100: true,
      stoneWeightMg: true, costPricePaise: true, makingChargeBps: true, images: true,
    },
  });
  const itemById = new Map(itemsNow.map((i) => [i.id, i] as const));

  const updated = await prisma.$transaction(async (tx) => {
    // Serialized rows: flip back to IN_STOCK at the destination shop. One row
    // moves with the piece. Status guard prevents double-completion.
    const serializedIds = transfer.lines
      .filter((l) => itemById.get(l.itemId)?.isSerialized !== false)
      .map((l) => l.itemId);
    if (serializedIds.length > 0) {
      await tx.item.updateMany({
        where: { id: { in: serializedIds }, status: 'IN_TRANSIT' },
        data: { shopId: transfer.toShopId, status: 'IN_STOCK' },
      });
    }

    // Lot rows: the destination shop may or may not already have a row for
    // this SKU. Convention: each (tenant, sku) is unique, so we can't simply
    // duplicate the row. Strategy: find or create a *destination* Item row
    // that mirrors the source SKU but lives at toShopId, and increment its
    // quantityOnHand. The naming convention `{sku}@{toShopId.slice(-6)}` keeps
    // SKUs distinct per shop without colliding with the source.
    for (const line of transfer.lines) {
      const src = itemById.get(line.itemId);
      if (!src || src.isSerialized) continue;
      const destSku = `${src.sku}@${transfer.toShopId.slice(-6).toUpperCase()}`;
      const existing = await tx.item.findFirst({
        where: { sku: destSku, shopId: transfer.toShopId },
        select: { id: true },
      });
      if (existing) {
        await tx.item.update({
          where: { id: existing.id },
          data: {
            quantityOnHand: { increment: line.quantity },
            // Re-open the row if it had drained to zero previously.
            status: 'IN_STOCK',
          },
        });
      } else {
        await tx.item.create({
          data: {
            tenantId,
            shopId: transfer.toShopId,
            categoryId: src.categoryId,
            sku: destSku,
            barcodeData: destSku,
            name: src.name,
            images: src.images,
            weightMg: src.weightMg,
            purityCaratX100: src.purityCaratX100,
            stoneWeightMg: src.stoneWeightMg,
            costPricePaise: src.costPricePaise,
            makingChargeBps: src.makingChargeBps,
            hallmarkStatus: 'PENDING',
            status: 'IN_STOCK',
            isSerialized: false,
            quantityOnHand: line.quantity,
          },
        });
      }
    }

    return tx.transfer.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedByUserId: userId ?? null,
        completedAt: new Date(),
      },
      include: {
        fromShop: { select: { id: true, name: true, isWarehouse: true } },
        toShop:   { select: { id: true, name: true, isWarehouse: true } },
        lines: true,
      },
    });
  });
  return updated;
}

export async function rejectTransfer(id: string, rejectionReason: string, userId?: string) {
  const transfer = await prisma.transfer.findUnique({ where: { id } });
  if (!transfer) throw new NotFoundError('Transfer not found');
  if (transfer.status !== 'PENDING') {
    throw new BusinessRuleError(
      'TRANSFER_NOT_PENDING',
      `Only PENDING transfers can be rejected (current: ${transfer.status}).`,
    );
  }
  return prisma.transfer.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectionReason,
      rejectedByUserId: userId ?? null,
      rejectedAt: new Date(),
    },
    include: {
      fromShop: { select: { id: true, name: true, isWarehouse: true } },
      toShop:   { select: { id: true, name: true, isWarehouse: true } },
      lines: true,
    },
  });
}

// Items that are eligible to add to a new transfer FROM the given source shop:
// IN_STOCK, in this shop, and (for serialized items only) not already on an
// active transfer. Lot rows can appear in multiple concurrent transfers since
// each transfer just locks against quantityOnHand — UI surfaces the per-line
// quantity check so we don't have to gate the lot row entirely.
export async function listTransferableItems(opts: { shopId: string; cursor?: string; limit?: number }) {
  const take = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const lockedSerializedIds = (
    await prisma.transferLine.findMany({
      where: {
        transfer: { status: { in: ['PENDING', 'APPROVED'] } },
        item: { isSerialized: true },
      },
      select: { itemId: true },
    })
  ).map((l) => l.itemId);

  const where: Prisma.ItemWhereInput = {
    shopId: opts.shopId,
    status: 'IN_STOCK',
    ...(lockedSerializedIds.length > 0 ? { id: { notIn: lockedSerializedIds } } : {}),
  };

  const items = await prisma.item.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true, sku: true, name: true, weightMg: true,
      purityCaratX100: true, costPricePaise: true, images: true,
      isSerialized: true, quantityOnHand: true,
    },
  });
  const hasMore = items.length > take;
  const page = items.slice(0, take);
  return { data: page, page: { nextCursor: hasMore ? page.at(-1)?.id : undefined, hasMore } };
}
