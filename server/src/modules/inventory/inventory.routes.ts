import { Router } from 'express';
import multer from 'multer';
import {
  ItemInputSchema,
  VendorInputSchema,
  PurchaseOrderCreateSchema,
  PurchaseOrderUpdateSchema,
  PurchaseOrderGstSchema,
  WastageInputSchema,
  AddStockSchema,
} from '@goldos/shared/schemas';
import { z } from 'zod';
import type { SaleDiscountType } from '@prisma/client';
import * as svc from './inventory.service.js';
import {
  bulkImportItems,
  bulkImportTemplate,
  bulkImportPurchaseOrders,
  bulkImportPoTemplate,
} from './bulk-import.service.js';
import { requirePermission, requireAnyPermission } from '../../middleware/require-permission.js';
import { prisma } from '../../lib/prisma.js';
import { getTenantId, runWithTenant } from '../../lib/async-context.js';

export const inventoryRouter: Router = Router();

// Multer storage — in-memory, 8MB cap. Bulk-import sheets are typically
// well under 1MB (10k rows of jewellery items fits in ~300KB), so 8MB is
// a generous ceiling that still kills accidentally-attached photos before
// they hit Express's body parser. Stored in RAM, never on disk, so we
// don't have to manage temp-file cleanup or worry about a stray .xlsx
// from one tenant being readable by another.
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

// Action-level RBAC gates. The mount-level gate in app.ts accepts any of
// inventory.{read,write,delete,transfer,wastage,purchase_order,hallmark,audit}
// so a user with only `inventory.read` clears the mount and still hits this
// router — we have to gate every mutating route here or read users can write.

