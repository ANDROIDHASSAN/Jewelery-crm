// Stock request (replenishment indent) workflow.
//
// A POS/shop user files a PENDING request listing what they need — by category
// (sub or main) or by collection, with a quantity per line. The admin reviews
// it on the admin "Stock requests" page and either:
//   * FULFILs it  — creates a Transfer (destined to the requesting shop); the
//                   transfer-create flow flips this request to FULFILLED and
//                   links it (see transfers.service.createTransfer).
//   * REJECTs it  — terminal, with an optional note.
// The requester can CANCEL a request while it is still PENDING.
//
// No stock moves here — that happens entirely through the linked Transfer.

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BusinessRuleError } from '../../lib/errors.js';
import { getTenantId } from '../../lib/async-context.js';
import type { StockRequestCreate } from '@goldos/shared/types';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

type StockRequestStatusFilter = 'PENDING' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';

// Shared include — shop + lines (with category/collection names) for list/detail.
const requestInclude = {
  shop: { select: { id: true, name: true } },
  lines: {
    include: {
      category: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
      collection: { select: { id: true, name: true } },
    },
  },
  _count: { select: { lines: true } },
} satisfies Prisma.StockRequestInclude;

export async function createStockRequest(
  input: StockRequestCreate,
  opts: { userId?: string; userShopId?: string },
) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');

  const shopId = input.shopId ?? opts.userShopId;
  if (!shopId) {
    throw new BusinessRuleError(
      'NO_SHOP_FOR_REQUEST',
      'No shop to request for — your account is not assigned to a shop. Ask an admin to set one, or pass a shop explicitly.',
    );
  }

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new NotFoundError('Requesting shop not found');

  // Validate referenced categories / collections belong to this tenant.
  const categoryIds = input.lines.map((l) => l.categoryId).filter((v): v is string => Boolean(v));
  const collectionIds = input.lines.map((l) => l.collectionId).filter((v): v is string => Boolean(v));
  if (categoryIds.length > 0) {
    const found = await prisma.category.count({ where: { id: { in: categoryIds } } });
    if (found !== new Set(categoryIds).size) {
      throw new BusinessRuleError('CATEGORY_NOT_FOUND', 'One or more categories could not be found.');
    }
  }
  if (collectionIds.length > 0) {
    const found = await prisma.collection.count({ where: { id: { in: collectionIds } } });
    if (found !== new Set(collectionIds).size) {
      throw new BusinessRuleError('COLLECTION_NOT_FOUND', 'One or more collections could not be found.');
    }
  }

  return prisma.stockRequest.create({
    data: {
      tenantId,
      shopId,
      note: input.note ?? null,
      requestedByUserId: opts.userId ?? null,
      lines: {
        create: input.lines.map((l) => ({
          categoryId: l.categoryId ?? null,
          collectionId: l.collectionId ?? null,
          quantity: l.quantity,
          note: l.note ?? null,
        })),
      },
    },
    include: requestInclude,
  });
}

export async function listStockRequests(opts: {
  status?: StockRequestStatusFilter;
  shopId?: string;
  cursor?: string;
  limit?: number;
}) {
  const take = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const requests = await prisma.stockRequest.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.shopId ? { shopId: opts.shopId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: requestInclude,
  });
  const hasMore = requests.length > take;
  const page = requests.slice(0, take);
  return { data: page, page: { nextCursor: hasMore ? page.at(-1)?.id : undefined, hasMore } };
}

export async function getStockRequest(id: string) {
  const request = await prisma.stockRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
  if (!request) throw new NotFoundError('Stock request not found');
  return request;
}

export async function rejectStockRequest(id: string, reviewNote?: string | null, userId?: string) {
  const request = await prisma.stockRequest.findUnique({ where: { id } });
  if (!request) throw new NotFoundError('Stock request not found');
  if (request.status !== 'PENDING') {
    throw new BusinessRuleError(
      'REQUEST_NOT_PENDING',
      `Only pending requests can be rejected (current: ${request.status}).`,
    );
  }
  return prisma.stockRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewNote: reviewNote ?? null,
      reviewedByUserId: userId ?? null,
      reviewedAt: new Date(),
    },
    include: requestInclude,
  });
}

export async function cancelStockRequest(id: string, opts: { userId?: string; userShopId?: string }) {
  const request = await prisma.stockRequest.findUnique({ where: { id } });
  if (!request) throw new NotFoundError('Stock request not found');
  // POS users (scoped to a shop) may only cancel their own shop's requests.
  if (opts.userShopId && request.shopId !== opts.userShopId) {
    throw new BusinessRuleError('REQUEST_WRONG_SHOP', 'You can only cancel your own shop’s requests.');
  }
  if (request.status !== 'PENDING') {
    throw new BusinessRuleError(
      'REQUEST_NOT_PENDING',
      `Only pending requests can be cancelled (current: ${request.status}).`,
    );
  }
  return prisma.stockRequest.update({
    where: { id },
    data: { status: 'CANCELLED', reviewedByUserId: opts.userId ?? null, reviewedAt: new Date() },
    include: requestInclude,
  });
}

// Count of PENDING requests — drives the admin sidebar badge.
export async function countPendingStockRequests(): Promise<number> {
  return prisma.stockRequest.count({ where: { status: 'PENDING' } });
}
