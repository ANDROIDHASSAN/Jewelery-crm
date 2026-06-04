// Inventory service — Prisma operations stay tenant-scoped automatically via the extension.

import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BusinessRuleError } from '../../lib/errors.js';
import { readGoldRatePaise } from '../../lib/redis.js';
import { computeGoldValuePaise } from '../../lib/money.js';
import { getTenantId } from '../../lib/async-context.js';
import type { ItemInput, VendorInput, PurchaseOrderCreate, AddStock } from '@goldos/shared/types';

// Kebab-case slug for the storefront Product mirror. Pulls a-z0-9 + dashes,
// collapses runs, trims edges. Falls back to "item" so a degenerate name
// (e.g. all whitespace + emoji) still produces a valid slug.
function slugifyForProduct(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'item';
}

// The admin inventory list paginates via cursor + Load-more. A larger
// default means a fresh page already shows ~half a typical small-shop
// catalogue without clicking Load more once, while still capping per-
// request work so a 100k-item tenant doesn't blow the response time.
// Clients can override via ?limit= (capped at MAX_PAGE_LIMIT).
const DEFAULT_PAGE_LIMIT = 50;
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
    include: {
      diamonds: true,
      collections: { select: { collectionId: true } },
    },
  });
  const hasMore = items.length > take;
  const page = items.slice(0, take).map(withCollectionIds);
  return { data: page, page: { nextCursor: hasMore ? page.at(-1)?.id : undefined, hasMore } };
}

// Flatten the ItemCollection join into a plain `collectionIds: string[]` so the
// client form can round-trip it directly (it submits collectionIds back).
function withCollectionIds<T extends { collections: { collectionId: string }[] }>(item: T) {
  return { ...item, collectionIds: item.collections.map((c) => c.collectionId) };
}

export async function getItem(id: string) {
  const item = await prisma.item.findUnique({
    where: { id },
    include: { diamonds: true, collections: { select: { collectionId: true } } },
  });
  if (!item) throw new NotFoundError();
  return withCollectionIds(item);
}

export async function createItem(input: ItemInput, performedByUserId?: string) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  // `publishToWebsite`, `collectionIds` and `diamonds` are write-time fields,
  // not Item columns — strip them before handing the row to Prisma.
  const { publishToWebsite, collectionIds, diamonds, ...itemData } = input;
  const item = await prisma.item.create({
    data: {
      ...itemData,
      tenantId,
      // Diamond detail lines (M1 FR#4) — booked with their own cost, separate
      // from the metal cost on Item.costPricePaise (M2 §1).
      ...(diamonds && diamonds.length > 0
        ? {
            diamonds: {
              create: diamonds.map((d) => ({
                tenantId,
                shape: d.shape ?? null,
                caratWeightX100: d.caratWeightX100 ?? 0,
                cut: d.cut ?? null,
                clarity: d.clarity ?? null,
                color: d.color ?? null,
                count: d.count ?? 1,
                costPaise: d.costPaise ?? 0,
              })),
            },
          }
        : {}),
      // Collection memberships (M1 FR#1) — many-to-many, single inventory row.
      ...(collectionIds && collectionIds.length > 0
        ? { collections: { create: collectionIds.map((cid) => ({ tenantId, collectionId: cid })) } }
        : {}),
    },
  });
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

  // Storefront mirror: when the admin opts in, also create a Product row so
  // the piece lands on the public catalog. Requires at least one image
  // (ProductInputSchema enforces min(1)) and a display name. If either is
  // missing we silently skip the mirror — the inventory row still lands, and
  // the admin can publish later from the e-commerce tab.
  if (publishToWebsite && item.name && item.images.length > 0) {
    try {
      // Resolve a unique slug per-tenant. If the natural slug already exists
      // (two pieces named "Lotus pendant" in the same tenant), append a short
      // id-derived suffix.
      const baseSlug = slugifyForProduct(item.name ?? item.sku);
      const existing = await prisma.product.findUnique({
        where: { tenantId_slug: { tenantId, slug: baseSlug } },
        select: { id: true },
      });
      const slug = existing ? `${baseSlug}-${item.id.slice(-6).toLowerCase()}` : baseSlug;
      await prisma.product.create({
        data: {
          tenantId,
          linkedItemId: item.id,
          name: item.name ?? item.sku,
          slug,
          categoryId: item.categoryId,
          // Master description flows to the storefront (M3 FR#5). Admin can
          // still enrich it later from the e-commerce tab.
          descriptionMd: item.description ?? '',
          images: item.images,
          weightMg: item.weightMg,
          purityCaratX100: item.purityCaratX100,
          makingChargeBps: item.makingChargeBps ?? 0,
          // basePricePaise mirrors costPricePaise as a starting point. The
          // storefront pricing surface re-prices on the fly from the live
          // gold rate (see ecommerce.routes), so this is mostly a floor for
          // non-gold pieces.
          basePricePaise: item.costPricePaise,
          stoneChargePaise: 0,
          isPublished: true,
        },
      });
    } catch (err) {
      // Mirror failure must not break the primary Item create — log and move
      // on. The admin will see the inventory row landed; storefront publish
      // can be retried from the e-commerce tab.
      console.error('[inventory.createItem] Product mirror failed', err);
    }
  }

  return item;
}

