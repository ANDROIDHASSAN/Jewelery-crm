// Bulk Excel/CSV import for inventory items.
//
// The single biggest jeweller-onboarding blocker: every shop already has
// a stock register in Excel or Tally. Forcing them to hand-key it in is a
// non-starter. This service accepts an .xlsx (or .csv) of items and turns
// it into validated Prisma rows.
//
// Design notes:
//   - Excel headers are user-friendly (grams, ₹, "22K"), not the wire format
//     (mg, paise, 2200). The header map below documents the canonical
//     column names and how each one converts.
//   - Validation happens row-by-row. We collect every error (with the row
//     number) and return them together — partial success is supported via
//     a `dryRun` flag, but a real insert is all-or-nothing inside a
//     transaction so a half-imported catalogue never lands.
//   - Category and Shop are matched by case-insensitive name within the
//     current tenant. Missing categories are NOT auto-created — too easy
//     to typo "Bridel" and end up with two real categories. We list the
//     valid names in the error so the user can fix the sheet.

import * as ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { rawPrisma } from '../../lib/prisma.js';
import { getTenantId } from '../../lib/async-context.js';
import type { HallmarkStatus } from '@goldos/shared/constants';

export interface BulkImportRowError {
  /** 1-indexed row in the source sheet (header is row 1, first data row is 2). */
  row: number;
  /** Column header (lowercased) the error relates to, or undefined for row-level errors. */
  column?: string;
  message: string;
}

export interface BulkImportResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  errors: BulkImportRowError[];
  /** Only populated on a successful (non-dry-run) import. */
  inserted: number;
  /** SKUs that would conflict with existing rows in the same tenant. */
  duplicates: string[];
}

/**
 * Canonical column name → parser. Keys are matched case-insensitively
 * against the header row. We accept a few synonyms per column so a
 * jeweller's existing sheet usually works without renaming columns.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'item code', 'code', 'item id', 'tag'],
  name: ['name', 'item', 'description', 'product', 'product name'],
  shop: ['shop', 'branch', 'showroom', 'location'],
  category: ['category', 'collection', 'type', 'item type'],
  weightG: ['weight', 'weight (g)', 'gross weight', 'gross wt', 'net weight (g)'],
  purity: ['purity', 'karat', 'carat', 'quality', 'fineness'],
  stoneWeightG: ['stone weight', 'stone weight (g)', 'stone wt'],
  costPriceRupees: ['cost', 'cost price', 'cost (₹)', 'cost price (₹)', 'purchase price'],
  makingPercent: ['making', 'making %', 'making (%)', 'making charge', 'making charges (%)', 'mc', 'mc%', 'mc (%)'],
  hallmarkStatus: ['hallmark', 'hallmark status', 'bis status'],
  hallmarkRef: ['huid', 'hallmark ref', 'bis huid', 'hallmark number'],
};

function normaliseHeader(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(key)) return canonical;
  }
  return null;
}

function parsePurity(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (s === '24K' || s === '24KT' || s === '2400') return 2400;
  if (s === '22K' || s === '22KT' || s === '2200') return 2200;
  if (s === '18K' || s === '18KT' || s === '1800') return 1800;
  if (s === '14K' || s === '14KT' || s === '1400') return 1400;
  if (s === '925' || s === 'SILVER' || s === 'STERLING' || s === '0') return 0;
  if (s === 'PT' || s === 'PLATINUM' || s === 'PT950' || s === '9500') return 9500;
  // Numeric value → match against known purities.
  const n = Number(s);
  if (Number.isFinite(n)) {
    if ([2400, 2200, 1800, 1400, 9500, 0].includes(n)) return n;
    if (n === 22) return 2200;
    if (n === 18) return 1800;
    if (n === 14) return 1400;
    if (n === 24) return 2400;
  }
  return null;
}

function parseNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  // Strip currency / unit symbols a jeweller's sheet often carries.
  const cleaned = String(raw).replace(/[₹$,\sg]/gi, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseHallmarkStatus(raw: unknown): HallmarkStatus {
  if (raw == null || raw === '') return 'CERTIFIED';
  const s = String(raw).trim().toUpperCase();
  if (s === 'PENDING' || s === 'SUBMITTED' || s === 'CERTIFIED' || s === 'EXEMPT') return s;
  return 'CERTIFIED';
}

interface ParsedRow {
  rowNum: number;
  sku: string;
  name?: string;
  shopName?: string;
  categoryName?: string;
  weightMg: number;
  purityCaratX100: number;
  stoneWeightMg?: number;
  costPricePaise: number;
  makingChargeBps?: number;
  hallmarkStatus: HallmarkStatus;
  hallmarkRef?: string;
}

/**
 * Parse the file buffer and turn it into raw row objects keyed by canonical
 * column name. Returns the header map separately so the route can echo it
 * back for the dry-run UI.
 */
