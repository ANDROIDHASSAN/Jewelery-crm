// Inventory bulk-import service tests. Hits the real DB so we exercise
// the tenant extension + transactional insert path. Skips itself if the
// DB isn't reachable so the unit-test suite still runs in DB-less CI.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as ExcelJS from 'exceljs';
import { bulkImportItems } from '../modules/inventory/bulk-import.service.js';
import { rawPrisma } from '../lib/prisma.js';
import { runWithTenant } from '../lib/async-context.js';

interface SeedRefs {
  tenantId: string;
  shopId: string;
  shopName: string;
  categoryId: string;
  categoryName: string;
}

let seed: SeedRefs | null = null;
const createdSkus: string[] = [];

beforeAll(async () => {
  try {
    const tenant = await rawPrisma.tenant.findFirst({
      where: { ownerEmail: 'owner@goldos.dev' },
      select: { id: true },
    });
    if (!tenant) {
      console.warn('[bulk-import.test] seed tenant missing — skipping');
      return;
    }
    const shop = await rawPrisma.shop.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    });
    const category = await rawPrisma.category.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    });
    if (!shop || !category) {
      console.warn('[bulk-import.test] seed shop/category missing — skipping');
      return;
    }
    seed = {
      tenantId: tenant.id,
      shopId: shop.id,
      shopName: shop.name,
      categoryId: category.id,
      categoryName: category.name,
    };
  } catch (err) {
    console.warn('[bulk-import.test] DB unreachable — skipping', err);
  }
});

afterAll(async () => {
  if (seed && createdSkus.length > 0) {
    // First delete movements that reference our items (FK), then the items themselves.
    const items = await rawPrisma.item.findMany({
      where: { tenantId: seed.tenantId, sku: { in: createdSkus } },
      select: { id: true },
    });
    const ids = items.map((i) => i.id);
    if (ids.length > 0) {
      await rawPrisma.itemMovement.deleteMany({ where: { itemId: { in: ids } } });
      await rawPrisma.item.deleteMany({ where: { id: { in: ids } } });
    }
  }
});