export async function updateItem(id: string, patch: Partial<ItemInput>, performedByUserId?: string) {
  const tenantId = getTenantId();
  const before = await prisma.item.findUnique({ where: { id } });
  if (!before) throw new NotFoundError();
  // `publishToWebsite`, `collectionIds`, `diamonds` are write-only — never
  // persist them as Item columns.
  const { publishToWebsite: _ignored, collectionIds, diamonds, ...itemPatch } = patch;
  const item = await prisma.item.update({ where: { id }, data: itemPatch });

  // Replace diamond lines when the patch includes them (full-set semantics:
  // the form always submits the complete current list).
  if (diamonds !== undefined && tenantId) {
    await prisma.$transaction([
      prisma.itemDiamond.deleteMany({ where: { itemId: id } }),
      ...(diamonds.length > 0
        ? [
            prisma.itemDiamond.createMany({
              data: diamonds.map((d) => ({
                tenantId,
                itemId: id,
                shape: d.shape ?? null,
                caratWeightX100: d.caratWeightX100 ?? 0,
                cut: d.cut ?? null,
                clarity: d.clarity ?? null,
                color: d.color ?? null,
                count: d.count ?? 1,
                costPaise: d.costPaise ?? 0,
              })),
            }),
          ]
        : []),
    ]);
  }

  // Replace collection memberships when included (same full-set semantics).
  if (collectionIds !== undefined && tenantId) {
    await prisma.$transaction([
      prisma.itemCollection.deleteMany({ where: { itemId: id } }),
      ...(collectionIds.length > 0
        ? [
            prisma.itemCollection.createMany({
              data: collectionIds.map((cid) => ({ tenantId, itemId: id, collectionId: cid })),
            }),
          ]
        : []),
    ]);
  }

  // Keep the storefront mirror in sync for visible fields. Only patches that
  // include those fields hit the Product row, so silent edits to private
  // fields (cost price, hallmark ref) don't churn the public catalog.
  const mirrorPatch: Prisma.ProductUpdateInput = {};
  if (itemPatch.name !== undefined && itemPatch.name !== null) mirrorPatch.name = itemPatch.name;
  if (itemPatch.description !== undefined && itemPatch.description !== null) {
    mirrorPatch.descriptionMd = itemPatch.description;
  }
  if (itemPatch.images !== undefined) mirrorPatch.images = { set: itemPatch.images };
  if (itemPatch.weightMg !== undefined) mirrorPatch.weightMg = itemPatch.weightMg;
  if (itemPatch.purityCaratX100 !== undefined) mirrorPatch.purityCaratX100 = itemPatch.purityCaratX100;
  if (itemPatch.makingChargeBps !== undefined && itemPatch.makingChargeBps !== null) {
    mirrorPatch.makingChargeBps = itemPatch.makingChargeBps;
  }
  if (Object.keys(mirrorPatch).length > 0) {
    try {
      await prisma.product.updateMany({
        where: { linkedItemId: id },
        data: mirrorPatch as Prisma.ProductUpdateManyMutationInput,
      });
    } catch (err) {
      console.error('[inventory.updateItem] Product mirror sync failed', err);
    }
  }

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

// transferItem() removed — stock moves now go through the /transfers
// workflow (PENDING -> APPROVED -> COMPLETED). See
// server/src/modules/transfers/transfers.service.ts.

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

// Add stock to an existing Item. Behavior depends on the target row's
// `isSerialized` flag:
//
//   serialized=true:
//     Clones N new Item rows with auto-generated SKUs (pattern `{sku}-{nanoid6}`),
//     copies weight / purity / category / shopId / makingChargeBps from the
//     source, and writes one PURCHASE ItemMovement (qty=1) per new row. The
//     source row is unchanged. Optional costPricePaise overrides the cloned
//     rows' cost.
//
//   serialized=false (lot):
//     Increments the source row's quantityOnHand by N and writes a single
//     PURCHASE ItemMovement with qty=N. Cost-price override updates the
//     source row in place.
//
// Wrapped in $transaction so partial writes cannot land. The whole thing
// happens through the tenant-scoped Prisma client; tx callbacks inherit the
// same tenant context via AsyncLocalStorage.
//
// Throws BusinessRuleError if the target item is not IN_STOCK (sold, melted,
// or in transit). The Sheet UI gates the button on status anyway.
export async function addStock(
  itemId: string,
  input: AddStock,
  performedByUserId?: string,
): Promise<{ mode: 'serialized' | 'lot'; added: number; newQuantity?: number; newItemIds?: string[] }> {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');

  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Item not found');
  if (item.status !== 'IN_STOCK') {
    throw new BusinessRuleError(
      'ITEM_NOT_IN_STOCK',
      `Cannot add stock — item is ${item.status.toLowerCase()}. Restore or recreate the item first.`,
    );
  }

  const reason = input.reason?.trim() || 'Stock added manually';

  if (item.isSerialized) {
    // Clone N rows + N PURCHASE movements. Unique SKU suffix per clone via
    // crypto.randomBytes — base32-ish (uppercased base64url) for 6 chars.
    const baseSku = item.sku;
    const newItems = await prisma.$transaction(async (tx) => {
      const created: { id: string; sku: string }[] = [];
      for (let i = 0; i < input.quantity; i += 1) {
        // Loop on collision; retries are bounded — 36^6 ≈ 2.1 B suffixes.
        let sku = '';
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const suffix = crypto
            .randomBytes(8)
            .toString('base64url')
            .replace(/[^A-Za-z0-9]/g, '')
            .slice(0, 6)
            .toUpperCase();
          sku = `${baseSku}-${suffix}`;
          const dupe = await tx.item.findUnique({
            where: { tenantId_sku: { tenantId, sku } },
            select: { id: true },
          });
          if (!dupe) break;
          sku = '';
        }
        if (!sku) {
          throw new BusinessRuleError('SKU_COLLISION', 'Could not allocate a unique SKU suffix; retry the request.');
        }
        const clone = await tx.item.create({
          data: {
            tenantId,
            shopId: item.shopId,
            categoryId: item.categoryId,
            sku,
            barcodeData: sku,
            name: item.name,
            images: item.images,
            weightMg: item.weightMg,
            purityCaratX100: item.purityCaratX100,
            stoneWeightMg: item.stoneWeightMg,
            hallmarkStatus: 'PENDING',
            costPricePaise: input.costPricePaise ?? item.costPricePaise,
            makingChargeBps: item.makingChargeBps,
            status: 'IN_STOCK',
            isSerialized: true,
            quantityOnHand: 1,
          },
          select: { id: true, sku: true },
        });
        await tx.itemMovement.create({
          data: {
            tenantId,
            itemId: clone.id,
            toShopId: item.shopId,
            type: 'PURCHASE',
            qty: 1,
            reason,
            performedByUserId: performedByUserId ?? null,
          },
        });
        created.push(clone);
      }
      return created;
    });

    // Audit: one row summarising the bulk add against the source design.
    void writeAudit(
      'Item',
      itemId,
      'ADD_STOCK',
      { mode: 'serialized', sourceSku: baseSku },
      { mode: 'serialized', added: newItems.length, newSkus: newItems.map((i) => i.sku) },
      performedByUserId,
    );

    return {
      mode: 'serialized',
      added: newItems.length,
      newItemIds: newItems.map((i) => i.id),
    };
  }

  // Lot path: bump quantityOnHand on the existing row + one PURCHASE movement.
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id: itemId },
      data: {
        quantityOnHand: { increment: input.quantity },
        ...(input.costPricePaise !== undefined ? { costPricePaise: input.costPricePaise } : {}),
      },
      select: { quantityOnHand: true },
    });
    await tx.itemMovement.create({
      data: {
        tenantId,
        itemId,
        toShopId: item.shopId,
        type: 'PURCHASE',
        qty: input.quantity,
        reason,
        performedByUserId: performedByUserId ?? null,
      },
    });
    return updated;
  });

  void writeAudit(
    'Item',
    itemId,
    'ADD_STOCK',
    { mode: 'lot', quantityOnHand: item.quantityOnHand },
    { mode: 'lot', added: input.quantity, newQuantity: result.quantityOnHand },
    performedByUserId,
  );

  return {
    mode: 'lot',
    added: input.quantity,
    newQuantity: result.quantityOnHand,
  };
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
  // Flat list — the client reconstructs the tree from `parentId` for the
  // two-level picker (Main → Sub). Keeping the wire format flat means
  // existing consumers that ignore parentId stay happy.
  return prisma.category.findMany({
    // Manual priority first (lower sortOrder = higher), then name as a stable
    // tiebreak so categories with the default sortOrder=0 stay alphabetical.
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      parentId: true,
      metalType: true,
      defaultMakingChargeBps: true,
      makingChargeMode: true,
      defaultMakingChargePerGramPaise: true,
      sortOrder: true,
      code: true,
    },
  });
}