async function readRows(
  buffer: Buffer,
  filename: string,
): Promise<{ headers: Record<string, string>; rows: Array<Record<string, unknown>> }> {
  const workbook = new ExcelJS.Workbook();
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    const stream = await import('node:stream');
    const readable = stream.Readable.from(buffer.toString('utf8'));
    await workbook.csv.read(readable);
  } else {
    await workbook.xlsx.load(buffer);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no sheets');

  // Row 1 = headers. Cell values can be strings, numbers, or formula
  // results — we coerce to string and normalise.
  const headerRow = sheet.getRow(1);
  const headerMap: Record<number, string> = {};
  const canonicalSeen: Record<string, string> = {};
  headerRow.eachCell((cell, colNumber) => {
    const raw = cell.value;
    const text = raw == null ? '' : typeof raw === 'object' && 'text' in raw ? String(raw.text) : String(raw);
    const canonical = normaliseHeader(text);
    if (canonical) {
      headerMap[colNumber] = canonical;
      canonicalSeen[canonical] = text;
    }
  });

  const rows: Array<Record<string, unknown>> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip headers
    const obj: Record<string, unknown> = { __row: rowNumber };
    let hasAny = false;
    row.eachCell((cell, colNumber) => {
      const canonical = headerMap[colNumber];
      if (!canonical) return;
      const v = cell.value;
      // Excel returns rich text / hyperlinks as objects — unwrap to the
      // displayable text so downstream parsers don't choke.
      if (v != null && typeof v === 'object' && 'text' in v) {
        obj[canonical] = (v as { text: string }).text;
      } else if (v != null && typeof v === 'object' && 'richText' in v) {
        const rt = (v as { richText: Array<{ text: string }> }).richText;
        obj[canonical] = rt.map((r) => r.text).join('');
      } else if (v != null && typeof v === 'object' && 'result' in v) {
        obj[canonical] = (v as { result: unknown }).result;
      } else {
        obj[canonical] = v;
      }
      if (obj[canonical] != null && obj[canonical] !== '') hasAny = true;
    });
    if (hasAny) rows.push(obj);
  });

  return { headers: canonicalSeen, rows };
}

/**
 * Validate one parsed row. Returns either a ready-to-insert ParsedRow or
 * an array of errors so we can show every problem in one pass rather than
 * making the user fix-upload-fix-upload.
 */
