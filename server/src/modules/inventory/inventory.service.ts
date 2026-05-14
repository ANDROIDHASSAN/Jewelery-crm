// Inventory service — Prisma operations stay tenant-scoped automatically via the extension.

import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BusinessRuleError } from '../../lib/errors.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { computeGoldValuePaise } from '../../lib/money.js';
import type { ItemInput } from '@goldos/shared/types';

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

export async function createItem(input: ItemInput) {
  return prisma.item.create({ data: input });
}

export async function transferItem(id: string, toShopId: string, reason: string, performedByUserId?: string) {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) throw new NotFoundError();
  if (item.status !== 'IN_STOCK') throw new BusinessRuleError('ITEM_NOT_IN_STOCK', 'Item is not in stock');
  return prisma.$transaction([
    prisma.item.update({ where: { id }, data: { status: 'IN_TRANSIT', shopId: toShopId } }),
    prisma.itemMovement.create({
      data: {
        itemId: id,
        fromShopId: item.shopId,
        toShopId,
        type: 'TRANSFER',
        reason,
        performedByUserId: performedByUserId ?? null,
      },
    }),
  ]);
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } });
}

export async function computeValuation(opts: { shopId?: string }) {
  const items = await prisma.item.findMany({
    where: {
      status: 'IN_STOCK',
      ...(opts.shopId ? { shopId: opts.shopId } : {}),
    },
    select: { weightMg: true, purityCaratX100: true },
  });
  let totalPaise = 0;
  let itemCount = 0;
  for (const it of items) {
    const cached = await readGoldRatePaise(it.purityCaratX100);
    const ratePerGramPaise = cached?.paise ?? 642_000; // dev default ₹6,420/g
    totalPaise += computeGoldValuePaise(it.weightMg, it.purityCaratX100, ratePerGramPaise);
    itemCount += 1;
  }
  return { totalPaise, itemCount, asOf: new Date().toISOString() };
}