// Throws CATEGORY_DUPLICATE_NAME if a sibling category (same tenant + parent)
// already has this name, case-insensitively. `excludeId` skips the row being
// edited. This complements the DB unique index (which can't see NULL parentId
// rows as equal) so main categories are de-duplicated too.
async function assertUniqueCategoryName(
  tenantId: string,
  parentId: string | null,
  name: string,
  excludeId?: string,
) {
  const trimmed = name.trim();
  const sibling = await prisma.category.findFirst({
    where: {
      tenantId,
      parentId,
      name: { equals: trimmed, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (sibling) {
    throw new BusinessRuleError(
      'CATEGORY_DUPLICATE_NAME',
      `A ${parentId ? 'sub-category' : 'category'} named "${trimmed}" already exists here.`,
    );
  }
}

type CategoryMetalType = 'GOLD' | 'SILVER' | 'DIAMOND' | 'PLATINUM' | 'STAINLESS_STEEL' | 'OTHER';
type MakingMode = 'PERCENTAGE' | 'PER_GRAM';

export async function createCategory(input: {
  name: string;
  parentId: string | null;
  metalType: CategoryMetalType;
  defaultMakingChargeBps: number;
  makingChargeMode?: MakingMode;
  defaultMakingChargePerGramPaise?: number | null;
  code?: string | null;
}) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  // Guard against pointing at a sibling tenant's category. Without this a
  // crafted parentId could leak hierarchy across tenants.
  if (input.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: input.parentId },
      select: { id: true, metalType: true },
    });
    if (!parent) throw new NotFoundError('Parent category not found');
    // Sub-categories inherit their parent's metal type. This prevents the
    // "Non-precious shows on a gold sub-category" bug (M1 Bug1 / M3 Bug1):
    // the purity picker keys off the category's metalType, so a gold sub
    // saved with a stray OTHER would mis-render. A sub is always its main's
    // metal.
    input = { ...input, metalType: parent.metalType as CategoryMetalType };
  }
  // Reject a duplicate name within the same parent (M1 Bug2).
  await assertUniqueCategoryName(tenantId, input.parentId, input.name);
  const created = await prisma.category.create({
    data: {
      tenantId,
      name: input.name.trim(),
      parentId: input.parentId,
      metalType: input.metalType,
      defaultMakingChargeBps: input.defaultMakingChargeBps,
      makingChargeMode: input.makingChargeMode ?? 'PERCENTAGE',
      defaultMakingChargePerGramPaise: input.defaultMakingChargePerGramPaise ?? null,
      code: input.code ? input.code.trim().toUpperCase() : null,
    },
  });
  void writeAudit('Category', created.id, 'CREATE', null, created);
  return created;
}