function validateRow(
  raw: Record<string, unknown>,
  shopByName: Map<string, string>,
  catByName: Map<string, string>,
): { ok: true; row: ParsedRow } | { ok: false; errors: BulkImportRowError[] } {
  const errors: BulkImportRowError[] = [];
  const rowNum = Number(raw.__row);

  const sku = raw.sku == null ? '' : String(raw.sku).trim();
  if (!sku || sku.length < 2 || sku.length > 60) {
    errors.push({ row: rowNum, column: 'sku', message: 'SKU is required (2–60 chars)' });
  }

  const shopName = raw.shop == null ? '' : String(raw.shop).trim();
  const shopKey = shopName.toLowerCase();
  if (!shopName) {
    errors.push({ row: rowNum, column: 'shop', message: 'Shop name is required' });
  } else if (!shopByName.has(shopKey)) {
    errors.push({
      row: rowNum,
      column: 'shop',
      message: `Unknown shop "${shopName}". Valid shops: ${[...shopByName.keys()].join(', ')}`,
    });
  }

  const categoryName = raw.category == null ? '' : String(raw.category).trim();
  const catKey = categoryName.toLowerCase();
  if (!categoryName) {
    errors.push({ row: rowNum, column: 'category', message: 'Category is required' });
  } else if (!catByName.has(catKey)) {
    errors.push({
      row: rowNum,
      column: 'category',
      message: `Unknown category "${categoryName}". Create it from Categories tab first, then re-import.`,
    });
  }

  const weightG = parseNumber(raw.weightG);
  if (weightG == null || weightG <= 0) {
    errors.push({ row: rowNum, column: 'weight (g)', message: 'Weight must be a positive number in grams' });
  }

  const purityCaratX100 = parsePurity(raw.purity);
  if (purityCaratX100 == null) {
    errors.push({
      row: rowNum,
      column: 'purity',
      message: 'Purity must be one of 24K, 22K, 18K, 14K, 925/Silver, or PT/Platinum',
    });
  }

  const stoneWeightG = parseNumber(raw.stoneWeightG);
  if (stoneWeightG != null && stoneWeightG < 0) {
    errors.push({ row: rowNum, column: 'stone weight (g)', message: 'Stone weight cannot be negative' });
  }

  const costPriceRupees = parseNumber(raw.costPriceRupees);
  if (costPriceRupees == null || costPriceRupees <= 0) {
    errors.push({ row: rowNum, column: 'cost price (₹)', message: 'Cost price must be a positive number in rupees' });
  }

  const makingPercent = parseNumber(raw.makingPercent);
  if (makingPercent != null && (makingPercent < 0 || makingPercent > 100)) {
    errors.push({ row: rowNum, column: 'making (%)', message: 'Making charge must be between 0 and 100 %' });
  }

  const hallmarkStatus = parseHallmarkStatus(raw.hallmarkStatus);
  const hallmarkRefRaw = raw.hallmarkRef == null ? '' : String(raw.hallmarkRef).trim().toUpperCase();
  let hallmarkRef: string | undefined;
  if (hallmarkRefRaw) {
    if (!/^[A-Z0-9]{6}$/.test(hallmarkRefRaw)) {
      errors.push({
        row: rowNum,
        column: 'huid',
        message: 'HUID must be exactly 6 alphanumeric characters',
      });
    } else {
      hallmarkRef = hallmarkRefRaw;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const nameRaw = raw.name == null ? '' : String(raw.name).trim();

  return {
    ok: true,
    row: {
      rowNum,
      sku,
      name: nameRaw || undefined,
      shopName,
      categoryName,
      weightMg: Math.round((weightG as number) * 1000),
      purityCaratX100: purityCaratX100 as number,
      stoneWeightMg: stoneWeightG != null ? Math.round(stoneWeightG * 1000) : undefined,
      costPricePaise: Math.round((costPriceRupees as number) * 100),
      makingChargeBps: makingPercent != null ? Math.round(makingPercent * 100) : undefined,
      hallmarkStatus,
      hallmarkRef,
    },
  };
}

export async function bulkImportItems(opts: {
  fileBuffer: Buffer;
  filename: string;
  dryRun: boolean;
  performedByUserId?: string;
}): Promise<BulkImportResult> {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');

  const [shops, categories] = await Promise.all([
    rawPrisma.shop.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    rawPrisma.category.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);
  const shopByName = new Map(shops.map((s) => [s.name.toLowerCase(), s.id] as const));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id] as const));

  const parsed = await readRows(opts.fileBuffer, opts.filename);

  const errors: BulkImportRowError[] = [];
  const validated: ParsedRow[] = [];
  for (const raw of parsed.rows) {
    const out = validateRow(raw, shopByName, catByName);
    if (out.ok) validated.push(out.row);
    else errors.push(...out.errors);
  }

  // Duplicate check: same (shopId, sku) pair is not allowed — both within the
  // sheet and against existing items. Same SKU at different shops is allowed.
  const seenShopSkus = new Set<string>();
  for (const r of validated) {
    const shopId = shopByName.get(r.shopName!.toLowerCase())!;
    const key = `${shopId}::${r.sku}`;
    if (seenShopSkus.has(key)) {
      errors.push({ row: r.rowNum, column: 'sku', message: `Duplicate SKU "${r.sku}" for shop "${r.shopName}" in the sheet` });
    }
    seenShopSkus.add(key);
  }
  const pairsToCheck = validated.map((r) => ({
    sku: r.sku,
    shopId: shopByName.get(r.shopName!.toLowerCase())!,
  }));
  const existingItems = pairsToCheck.length > 0
    ? await rawPrisma.item.findMany({
        where: { tenantId, OR: pairsToCheck },
        select: { sku: true, shopId: true },
      })
    : [];
  const duplicates = existingItems.map((e) => e.sku);
  const existingKeys = new Set(existingItems.map((e) => `${e.shopId}::${e.sku}`));
  if (existingKeys.size > 0) {
    for (const r of validated) {
      const shopId = shopByName.get(r.shopName!.toLowerCase())!;
      if (existingKeys.has(`${shopId}::${r.sku}`)) {
        errors.push({
          row: r.rowNum,
          column: 'sku',
          message: `SKU "${r.sku}" already exists in shop "${r.shopName}". Edit the existing item or use a different SKU.`,
        });
      }
    }
  }

  const baseResult: Omit<BulkImportResult, 'inserted'> = {
    dryRun: opts.dryRun,
    totalRows: parsed.rows.length,
    validRows: validated.length,
    errors,
    duplicates,
  };

  if (opts.dryRun || errors.length > 0) {
    return { ...baseResult, inserted: 0 };
  }

  // Real insert — all-or-nothing transaction. We use rawPrisma here because
  // bulk createMany doesn't go through the tenant extension; pass tenantId
  // explicitly on every row.
  const created = await rawPrisma.$transaction(async (tx) => {
    const dataRows = validated.map((r) => ({
      tenantId,
      shopId: shopByName.get(r.shopName!.toLowerCase())!,
      categoryId: catByName.get(r.categoryName!.toLowerCase())!,
      sku: r.sku,
      barcodeData: r.sku,
      name: r.name ?? null,
      weightMg: r.weightMg,
      purityCaratX100: r.purityCaratX100,
      stoneWeightMg: r.stoneWeightMg ?? null,
      costPricePaise: r.costPricePaise,
      makingChargeBps: r.makingChargeBps ?? null,
      hallmarkStatus: r.hallmarkStatus,
      hallmarkRef: r.hallmarkRef ?? null,
    }));
    await tx.item.createMany({ data: dataRows });
    // Re-fetch by (shopId, sku) pairs to get ids for ItemMovement records.
    // createMany doesn't return inserted ids; filter by exact pairs so we
    // don't pick up pre-existing rows if the same SKU exists in another shop.
    const inserted = await tx.item.findMany({
      where: { tenantId, OR: dataRows.map((d) => ({ shopId: d.shopId, sku: d.sku })) },
      select: { id: true, shopId: true },
    });
    await tx.itemMovement.createMany({
      data: inserted.map((it) => ({
        tenantId,
        itemId: it.id,
        toShopId: it.shopId,
        type: 'PURCHASE' as const,
        reason: 'Bulk import',
        performedByUserId: opts.performedByUserId ?? null,
      })),
    });
    return inserted.length;
  });

  // Audit row for the bulk import itself — one entry per file, captures
  // the operator + count for compliance. Individual item create audits
  // are skipped to keep the AuditLog table sane at scale (a 500-row
  // import would otherwise blow it up).
  try {
    await rawPrisma.auditLog.create({
      data: {
        tenantId,
        userId: opts.performedByUserId ?? null,
        entityType: 'Item',
        entityId: 'BULK',
        action: 'BULK_IMPORT',
        beforeJson: Prisma.DbNull,
        afterJson: {
          filename: opts.filename,
          inserted: created,
          totalRows: parsed.rows.length,
        } as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Audit failure must not roll back the (already committed) import.
  }

  return { ...baseResult, inserted: created };
}

/**
 * Returns the column names + example row used by the client to render a
 * template-download. Keeping it server-side ensures the template stays
 * aligned with the validator if either changes.
 */
export function bulkImportTemplate(): {
  columns: string[];
  example: Array<Record<string, string | number>>;
} {
  return {
    columns: [
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
    ],
    example: [
      {
        SKU: 'MIRA-001',
        Name: 'Mira Bangle',
        Shop: 'Main Showroom — Gurugram',
        Category: 'Bridal',
        'Weight (g)': 12.45,
        Purity: '22K',
        'Stone Weight (g)': 0,
        'Cost Price (₹)': 62000,
        'Making (%)': 13.25,
        Hallmark: 'Certified',
        HUID: 'ABC123',
      },
      {
        SKU: 'SILVER-A1',
        Name: 'Tia Silver Anklet',
        Shop: 'Karnal Branch',
        Category: 'Silver',
        'Weight (g)': 18,
        Purity: '925',
        'Stone Weight (g)': 0,
        'Cost Price (₹)': 1530,
        'Making (%)': 8,
        Hallmark: 'Certified',
        HUID: '',
      },
    ],
  };
}