/** Build a tiny in-memory xlsx buffer with the given rows. */
async function buildXlsxBuffer(
  rows: Array<Record<string, string | number>>,
  columns?: string[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Items');
  const headers =
    columns ?? [
      'SKU',
      'Name',
      'Shop',
      'Category',
      'Weight (g)',
      'Purity',
      'Stone Weight (g)',
      'Cost Price (₹)',
      'Making (%)',
      'Hallmark',
      'HUID',
    ];
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h] ?? ''));
  }
  // Excel.write returns ArrayBuffer; wrap in Node Buffer.
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// 30s timeout — every test goes through the real Neon DB, which is
// 200-300ms per round trip from a local machine. The all-or-nothing
// insert path does ~6-8 RTTs in a single test.
describe('bulkImportItems', { timeout: 30_000 }, () => {
  it('runs end-to-end against the seeded tenant', async () => {
    if (!seed) {
      console.warn('[bulk-import.test] skipped — no seed');
      return;
    }

    const skuOk = `BULK-TEST-${Date.now()}`;
    createdSkus.push(skuOk);

    const buffer = await buildXlsxBuffer([
      {
        SKU: skuOk,
        Name: 'Test bangle',
        Shop: seed.shopName,
        Category: seed.categoryName,
        'Weight (g)': 12.5,
        Purity: '22K',
        'Stone Weight (g)': 0,
        'Cost Price (₹)': 50000,
        'Making (%)': 13,
        Hallmark: 'Certified',
        HUID: 'ABCDEF',
      },
    ]);

    // Dry run first — must not insert anything.
    const dry = await runWithTenant({ tenantId: seed.tenantId }, () =>
      bulkImportItems({ fileBuffer: buffer, filename: 'test.xlsx', dryRun: true }),
    );
    expect(dry.dryRun).toBe(true);
    expect(dry.totalRows).toBe(1);
    expect(dry.validRows).toBe(1);
    expect(dry.errors).toEqual([]);
    expect(dry.inserted).toBe(0);

    // Confirm nothing was actually inserted by the dry-run.
    const beforeReal = await rawPrisma.item.findFirst({
      where: { tenantId: seed.tenantId, sku: skuOk },
    });
    expect(beforeReal).toBeNull();

    // Real run — commits.
    const real = await runWithTenant({ tenantId: seed.tenantId }, () =>
      bulkImportItems({ fileBuffer: buffer, filename: 'test.xlsx', dryRun: false }),
    );
    expect(real.dryRun).toBe(false);
    expect(real.inserted).toBe(1);
    expect(real.errors).toEqual([]);

    // The item now exists with the right unit conversions.
    const inserted = await rawPrisma.item.findFirst({
      where: { tenantId: seed.tenantId, sku: skuOk },
    });
    expect(inserted).not.toBeNull();
    expect(inserted!.weightMg).toBe(12500);
    expect(inserted!.purityCaratX100).toBe(2200);
    expect(inserted!.costPricePaise).toBe(50000 * 100);
    expect(inserted!.makingChargeBps).toBe(1300);
    expect(inserted!.hallmarkStatus).toBe('CERTIFIED');
    expect(inserted!.hallmarkRef).toBe('ABCDEF');
  });

  it('rejects unknown shop / category and surfaces row + column in the error', async () => {
    if (!seed) return;
    const buffer = await buildXlsxBuffer([
      {
        SKU: 'BULK-BAD-1',
        Shop: 'Nonexistent Branch',
        Category: 'Nonexistent Category',
        'Weight (g)': 5,
        Purity: '22K',
        'Cost Price (₹)': 1000,
        Hallmark: 'Certified',
      },
    ]);
    const result = await runWithTenant({ tenantId: seed.tenantId }, () =>
      bulkImportItems({ fileBuffer: buffer, filename: 'bad.xlsx', dryRun: true }),
    );
    expect(result.validRows).toBe(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    const cols = result.errors.map((e) => e.column);
    expect(cols).toContain('shop');
    expect(cols).toContain('category');
    expect(result.errors.every((e) => e.row === 2)).toBe(true);
  });

  it('rejects invalid purity values with a helpful message', async () => {
    if (!seed) return;
    const buffer = await buildXlsxBuffer([
      {
        SKU: 'BULK-BAD-PURITY',
        Shop: seed.shopName,
        Category: seed.categoryName,
        'Weight (g)': 5,
        Purity: '12K', // not a valid purity
        'Cost Price (₹)': 1000,
      },
    ]);
    const result = await runWithTenant({ tenantId: seed.tenantId }, () =>
      bulkImportItems({ fileBuffer: buffer, filename: 'bad.xlsx', dryRun: true }),
    );
    const purityErr = result.errors.find((e) => e.column === 'purity');
    expect(purityErr).toBeDefined();
    expect(purityErr!.message).toMatch(/22K|18K|14K|Silver|Platinum/);
  });

  it('catches duplicate SKUs across both the sheet and the existing catalog', async () => {
    if (!seed) return;
    // Seed an existing item the sheet will collide with.
    const existingSku = `BULK-DUP-${Date.now()}`;
    createdSkus.push(existingSku);
    await rawPrisma.item.create({
      data: {
        tenantId: seed.tenantId,
        shopId: seed.shopId,
        categoryId: seed.categoryId,
        sku: existingSku,
        barcodeData: existingSku,
        weightMg: 10000,
        purityCaratX100: 2200,
        costPricePaise: 100000,
        hallmarkStatus: 'CERTIFIED',
      },
    });

    const dupInSheet = `BULK-DUP-IN-SHEET-${Date.now()}`;
    const buffer = await buildXlsxBuffer([
      {
        SKU: dupInSheet,
        Shop: seed.shopName,
        Category: seed.categoryName,
        'Weight (g)': 5,
        Purity: '22K',
        'Cost Price (₹)': 1000,
      },
      {
        SKU: dupInSheet, // duplicate of the row above
        Shop: seed.shopName,
        Category: seed.categoryName,
        'Weight (g)': 5,
        Purity: '22K',
        'Cost Price (₹)': 1000,
      },
      {
        SKU: existingSku, // already in DB
        Shop: seed.shopName,
        Category: seed.categoryName,
        'Weight (g)': 5,
        Purity: '22K',
        'Cost Price (₹)': 1000,
      },
    ]);

    const result = await runWithTenant({ tenantId: seed.tenantId }, () =>
      bulkImportItems({ fileBuffer: buffer, filename: 'dup.xlsx', dryRun: true }),
    );
    expect(result.duplicates).toContain(existingSku);
    const dupMessages = result.errors.map((e) => e.message).join('\n');
    expect(dupMessages).toMatch(/Duplicate SKU/);
    expect(dupMessages).toMatch(/already exists/);
  });

  it('is all-or-nothing: if any row fails validation, nothing is committed', async () => {
    if (!seed) return;
    const okSku = `BULK-ATOMIC-OK-${Date.now()}`;
    createdSkus.push(okSku);

    const buffer = await buildXlsxBuffer([
      {
        SKU: okSku,
        Shop: seed.shopName,
        Category: seed.categoryName,
        'Weight (g)': 5,
        Purity: '22K',
        'Cost Price (₹)': 1000,
      },
      {
        SKU: 'BULK-ATOMIC-BAD',
        Shop: 'Nonexistent Branch', // will fail
        Category: seed.categoryName,
        'Weight (g)': 5,
        Purity: '22K',
        'Cost Price (₹)': 1000,
      },
    ]);

    const result = await runWithTenant({ tenantId: seed.tenantId }, () =>
      bulkImportItems({ fileBuffer: buffer, filename: 'atomic.xlsx', dryRun: false }),
    );
    expect(result.inserted).toBe(0);
    // The good SKU must NOT have been inserted even though row 1 is valid.
    const inserted = await rawPrisma.item.findFirst({
      where: { tenantId: seed.tenantId, sku: okSku },
    });
    expect(inserted).toBeNull();
  });

  it('accepts CSV too', async () => {
    if (!seed) return;
    const sku = `BULK-CSV-${Date.now()}`;
    createdSkus.push(sku);

    const csv = [
      'SKU,Shop,Category,Weight (g),Purity,Cost Price (₹),Hallmark',
      `${sku},${seed.shopName},${seed.categoryName},8.4,22K,42000,Certified`,
    ].join('\n');
    const buffer = Buffer.from(csv, 'utf8');

    const result = await runWithTenant({ tenantId: seed.tenantId }, () =>
      bulkImportItems({ fileBuffer: buffer, filename: 'inv.csv', dryRun: false }),
    );
    expect(result.inserted).toBe(1);
    const inserted = await rawPrisma.item.findFirst({
      where: { tenantId: seed.tenantId, sku },
    });
    expect(inserted!.weightMg).toBe(8400);
  });
});