export async function updateCategory(
  id: string,
  patch: {
    name?: string;
    parentId?: string | null;
    metalType?: CategoryMetalType;
    defaultMakingChargeBps?: number;
    makingChargeMode?: MakingMode;
    defaultMakingChargePerGramPaise?: number | null;
    code?: string | null;
  },
) {
  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) throw new NotFoundError();
  // Disallow making a category its own parent or a descendant — would create
  // an infinite loop in the tree walker.
  if (patch.parentId === id) {
    throw new BusinessRuleError('CATEGORY_SELF_PARENT', 'A category cannot be its own parent.');
  }
  if (patch.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: patch.parentId },
      select: { parentId: true, id: true },
    });
    if (!parent) throw new NotFoundError('Parent category not found');
    // Walk upward — if we hit `id` we'd form a cycle.
    let cursor: string | null = parent.parentId;
    while (cursor) {
      if (cursor === id) {
        throw new BusinessRuleError('CATEGORY_CYCLE', 'That would create a parent-child cycle.');
      }
      const next = await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = next?.parentId ?? null;
    }
  }
  // A sub-category always inherits its parent's metal type (see createCategory).
  // Resolve the effective metalType: if this row has/gets a parent, use the
  // parent's; otherwise honour an explicit patch.
  let effectiveMetalType = patch.metalType;
  const resolvedParentId = patch.parentId !== undefined ? patch.parentId : before.parentId;
  if (resolvedParentId) {
    const parent = await prisma.category.findUnique({
      where: { id: resolvedParentId },
      select: { metalType: true },
    });
    if (parent) effectiveMetalType = parent.metalType as CategoryMetalType;
  }
  // Reject a rename/move that collides with a sibling name (M1 Bug2).
  if (patch.name !== undefined || patch.parentId !== undefined) {
    await assertUniqueCategoryName(
      before.tenantId,
      resolvedParentId ?? null,
      patch.name ?? before.name,
      id,
    );
  }
  const updated = await prisma.category.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
      ...(effectiveMetalType !== undefined ? { metalType: effectiveMetalType } : {}),
      ...(patch.defaultMakingChargeBps !== undefined
        ? { defaultMakingChargeBps: patch.defaultMakingChargeBps }
        : {}),
      ...(patch.makingChargeMode !== undefined
        ? { makingChargeMode: patch.makingChargeMode }
        : {}),
      ...(patch.defaultMakingChargePerGramPaise !== undefined
        ? { defaultMakingChargePerGramPaise: patch.defaultMakingChargePerGramPaise }
        : {}),
      ...(patch.code !== undefined
        ? { code: patch.code ? patch.code.trim().toUpperCase() : null }
        : {}),
    },
  });
  void writeAudit('Category', id, 'UPDATE', before, updated);
  return updated;
}

