import { Router } from 'express';
import multer from 'multer';
import {
  ItemInputSchema,
  VendorInputSchema,
  PurchaseOrderCreateSchema,
  WastageInputSchema,
} from '@goldos/shared/schemas';
import { z } from 'zod';
import * as svc from './inventory.service.js';
import { bulkImportItems, bulkImportTemplate } from './bulk-import.service.js';
import { requirePermission, requireAnyPermission } from '../../middleware/require-permission.js';

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
  limit: z.coerce.number().int().positive().max(100).optional(),
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
      const result = await bulkImportItems({
        fileBuffer: req.file.buffer,
        filename: req.file.originalname,
        dryRun,
        performedByUserId: req.user?.userId,
      });
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
    await svc.deleteItem(req.params['id']!, req.user?.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Legacy one-shot transfer endpoint removed. Stock moves now go through the
// /transfers workflow (PENDING -> APPROVED -> COMPLETED). See
// server/src/modules/transfers/ and client TransfersPage.

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

inventoryRouter.patch('/categories/:id/making-charge', requirePermission('inventory.write'), async (req, res, next) => {
  try {
    const body = z.object({ defaultMakingChargeBps: z.number().int().min(0).max(10_000) }).parse(req.body);
    const updated = await svc.updateCategoryMakingCharge(req.params['id']!, body.defaultMakingChargeBps);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

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
    res.json({ data: await svc.computeLowStock(Number.isFinite(threshold) ? threshold : 3) });
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
