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

  // Source items: must exist, be IN_STOCK, and belong to fromShop.
  const items = await prisma.item.findMany({
    where: { id: { in: input.itemIds } },
    select: { id: true, shopId: true, status: true, sku: true },
  });
  if (items.length !== input.itemIds.length) {
    throw new BusinessRuleError('ITEMS_NOT_FOUND', 'One or more items could not be found in this tenant.');
  }
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

  // No double-booking: refuse if any item is already in an active transfer.
  const active = await prisma.transferLine.findFirst({
    where: {
      itemId: { in: input.itemIds },
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

  const transfer = await prisma.transfer.create({
    data: {
      tenantId,
      fromShopId: input.fromShopId,
      toShopId: input.toShopId,
      reason: input.reason,
      notes: input.notes ?? null,
      requestedByUserId: userId ?? null,
      lines: { create: input.itemIds.map((itemId) => ({ itemId })) },
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
    include: { lines: { select: { itemId: true } } },
  });
  if (!transfer) throw new NotFoundError('Transfer not found');
  if (transfer.status !== 'PENDING') {
    throw new BusinessRuleError('TRANSFER_NOT_PENDING', `Cannot approve a ${transfer.status.toLowerCase()} transfer.`);
  }

  const itemIds = transfer.lines.map((l) => l.itemId);
  const itemsNow = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, sku: true, shopId: true, status: true },
  });
  const drifted = itemsNow.find((it) => it.status !== 'IN_STOCK' || it.shopId !== transfer.fromShopId);
  if (drifted) {
    throw new BusinessRuleError(
      'ITEM_DRIFTED',
      `Item ${drifted.sku} is no longer IN_STOCK at the source shop (it may have been sold or moved). Reject and re-create this transfer.`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.item.updateMany({
      where: { id: { in: itemIds } },
      data: { status: 'IN_TRANSIT' },
    });
    await tx.itemMovement.createMany({
      data: itemIds.map((itemId) => ({
        tenantId,
        itemId,
        fromShopId: transfer.fromShopId,
        toShopId: transfer.toShopId,
        type: 'TRANSFER' as const,
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
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: { lines: { select: { itemId: true } } },
  });
  if (!transfer) throw new NotFoundError('Transfer not found');
  if (transfer.status !== 'APPROVED') {
    throw new BusinessRuleError('TRANSFER_NOT_APPROVED', `Cannot complete a ${transfer.status.toLowerCase()} transfer.`);
  }

  const itemIds = transfer.lines.map((l) => l.itemId);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.item.updateMany({
      where: { id: { in: itemIds }, status: 'IN_TRANSIT' },
      data: { shopId: transfer.toShopId, status: 'IN_STOCK' },
    });
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
// IN_STOCK, in this shop, not already in an active transfer.
export async function listTransferableItems(opts: { shopId: string; cursor?: string; limit?: number }) {
  const take = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const lockedIds = (
    await prisma.transferLine.findMany({
      where: { transfer: { status: { in: ['PENDING', 'APPROVED'] } } },
      select: { itemId: true },
    })
  ).map((l) => l.itemId);

  const where: Prisma.ItemWhereInput = {
    shopId: opts.shopId,
    status: 'IN_STOCK',
    ...(lockedIds.length > 0 ? { id: { notIn: lockedIds } } : {}),
  };

  const items = await prisma.item.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true, sku: true, name: true, weightMg: true,
      purityCaratX100: true, costPricePaise: true, images: true,
    },
  });
  const hasMore = items.length > take;
  const page = items.slice(0, take);
  return { data: page, page: { nextCursor: hasMore ? page.at(-1)?.id : undefined, hasMore } };
}