export async function deleteCategory(id: string) {
  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) throw new NotFoundError();
  // Refuse if items still reference this category — orphaning Items would
  // break valuation, analytics, and the POS catalogue. Move the items first.
  const itemCount = await prisma.item.count({ where: { categoryId: id } });
  if (itemCount > 0) {
    throw new BusinessRuleError(
      'CATEGORY_HAS_ITEMS',
      `Cannot delete — ${itemCount} item${itemCount === 1 ? '' : 's'} still use this category. Re-assign them first.`,
    );
  }
  // Same for child categories. Re-parent or delete those first.
  const childCount = await prisma.category.count({ where: { parentId: id } });
  if (childCount > 0) {
    throw new BusinessRuleError(
      'CATEGORY_HAS_CHILDREN',
      `Cannot delete — ${childCount} sub-categor${childCount === 1 ? 'y' : 'ies'} still nest under this one.`,
    );
  }
  await prisma.category.delete({ where: { id } });
  void writeAudit('Category', id, 'DELETE', before, null);
}

export async function updateCategoryMakingCharge(id: string, bps: number) {
  return prisma.category.update({ where: { id }, data: { defaultMakingChargeBps: bps } });
}

// Persist a manual ordering for a set of categories (M1 FR#6). Each entry maps
// a category id to its new sortOrder. Tenant-scoped through the Prisma client
// extension; we only touch rows that belong to the caller's tenant.
export async function reorderCategories(orders: Array<{ id: string; sortOrder: number }>) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  await prisma.$transaction(
    orders.map((o) =>
      prisma.category.updateMany({
        where: { id: o.id, tenantId },
        data: { sortOrder: o.sortOrder },
      }),
    ),
  );
  return listCategories();
}