const ListQuery = z.object({
  shopId: z.string().optional(),
  categoryId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

inventoryRouter.get('/items', async (req, res, next) => {
  try {
    const q = ListQuery.parse(req.query);
    res.json(await svc.listItems(q));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/items/:id', async (req, res, next) => {
  try {
    res.json({ data: await svc.getItem(req.params['id']!) });
  } catch (err) {
    next(err);
  }
});

// Bulk import — Excel or CSV upload. `dryRun=true` validates and returns
// the would-insert result without writing. Use that to drive the preview
// UI; flip to false (or omit) to commit.
inventoryRouter.post(
  '/items/bulk-import',
  requirePermission('inventory.write'),
  bulkUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({
          error: { code: 'FILE_REQUIRED', message: 'Attach the spreadsheet as form field "file"' },
        });
        return;
      }
      const dryRun = String(req.body['dryRun'] ?? '').toLowerCase() === 'true';
      // Re-establish the tenant context here: multer parses the upload on
      // socket I/O events whose async context predates tenantScope, so the
      // AsyncLocalStorage store is lost by the time this handler runs. Rebuild
      // it from req.user (which survives on the request object) so the service's
      // getTenantId() resolves.
      const result = await runWithTenant(
        { tenantId: req.user!.tenantId, userId: req.user!.userId, shopId: req.user!.shopId },
        () =>
          bulkImportItems({
            fileBuffer: req.file!.buffer,
            filename: req.file!.originalname,
            dryRun,
            performedByUserId: req.user?.userId,
          }),
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// Template for the import UI — returns the canonical columns + example
// rows so the client can offer a downloadable template that always
// matches the validator.
inventoryRouter.get(
  '/items/bulk-import/template',
  requirePermission('inventory.write'),
  (_req, res) => {
    res.json({ data: bulkImportTemplate() });
  },
);

inventoryRouter.post('/items', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = ItemInputSchema.parse(req.body);
    const item = await svc.createItem(body, req.user?.userId);
    res.status(201).json({ data: item });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch('/items/:id', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = ItemInputSchema.partial().parse(req.body);
    const item = await svc.updateItem(req.params['id']!, body, req.user?.userId);
    res.json({ data: item });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.delete('/items/:id', requirePermission('inventory.delete'), async (req, res, next) => {
  try {
    const result = await svc.deleteItem(req.params['id']!, req.user?.userId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// Legacy one-shot transfer endpoint removed. Stock moves now go through the
// /transfers workflow (PENDING -> APPROVED -> COMPLETED). See
// server/src/modules/transfers/ and client TransfersPage.

// Add stock against an existing Item. Behavior branches on isSerialized:
// clones N rows for serialized items, increments quantityOnHand for lot items.
// Works for both SuperAdmin and Accountant — they share the inventory.write
// permission (see ROLE_DEFAULT_PERMISSIONS in shared/constants.ts).
inventoryRouter.post('/items/:id/add-stock', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = AddStockSchema.parse(req.body);
    const result = await svc.addStock(req.params['id']!, body, req.user?.userId);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/items/:id/wastage', requirePermission('inventory.wastage'), async (req, res, next) => {
  try {
    const body = WastageInputSchema.parse({ itemId: req.params['id'], ...req.body });
    const movement = await svc.recordWastage(body.itemId, body.reason, req.user?.userId);
    res.status(201).json({ data: movement });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/movements', async (req, res, next) => {
  try {
    const q = z
      .object({
        itemId: z.string().optional(),
        type: z.enum(['PURCHASE', 'TRANSFER', 'SALE', 'RETURN', 'WASTAGE', 'ADJUSTMENT']).optional(),
        cursor: z.string().optional(),
      })
      .parse(req.query);
    res.json(await svc.listMovements(q));
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/categories', async (_req, res, next) => {
  try {
    const cats = await svc.listCategories();
    res.json({ data: cats, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

// Create + update + delete categories (Admin + Accountant via inventory.write).
const CategoryCreateBody = z.object({
  name: z.string().min(2).max(80),
  parentId: z.string().min(1).nullable(),
  metalType: z.enum(['GOLD', 'SILVER', 'DIAMOND', 'PLATINUM', 'STAINLESS_STEEL', 'OTHER']),
  defaultMakingChargeBps: z.number().int().min(0).max(10_000),
  makingChargeMode: z.enum(['PERCENTAGE', 'PER_GRAM']).optional(),
  defaultMakingChargePerGramPaise: z.number().int().min(0).optional().nullable(),
  code: z
    .string()
    .regex(/^[A-Z0-9]{1,8}$/, 'Code must be 1–8 uppercase letters/digits')
    .optional()
    .nullable(),
});

inventoryRouter.post('/categories', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = CategoryCreateBody.parse(req.body);
    const cat = await svc.createCategory(body);
    res.status(201).json({ data: cat });
  } catch (err) {
    next(err);
  }
});

// Persist manual sub-category ordering (drag-to-reorder). Registered BEFORE the
// `/categories/:id` PATCH so "reorder" isn't captured as an :id. Body is the
// full ordered list: [{ id, sortOrder }, ...].
const CategoryReorderBody = z.object({
  orders: z
    .array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0).max(100_000) }))
    .min(1)
    .max(500),
});

inventoryRouter.patch('/categories/reorder', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = CategoryReorderBody.parse(req.body);
    const cats = await svc.reorderCategories(body.orders);
    res.json({ data: cats, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch('/categories/:id', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = CategoryCreateBody.partial().parse(req.body);
    const cat = await svc.updateCategory(req.params['id']!, body);
    res.json({ data: cat });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.delete('/categories/:id', requirePermission('inventory.delete'), async (req, res, next) => {
  try {
    await svc.deleteCategory(req.params['id']!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch('/categories/:id/making-charge', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = z.object({ defaultMakingChargeBps: z.number().int().min(0).max(10_000) }).parse(req.body);
    const updated = await svc.updateCategoryMakingCharge(req.params['id']!, body.defaultMakingChargeBps);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// Suggest the next SKU for a category ([CODE]-[sequence]); the create form
// prefills the SKU field with it. User can still override before saving.
inventoryRouter.get('/sku-suggestion', async (req, res, next) => {
  try {
    const categoryId = typeof req.query['categoryId'] === 'string' ? req.query['categoryId'] : '';
    if (!categoryId) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'categoryId required' } });
      return;
    }
    res.json({ data: await svc.suggestSku(categoryId) });
  } catch (err) {
    next(err);
  }
});

// ── Collections (cross-category groupings) ────────────────────────────────
const CollectionBody = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

inventoryRouter.get('/collections', async (_req, res, next) => {
  try {
    res.json({ data: await svc.listCollections(), page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/collections', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = CollectionBody.parse(req.body);
    res.status(201).json({ data: await svc.createCollection(body) });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch('/collections/:id', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = CollectionBody.partial().parse(req.body);
    res.json({ data: await svc.updateCollection(req.params['id']!, body) });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.delete('/collections/:id', requirePermission('inventory.delete'), async (req, res, next) => {
  try {
    await svc.deleteCollection(req.params['id']!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Get items in a collection
inventoryRouter.get('/collections/:collectionId/items', async (req, res, next) => {
  try {
    const collectionId = req.params['collectionId']!;
    const items = await prisma.itemCollection.findMany({
      where: { collectionId },
      include: {
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            images: true,
            weightMg: true,
            purityCaratX100: true,
            status: true,
          },
        },
      },
      orderBy: { item: { createdAt: 'desc' } },
    });
    const itemsWithDetails = items.map((ic) => ({
      id: ic.item.id,
      sku: ic.item.sku,
      name: ic.item.name,
      images: ic.item.images,
      weightMg: ic.item.weightMg,
      purityCaratX100: ic.item.purityCaratX100,
      status: ic.item.status,
    }));
    res.json({ data: itemsWithDetails, page: { hasMore: false } });
  } catch (err) {
    next(err);
  }
});

// Add items to a collection
inventoryRouter.post(
  '/collections/:collectionId/items',
  requirePermission('inventory.write'),
  async (req, res, next) => {
    try {
      const collectionId = req.params['collectionId']!;
      const { itemIds } = z.object({ itemIds: z.array(z.string().min(1)) }).parse(req.body);

      // Check collection exists
      const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
      if (!collection) {
        res.status(404).json({ error: { message: 'Collection not found' } });
        return;
      }

      const tenantId = getTenantId();
      if (!tenantId) throw new Error('tenantId missing');

      // Create ItemCollection entries, skipping duplicates
      const created = [];
      for (const itemId of itemIds) {
        const existing = await prisma.itemCollection.findUnique({
          where: { itemId_collectionId: { itemId, collectionId } },
        });
        if (!existing) {
          const ic = await prisma.itemCollection.create({
            data: { tenantId, itemId, collectionId },
            include: { item: { select: { sku: true, name: true } } },
          });
          created.push(ic);
        }
      }

      res.status(201).json({
        data: {
          message: `Added ${created.length} items to collection`,
          added: created.length,
          skipped: itemIds.length - created.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// Remove item from collection
inventoryRouter.delete(
  '/collections/:collectionId/items/:itemId',
  requirePermission('inventory.write'),
  async (req, res, next) => {
    try {
      const { collectionId, itemId } = req.params;
      await prisma.itemCollection.delete({
        where: { itemId_collectionId: { itemId: itemId!, collectionId: collectionId! } },
      });
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        res.status(404).json({ error: { message: 'Item not in collection' } });
      } else {
        next(err);
      }
    }
  },
);

// ── Season Sale campaigns ──
// Multiple simultaneous campaigns, each with one offer (PERCENT / FLAT / BOGO)
// over its member items. An item belongs to one campaign. Offers apply on the
// storefront AND at the POS counter (shared/sale.ts). Endpoints below cover
// campaign CRUD + per-campaign item membership.

// Season Sale CAMPAIGNS — multiple simultaneous offers, one tab each. A
// campaign holds one offer (PERCENT / FLAT / BOGO) over its member items; the
// offer applies identically on the storefront and at the POS counter.

const SaleCampaignInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  discountType: z.enum(['PERCENT', 'FLAT', 'BOGO', 'FIXED_PRICE']).default('PERCENT'),
  discountBps: z.number().int().min(0).max(9000).default(0),
  discountFlatPaise: z.number().int().min(0).max(100_000_00).default(0),
  isActive: z.boolean().default(true),
});

type SaleOfferTypeStr = 'PERCENT' | 'FLAT' | 'BOGO' | 'FIXED_PRICE';

// Which numeric field an offer type actually uses: PERCENT → bps; FLAT and
// FIXED_PRICE → flat paise (₹ off vs the fixed price); BOGO → neither. Zeroing
// the unused field keeps a stale value from lingering behind an offer change.
function normalizeOfferFields(
  type: SaleOfferTypeStr,
  bps: number,
  flat: number,
): { discountBps: number; discountFlatPaise: number } {
  return {
    discountBps: type === 'PERCENT' ? bps : 0,
    discountFlatPaise: type === 'FLAT' || type === 'FIXED_PRICE' ? flat : 0,
  };
}

// List all campaigns (newest sortOrder last) with a member count.
inventoryRouter.get('/sale-campaigns', async (_req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('tenantId missing');
    const rows = await prisma.saleCampaign.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
    res.json({
      data: rows.map((c) => ({
        id: c.id,
        name: c.name,
        discountType: c.discountType,
        discountBps: c.discountBps,
        discountFlatPaise: c.discountFlatPaise,
        isActive: c.isActive,
        sortOrder: c.sortOrder,
        itemCount: c._count.items,
      })),
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/sale-campaigns', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('tenantId missing');
    const body = SaleCampaignInputSchema.parse(req.body);
    const max = await prisma.saleCampaign.aggregate({ _max: { sortOrder: true } });
    const norm = normalizeOfferFields(body.discountType, body.discountBps, body.discountFlatPaise);
    const created = await prisma.saleCampaign.create({
      data: {
        tenantId,
        name: body.name,
        // Cast: the generated enum picks up FIXED_PRICE after `prisma generate`.
        discountType: body.discountType as SaleDiscountType,
        discountBps: norm.discountBps,
        discountFlatPaise: norm.discountFlatPaise,
        isActive: body.isActive,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch('/sale-campaigns/:id', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = SaleCampaignInputSchema.partial().parse(req.body);
    // The admin always sends discountType alongside the amounts, so when the
    // type is present we re-normalize both numeric fields against it (zeroing
    // the one the offer doesn't use). Name / isActive-only patches leave the
    // offer figures untouched.
    const offerFields =
      body.discountType !== undefined
        ? {
            discountType: body.discountType as SaleDiscountType,
            ...normalizeOfferFields(body.discountType, body.discountBps ?? 0, body.discountFlatPaise ?? 0),
          }
        : {
            ...(body.discountBps !== undefined ? { discountBps: body.discountBps } : {}),
            ...(body.discountFlatPaise !== undefined ? { discountFlatPaise: body.discountFlatPaise } : {}),
          };
    const updated = await prisma.saleCampaign.update({
      where: { id: req.params['id']! },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...offerFields,
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// Delete a campaign — its SaleItem memberships cascade away (items leave the sale).
inventoryRouter.delete('/sale-campaigns/:id', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    await prisma.saleCampaign.delete({ where: { id: req.params['id']! } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Items in a campaign, curator order.
inventoryRouter.get('/sale-campaigns/:id/items', async (req, res, next) => {
  try {
    const rows = await prisma.saleItem.findMany({
      where: { campaignId: req.params['id']! },
      include: {
        item: {
          select: {
            id: true, sku: true, name: true, images: true,
            weightMg: true, purityCaratX100: true, status: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({
      data: rows.map((r) => ({
        id: r.item.id,
        sku: r.item.sku,
        name: r.item.name,
        images: r.item.images,
        weightMg: r.item.weightMg,
        purityCaratX100: r.item.purityCaratX100,
        status: r.item.status,
      })),
      page: { hasMore: false },
    });
  } catch (err) {
    next(err);
  }
});

// Add items to a campaign. An item belongs to ONE campaign, so this upserts
// campaignId — adding an item already in another campaign MOVES it here.
inventoryRouter.post(
  '/sale-campaigns/:id/items',
  requirePermission('inventory.write'),
  async (req, res, next) => {
    try {
      const { itemIds } = z.object({ itemIds: z.array(z.string().min(1)).min(1) }).parse(req.body);
      const tenantId = getTenantId();
      if (!tenantId) throw new Error('tenantId missing');
      const campaignId = req.params['id']!;
      const campaign = await prisma.saleCampaign.findUnique({ where: { id: campaignId }, select: { id: true } });
      if (!campaign) {
        res.status(404).json({ error: { message: 'Campaign not found' } });
        return;
      }
      let added = 0;
      let moved = 0;
      for (const itemId of itemIds) {
        const existing = await prisma.saleItem.findUnique({ where: { itemId }, select: { campaignId: true } });
        if (!existing) {
          await prisma.saleItem.create({ data: { tenantId, itemId, campaignId } });
          added += 1;
        } else if (existing.campaignId !== campaignId) {
          await prisma.saleItem.update({ where: { itemId }, data: { campaignId } });
          moved += 1;
        }
      }
      res.status(201).json({ data: { added, moved, skipped: itemIds.length - added - moved } });
    } catch (err) {
      next(err);
    }
  },
);

// Remove an item from a campaign (leaves the sale entirely).
inventoryRouter.delete(
  '/sale-campaigns/:id/items/:itemId',
  requirePermission('inventory.write'),
  async (req, res, next) => {
    try {
      await prisma.saleItem.deleteMany({
        where: { itemId: req.params['itemId']!, campaignId: req.params['id']! },
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.get('/valuation', async (req, res, next) => {
  try {
    const shopId = typeof req.query['shopId'] === 'string' ? req.query['shopId'] : undefined;
    res.json({ data: await svc.computeValuation({ shopId }) });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/low-stock', async (req, res, next) => {
  try {
    const threshold = Number(req.query['threshold'] ?? 3);
    // When true, one-of-a-kind (serialized) pieces are listed individually in
    // the restock list, not just rolled up by category bucket.
    const includeSerialized = req.query['includeSerialized'] === 'true';
    res.json({
      data: await svc.computeLowStock(
        Number.isFinite(threshold) ? threshold : 3,
        includeSerialized,
      ),
    });
  } catch (err) {
    next(err);
  }
});

// --- Vendors ---

inventoryRouter.get('/vendors', async (_req, res, next) => {
  try {
    res.json(await svc.listVendors());
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/vendors', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = VendorInputSchema.parse(req.body);
    const vendor = await svc.createVendor(body);
    res.status(201).json({ data: vendor });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch('/vendors/:id', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = VendorInputSchema.partial().parse(req.body);
    const vendor = await svc.updateVendor(req.params['id']!, body);
    res.json({ data: vendor });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.delete('/vendors/:id', requirePermission('inventory.delete'), async (req, res, next) => {
  try {
    await svc.deleteVendor(req.params['id']!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- Purchase Orders ---

inventoryRouter.get('/purchase-orders', async (_req, res, next) => {
  try {
    res.json(await svc.listPurchaseOrders());
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/purchase-orders', requirePermission('inventory.purchase_order'), async (req, res, next) => {
  try {
    const body = PurchaseOrderCreateSchema.parse(req.body);
    const po = await svc.createPurchaseOrder(body);
    res.status(201).json({ data: po });
  } catch (err) {
    next(err);
  }
});

// Bulk import POs — Excel/CSV upload, rows grouped into orders by (Vendor, PO
// Ref). `dryRun=true` validates only; omit / false to commit.
inventoryRouter.post(
  '/purchase-orders/bulk-import',
  requirePermission('inventory.purchase_order'),
  bulkUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({
          error: { code: 'FILE_REQUIRED', message: 'Attach the spreadsheet as form field "file"' },
        });
        return;
      }
      const dryRun = String(req.body['dryRun'] ?? '').toLowerCase() === 'true';
      // Re-establish the tenant context here: multer parses the upload on
      // socket I/O events whose async context predates tenantScope, so the
      // AsyncLocalStorage store is lost by the time this handler runs. Rebuild
      // it from req.user (which survives on the request object) so the service's
      // getTenantId() resolves.
      const result = await runWithTenant(
        { tenantId: req.user!.tenantId, userId: req.user!.userId, shopId: req.user!.shopId },
        () =>
          bulkImportPurchaseOrders({
            fileBuffer: req.file!.buffer,
            filename: req.file!.originalname,
            dryRun,
            performedByUserId: req.user?.userId,
          }),
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.get(
  '/purchase-orders/bulk-import/template',
  requirePermission('inventory.purchase_order'),
  (_req, res) => {
    res.json({ data: bulkImportPoTemplate() });
  },
);

// Edit a PO (vendor + lines + GST). Blocked once received/cancelled.
inventoryRouter.patch('/purchase-orders/:id', requirePermission('inventory.purchase_order'), async (req, res, next) => {
  try {
    const body = PurchaseOrderUpdateSchema.parse(req.body);
    const po = await svc.updatePurchaseOrder(req.params['id']!, body, req.user?.userId);
    res.json({ data: po });
  } catch (err) {
    next(err);
  }
});

// Delete a PO. Blocked once received (stock already in inventory).
inventoryRouter.delete('/purchase-orders/:id', requirePermission('inventory.purchase_order'), async (req, res, next) => {
  try {
    await svc.deletePurchaseOrder(req.params['id']!, req.user?.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/purchase-orders/:id/receive', requirePermission('inventory.purchase_order'), async (req, res, next) => {
  try {
    const body = z
      .object({ shopId: z.string().min(1), categoryId: z.string().min(1) })
      .parse(req.body);
    const po = await svc.receivePurchaseOrder(req.params['id']!, body.shopId, body.categoryId, req.user?.userId);
    res.json({ data: po });
  } catch (err) {
    next(err);
  }
});

// Set/update the purchase (input) GST on a PO — feeds finance as ITC.
inventoryRouter.patch('/purchase-orders/:id/gst', requirePermission('inventory.purchase_order'), async (req, res, next) => {
  try {
    const body = PurchaseOrderGstSchema.parse(req.body);
    const po = await svc.setPurchaseOrderGst(req.params['id']!, body, req.user?.userId);
    res.json({ data: po });
  } catch (err) {
    next(err);
  }
});

// --- Audit log ---

// Inventory-scoped audit log. Accept either the dedicated audit.read perm
// (admin / compliance roles) OR inventory.write — staff who edit stock often
// need to scrub the history of their own edits to debug bad SKUs or
// reconcile a transfer. Read-only viewers (inventory.read alone) are kept
// out, matching the principle that audit trails are not for general staff.
inventoryRouter.get('/audit', requireAnyPermission('audit.read', 'inventory.write'), async (req, res, next) => {
  try {
    const q = z
      .object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        cursor: z.string().optional(),
      })
      .parse(req.query);
    res.json(await svc.listAuditLog(q));
  } catch (err) {
    next(err);
  }
});