// ── Collections (cross-category groupings) ─────────────────────────────────

function slugifyCollection(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'collection';
}

export async function listCollections() {
  return prisma.collection.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, slug: true, description: true, sortOrder: true },
  });
}

export async function createCollection(input: {
  name: string;
  slug?: string;
  description?: string | null;
  sortOrder?: number;
}) {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  // Derive a unique slug per tenant; append a short random suffix on collision.
  const base = slugifyCollection(input.slug || input.name);
  const existing = await prisma.collection.findUnique({
    where: { tenantId_slug: { tenantId, slug: base } },
    select: { id: true },
  });
  const slug = existing ? `${base}-${crypto.randomBytes(2).toString('hex')}` : base;
  const created = await prisma.collection.create({
    data: {
      tenantId,
      name: input.name.trim(),
      slug,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  void writeAudit('Collection', created.id, 'CREATE', null, created);
  return created;
}

export async function updateCollection(
  id: string,
  patch: { name?: string; description?: string | null; sortOrder?: number },
) {
  const before = await prisma.collection.findUnique({ where: { id } });
  if (!before) throw new NotFoundError();
  const updated = await prisma.collection.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
  void writeAudit('Collection', id, 'UPDATE', before, updated);
  return updated;
}

export async function deleteCollection(id: string) {
  const before = await prisma.collection.findUnique({ where: { id } });
  if (!before) throw new NotFoundError();
  // ItemCollection rows cascade-delete; the items themselves are untouched.
  await prisma.collection.delete({ where: { id } });
  void writeAudit('Collection', id, 'DELETE', before, null);
}

// Derive a short SKU code from a category name when no explicit code is set, so
// SKUs are never the bare "SKU-001" fallback. Heuristic:
//   - a leading number-bearing token is kept whole (18K, 9, 925);
//   - each remaining word contributes its first letter;
//   - a single word with no digits uses its first 3 letters (collision-safe:
//     "Earings"→EAR and "Rings"→RIN stay distinct).
// Examples: "18K Gold Tone"→18KGT, "9 K Fine Gold"→9KFG,
//           "925 Sterling Silver"→925SS, "Necklaces & Chains"→NC,
//           "Rings"→RIN, "Earings"→EAR, "Bracelets"→BRA. The merchant can
//           override any of these via the category's Code field for an exact
//           abbreviation (e.g. RG, NK).
function deriveCategoryCode(name: string): string {
  const words = name
    .replace(/&/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'GEN';
  if (words.length === 1) {
    const w = (words[0] ?? '').toUpperCase();
    return w.slice(0, /\d/.test(w) ? 6 : 3);
  }
  let code = '';
  words.forEach((w, i) => {
    const up = w.toUpperCase();
    code += i === 0 && /\d/.test(up) ? up : up[0];
  });
  return code.slice(0, 8);
}

// Suggest the next SKU for a category. The prefix combines the MAIN category
// code and the SUB category code, then a per-prefix 3-digit sequence:
//   main "18K Gold Tone" (18KGT) + sub "Ring" (RG) → 18KGT-RG-001, -002, …
//   main "9K Fine Gold"  (9KFG)  + sub "Necklace" (NK) → 9KFG-NK-001, …
// Codes default to an auto-derived abbreviation of the category name; set an
// explicit Code on the category to override. The client prefills the SKU field
// with this when the category changes; the user can still edit it before
// saving (SKU stays free-form, unique per tenant). M3 FR#6.
export async function suggestSku(categoryId: string): Promise<{ sku: string; code: string | null }> {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: {
      code: true,
      name: true,
      parentId: true,
      parent: { select: { code: true, name: true } },
    },
  });
  // Explicit code wins; otherwise derive one from the category name.
  const codeFor = (code?: string | null, name?: string | null) =>
    (code ? code.trim().toUpperCase() : name ? deriveCategoryCode(name) : '');
  const subCode = codeFor(cat?.code, cat?.name);
  const mainCode = codeFor(cat?.parent?.code, cat?.parent?.name);
  // Build the prefix: [main]-[sub] for a sub-category; just [code] for a main.
  const parts = cat?.parentId ? [mainCode, subCode] : [subCode];
  const prefix = parts.filter(Boolean).join('-') || 'SKU';
  // Count existing items whose SKU already starts with this prefix to derive
  // the next sequence number. Cheap + good enough; collisions are caught by the
  // unique (tenantId, sku) constraint and the user can edit before saving.
  const count = await prisma.item.count({
    where: { sku: { startsWith: `${prefix}-` } },
  });
  const seq = String(count + 1).padStart(3, '0');
  return { sku: `${prefix}-${seq}`, code: prefix };
}

export async function computeValuation(opts: { shopId?: string }) {
  const items = await prisma.item.findMany({
    where: {
      status: 'IN_STOCK',
      ...(opts.shopId ? { shopId: opts.shopId } : {}),
    },
    select: {
      weightMg: true,
      purityCaratX100: true,
      shopId: true,
      categoryId: true,
      isSerialized: true,
      quantityOnHand: true,
      costPricePaise: true,
      category: { select: { metalType: true } },
      diamonds: { select: { costPaise: true } },
    },
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
  let totalItemCount = 0;
  const byShop = new Map<string, { totalPaise: number; itemCount: number }>();
  const byCategory = new Map<string, { totalPaise: number; itemCount: number }>();
  for (const it of items) {
    const ratePerGramPaise = rateByPurity.get(it.purityCaratX100) ?? 642_000;
    // Per-piece value (weight is recorded per piece for both modes). Stainless
    // steel is non-precious — it has no live metal rate, so we value it at its
    // recorded cost price instead of recomputing off the gold rate.
    const metalPerPiece =
      it.category.metalType === 'STAINLESS_STEEL'
        ? it.costPricePaise
        : computeGoldValuePaise(it.weightMg, it.purityCaratX100, ratePerGramPaise);
    // Diamond cost is booked separately from the metal (M2 §1) and added on top
    // of the metal value so a diamond ring is valued at gold + Σ diamond cost.
    const diamondCost = it.diamonds.reduce((sum, d) => sum + d.costPaise, 0);
    const perPiece = metalPerPiece + diamondCost;
    // Lot rows hold N interchangeable pieces — value and item count scale.
    const units = it.isSerialized ? 1 : it.quantityOnHand;
    const value = perPiece * units;
    totalPaise += value;
    totalItemCount += units;
    const shopAgg = byShop.get(it.shopId) ?? { totalPaise: 0, itemCount: 0 };
    shopAgg.totalPaise += value;
    shopAgg.itemCount += units;
    byShop.set(it.shopId, shopAgg);
    const catAgg = byCategory.get(it.categoryId) ?? { totalPaise: 0, itemCount: 0 };
    catAgg.totalPaise += value;
    catAgg.itemCount += units;
    byCategory.set(it.categoryId, catAgg);
  }
  return {
    totalPaise,
    itemCount: totalItemCount,
    byShop: Array.from(byShop.entries()).map(([shopId, v]) => ({ shopId, ...v })),
    byCategory: Array.from(byCategory.entries()).map(([categoryId, v]) => ({ categoryId, ...v })),
    asOf: new Date().toISOString(),
  };
}

export async function computeLowStock(threshold: number) {
  // (1) Per-bucket aggregate: counts IN_STOCK pieces per (shopId, categoryId)
  //     so the UI can keep the "Bridal at Karnal — 1 piece left" summary
  //     header. Lot rows contribute SUM(quantityOnHand); serialized rows
  //     contribute COUNT(*). Prisma's groupBy can't do conditional aggregates
  //     so we run two queries and merge in JS.
  const serializedGrouped = await prisma.item.groupBy({
    by: ['categoryId', 'shopId'],
    where: { status: 'IN_STOCK', isSerialized: true },
    _count: { _all: true },
  });
  const lotGrouped = await prisma.item.groupBy({
    by: ['categoryId', 'shopId'],
    where: { status: 'IN_STOCK', isSerialized: false },
    _sum: { quantityOnHand: true },
  });
  const bucketKey = (categoryId: string, shopId: string): string => `${categoryId}::${shopId}`;
  const counts = new Map<string, { categoryId: string; shopId: string; itemCount: number }>();
  for (const g of serializedGrouped) {
    counts.set(bucketKey(g.categoryId, g.shopId), {
      categoryId: g.categoryId,
      shopId: g.shopId,
      itemCount: g._count._all,
    });
  }
  for (const g of lotGrouped) {
    const key = bucketKey(g.categoryId, g.shopId);
    const existing = counts.get(key);
    const lotSum = g._sum.quantityOnHand ?? 0;
    if (existing) {
      existing.itemCount += lotSum;
    } else {
      counts.set(key, { categoryId: g.categoryId, shopId: g.shopId, itemCount: lotSum });
    }
  }
  const lowBuckets = Array.from(counts.values()).filter((r) => r.itemCount <= threshold);

  // (2) Per-product restock list. Three independent triggers — an item enters
  // this list if ANY of the following holds:
  //   A. Lot row whose quantityOnHand <= threshold (including 0 / drained).
  //      Catches "I sold every gold bar and now this needs restocking" —
  //      previously hidden because the SOLD status was filtered out.
  //   B. Lot row whose status is SOLD (catches edge case where qty cleanup
  //      drifted; defensive).
  //   C. Any IN_STOCK item (serialized OR lot) that lives in a low bucket.
  //      Keeps the historical "design X at shop Y running thin" semantics
  //      for serialized SKUs where each piece is its own row.
  const orClauses: Prisma.ItemWhereInput[] = [
    { isSerialized: false, quantityOnHand: { lte: threshold } },
    { isSerialized: false, status: 'SOLD' },
  ];
  if (lowBuckets.length > 0) {
    orClauses.push({
      status: 'IN_STOCK',
      OR: lowBuckets.map((b) => ({ categoryId: b.categoryId, shopId: b.shopId })),
    });
  }
  const items = await prisma.item.findMany({
    where: { OR: orClauses },
    // Most-urgent-first: SOLD/0-qty at the top, then by ascending qty, then
    // newest within the same urgency. The UI mirrors this order.
    orderBy: [{ quantityOnHand: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      sku: true,
      name: true,
      images: true,
      shopId: true,
      categoryId: true,
      weightMg: true,
      purityCaratX100: true,
      costPricePaise: true,
      hallmarkStatus: true,
      isSerialized: true,
      quantityOnHand: true,
      status: true,
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
