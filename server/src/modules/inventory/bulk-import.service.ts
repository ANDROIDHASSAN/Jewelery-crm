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

// Default import (not `* as`): exceljs is CommonJS, so under the ESM runtime a
// namespace import puts the real exports under `.default` and `ExcelJS.Workbook`
// comes back undefined ("not a constructor"). esModuleInterop makes the default
// import resolve to module.exports, exposing Workbook directly.
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { rawPrisma } from '../../lib/prisma.js';
import { getTenantId } from '../../lib/async-context.js';
import { taxableFromInclusivePaise } from '@goldos/shared/bill-math';
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
  /** PO import only: number of purchase orders the rows were grouped into. */
  poCount?: number;
}

/**
 * Canonical column name → parser. Keys are matched case-insensitively
 * against the header row. We accept a few synonyms per column so a
 * jeweller's existing sheet usually works without renaming columns.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'item code', 'code', 'item id', 'tag'],
  name: ['name', 'item', 'product', 'product name'],
  description: ['description', 'desc', 'item description', 'details', 'notes'],
  shop: ['shop', 'branch', 'showroom', 'location'],
  category: ['category', 'collection', 'type', 'item type'],
  subcategory: ['subcategory', 'sub category', 'sub-category', 'subtype', 'sub type', 'sub-type'],
  weightG: ['weight', 'weight (g)', 'gross weight', 'gross wt', 'net weight (g)'],
  purity: ['purity', 'karat', 'carat', 'quality', 'fineness'],
  stoneWeightG: ['stone weight', 'stone weight (g)', 'stone wt'],
  costPriceRupees: ['cost', 'cost price', 'cost (₹)', 'cost price (₹)', 'purchase price'],
  sellingPriceRupees: ['selling price', 'sell price', 'selling price (₹)', 'mrp', 'tag price', 'retail price'],
  makingMode: ['making mode', 'mc mode', 'making type'],
  makingPercent: ['making', 'making %', 'making (%)', 'making charge', 'making charges (%)', 'mc', 'mc%', 'mc (%)'],
  makingPerGramRupees: ['making per gram', 'making/g', 'making per gram (₹)', 'mc per gram', 'making/g (₹)'],
  hallmarkStatus: ['hallmark', 'hallmark status', 'bis status'],
  hallmarkRef: ['huid', 'hallmark ref', 'bis huid', 'hallmark number'],
  gender: ['gender', 'for', 'audience'],
  qty: ['qty', 'quantity', 'stock', 'pieces', 'count', 'in stock'],
  hsn: ['hsn', 'hsn code', 'hsn/sac', 'sac'],
  gstRatePercent: ['gst', 'gst rate', 'gst %', 'gst (%)', 'tax rate', 'gst rate (%)'],
};

function normaliseHeader(raw: string, aliasMap: Record<string, string[]>): string | null {
  const key = raw.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(aliasMap)) {
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
  if (s === '9K' || s === '9KT' || s === '900') return 900;
  if (s === '925' || s === 'SILVER' || s === 'STERLING' || s === '0') return 0;
  // Non-precious "gold tone" / imitation jewellery (e.g. 18K Gold Tone plated
  // stainless steel) has no metal purity — it's priced by a fixed cost/selling
  // price, not weight × rate. It's stored the same way silver is (purity 0), so
  // these labels — and a blank cell, handled by the caller — resolve to 0.
  if (
    s === 'NONPRECIOUS' ||
    s === 'NON-PRECIOUS' ||
    s === 'NONPRECIOUS(FIXED)' ||
    s === 'NON-PRECIOUS(FIXED)' ||
    s === 'FIXED' ||
    s === 'IMITATION' ||
    s === 'GOLDTONE' ||
    s === 'GOLDPLATED' ||
    s === 'NA' ||
    s === 'N/A'
  ) {
    return 0;
  }
  if (s === 'PT' || s === 'PLATINUM' || s === 'PT950' || s === '9500') return 9500;
  // Numeric value → match against known purities. We accept only the preset
  // set (PURITY_VALUES) — e.g. 12K stays invalid — so a typo can't silently
  // land a nonsensical alloy via the bulk sheet.
  const n = Number(s);
  if (Number.isFinite(n)) {
    if ([2400, 2200, 1800, 1400, 900, 9500, 0].includes(n)) return n;
    if (n === 24) return 2400;
    if (n === 22) return 2200;
    if (n === 18) return 1800;
    if (n === 14) return 1400;
    if (n === 9) return 900;
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

// "MEN" / "WOMEN" (null = unspecified / unisex). Accepts common variants.
function parseGender(raw: unknown): 'MEN' | 'WOMEN' | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toUpperCase();
  if (s === 'MEN' || s === 'MALE' || s === 'M' || s === 'GENTS') return 'MEN';
  if (s === 'WOMEN' || s === 'FEMALE' || s === 'F' || s === 'W' || s === 'LADIES') return 'WOMEN';
  return null; // unrecognised → treat as unspecified rather than erroring
}

// Making-charge mode. Default PERCENTAGE (the historical behaviour); PER_GRAM
// makes the sheet's "Making/g (₹)" column authoritative.
function parseMakingMode(raw: unknown): 'PERCENTAGE' | 'PER_GRAM' {
  if (raw == null || raw === '') return 'PERCENTAGE';
  const s = String(raw).trim().toUpperCase().replace(/[\s_-]/g, '');
  if (s === 'PERGRAM' || s === 'PG' || s === 'FLAT' || s === 'RUPEEPERGRAM' || s === '₹/G' || s === 'RS/G') {
    return 'PER_GRAM';
  }
  return 'PERCENTAGE';
}

// HSN/SAC code — 4–8 digits, else undefined (blank is allowed, garbage is
// surfaced as a validation error in validateRow).
function parseHsn(raw: unknown): { value?: string; invalid?: boolean } {
  if (raw == null || raw === '') return {};
  const s = String(raw).trim();
  if (/^\d{4,8}$/.test(s)) return { value: s };
  return { invalid: true };
}

// Categories form a tree (parentId). An item / PO line attaches to the leaf.
// The sheet's "Category" column names the main (parent) category and the
// optional "Subcategory" column names the child under it. When only Category
// is given we resolve by name anywhere in the tree (preferring a main
// category) so pre-existing single-column sheets keep importing unchanged.
interface CategoryResolver {
  mainByName: Map<string, string>;
  anyByName: Map<string, string>;
  childByParent: Map<string, string>;
}

function buildCategoryResolver(
  categories: Array<{ id: string; name: string; parentId: string | null }>,
): CategoryResolver {
  const mainByName = new Map<string, string>();
  const anyByName = new Map<string, string>();
  const childByParent = new Map<string, string>();
  for (const c of categories) {
    const key = c.name.trim().toLowerCase();
    anyByName.set(key, c.id);
    if (c.parentId == null) mainByName.set(key, c.id);
    else childByParent.set(`${c.parentId}::${key}`, c.id);
  }
  return { mainByName, anyByName, childByParent };
}

// Resolve (Category, Subcategory) → categoryId. `column` names the field to
// attribute an error to. A blank Category resolves to `id: undefined` (the
// caller decides whether that's allowed — required for items, optional for POs).
function resolveCategoryId(
  resolver: CategoryResolver,
  categoryName: string,
  subcategoryName: string,
):
  | { ok: true; id?: string }
  | { ok: false; column: 'category' | 'subcategory'; message: string } {
  const cat = categoryName.trim();
  const sub = subcategoryName.trim();
  if (!cat) {
    if (sub) {
      return { ok: false, column: 'subcategory', message: `Subcategory "${sub}" needs a Category in the same row` };
    }
    return { ok: true, id: undefined };
  }
  const catKey = cat.toLowerCase();
  if (sub) {
    const mainId = resolver.mainByName.get(catKey);
    if (!mainId) {
      return {
        ok: false,
        column: 'category',
        message: `Unknown category "${cat}". Create it from the Categories tab first, then re-import.`,
      };
    }
    const childId = resolver.childByParent.get(`${mainId}::${sub.toLowerCase()}`);
    if (!childId) {
      return {
        ok: false,
        column: 'subcategory',
        message: `Unknown subcategory "${sub}" under "${cat}". Create it under that category first, then re-import.`,
      };
    }
    return { ok: true, id: childId };
  }
  const id = resolver.mainByName.get(catKey) ?? resolver.anyByName.get(catKey);
  if (!id) {
    return {
      ok: false,
      column: 'category',
      message: `Unknown category "${cat}". Create it from the Categories tab first, then re-import.`,
    };
  }
  return { ok: true, id };
}

interface ParsedRow {
  rowNum: number;
  sku: string;
  name?: string;
  description?: string;
  shopName?: string;
  categoryName?: string;
  categoryId: string;
  weightMg: number;
  purityCaratX100: number;
  stoneWeightMg?: number;
  costPricePaise: number;
  sellingPricePaise?: number;
  makingChargeMode?: 'PERCENTAGE' | 'PER_GRAM';
  makingChargeBps?: number;
  makingChargePerGramPaise?: number;
  hallmarkStatus: HallmarkStatus;
  hallmarkRef?: string;
  gender?: 'MEN' | 'WOMEN';
  hsnCode?: string;
  gstRateBps: number;
  quantity: number;
  isSerialized: boolean;
}

/**
 * Parse the file buffer and turn it into raw row objects keyed by canonical
 * column name. Returns the header map separately so the route can echo it
 * back for the dry-run UI.
 */
async function readRows(
  buffer: Buffer,
  filename: string,
  aliasMap: Record<string, string[]>,
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
    const canonical = normaliseHeader(text, aliasMap);
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
  categories: CategoryResolver,
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
  const subcategoryName = raw.subcategory == null ? '' : String(raw.subcategory).trim();
  let categoryId: string | undefined;
  if (!categoryName) {
    errors.push({ row: rowNum, column: 'category', message: 'Category is required' });
  } else {
    const res = resolveCategoryId(categories, categoryName, subcategoryName);
    if (!res.ok) errors.push({ row: rowNum, column: res.column, message: res.message });
    else categoryId = res.id;
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
      message: 'Purity must be one of 24K, 22K, 18K, 14K, 9K, 925/Silver, or PT/Platinum',
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

  const sellingPriceRupees = parseNumber(raw.sellingPriceRupees);
  if (sellingPriceRupees != null && sellingPriceRupees < 0) {
    errors.push({ row: rowNum, column: 'selling price (₹)', message: 'Selling price cannot be negative' });
  }

  const makingMode = parseMakingMode(raw.makingMode);
  const makingPercent = parseNumber(raw.makingPercent);
  if (makingPercent != null && (makingPercent < 0 || makingPercent > 100)) {
    errors.push({ row: rowNum, column: 'making (%)', message: 'Making charge must be between 0 and 100 %' });
  }
  const makingPerGramRupees = parseNumber(raw.makingPerGramRupees);
  if (makingPerGramRupees != null && makingPerGramRupees < 0) {
    errors.push({ row: rowNum, column: 'making/g (₹)', message: 'Making per gram cannot be negative' });
  }

  const gender = parseGender(raw.gender) ?? undefined;

  const hsn = parseHsn(raw.hsn);
  if (hsn.invalid) {
    errors.push({ row: rowNum, column: 'hsn', message: 'HSN must be 4–8 digits' });
  }

  // GST rate is entered as a percentage; default 3% when blank. 0–28% (top slab).
  const gstRatePercent = parseNumber(raw.gstRatePercent);
  if (gstRatePercent != null && (gstRatePercent < 0 || gstRatePercent > 28)) {
    errors.push({ row: rowNum, column: 'gst rate (%)', message: 'GST rate must be between 0 and 28 %' });
  }

  // Quantity > 1 → a lot item (isSerialized=false, quantityOnHand=qty). Blank / 1
  // → a single serialized piece, the default.
  const qtyRaw = parseNumber(raw.qty);
  if (qtyRaw != null && (qtyRaw < 1 || !Number.isInteger(qtyRaw))) {
    errors.push({ row: rowNum, column: 'qty', message: 'Quantity must be a whole number ≥ 1' });
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
  const descriptionRaw = raw.description == null ? '' : String(raw.description).trim();
  const qty = qtyRaw != null ? Math.round(qtyRaw) : 1;
  // PER_GRAM mode uses the per-gram column; PERCENTAGE mode uses making %.
  const isPerGram = makingMode === 'PER_GRAM';

  return {
    ok: true,
    row: {
      rowNum,
      sku,
      name: nameRaw || undefined,
      description: descriptionRaw || undefined,
      shopName,
      categoryName,
      categoryId: categoryId!,
      weightMg: Math.round((weightG as number) * 1000),
      purityCaratX100: purityCaratX100 as number,
      stoneWeightMg: stoneWeightG != null ? Math.round(stoneWeightG * 1000) : undefined,
      costPricePaise: Math.round((costPriceRupees as number) * 100),
      sellingPricePaise: sellingPriceRupees != null ? Math.round(sellingPriceRupees * 100) : undefined,
      makingChargeMode: isPerGram ? 'PER_GRAM' : undefined,
      makingChargeBps: !isPerGram && makingPercent != null ? Math.round(makingPercent * 100) : undefined,
      makingChargePerGramPaise:
        isPerGram && makingPerGramRupees != null ? Math.round(makingPerGramRupees * 100) : undefined,
      hallmarkStatus,
      hallmarkRef,
      gender,
      hsnCode: hsn.value,
      gstRateBps: gstRatePercent != null ? Math.round(gstRatePercent * 100) : 300,
      quantity: qty,
      isSerialized: qty <= 1,
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
    rawPrisma.category.findMany({ where: { tenantId }, select: { id: true, name: true, parentId: true } }),
  ]);
  const shopByName = new Map(shops.map((s) => [s.name.toLowerCase(), s.id] as const));
  const catResolver = buildCategoryResolver(categories);

  const parsed = await readRows(opts.fileBuffer, opts.filename, COLUMN_ALIASES);

  const errors: BulkImportRowError[] = [];
  const validated: ParsedRow[] = [];
  for (const raw of parsed.rows) {
    const out = validateRow(raw, shopByName, catResolver);
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
      categoryId: r.categoryId,
      sku: r.sku,
      barcodeData: r.sku,
      name: r.name ?? null,
      description: r.description ?? null,
      weightMg: r.weightMg,
      purityCaratX100: r.purityCaratX100,
      stoneWeightMg: r.stoneWeightMg ?? null,
      costPricePaise: r.costPricePaise,
      sellingPricePaise: r.sellingPricePaise ?? null,
      makingChargeMode: r.makingChargeMode ?? null,
      makingChargeBps: r.makingChargeBps ?? null,
      makingChargePerGramPaise: r.makingChargePerGramPaise ?? null,
      hallmarkStatus: r.hallmarkStatus,
      hallmarkRef: r.hallmarkRef ?? null,
      gender: r.gender ?? null,
      hsnCode: r.hsnCode ?? null,
      gstRateBps: r.gstRateBps,
      isSerialized: r.isSerialized,
      quantityOnHand: r.quantity,
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
      'Description',
      'Shop',
      'Category',
      'Subcategory',
      'HSN',
      'Weight (g)',
      'Purity',
      'Stone Weight (g)',
      'Cost Price (₹)',
      'Selling Price (₹)',
      'GST Rate (%)',
      'Making Mode',
      'Making (%)',
      'Making/g (₹)',
      'Gender',
      'Qty',
      'Hallmark',
      'HUID',
    ],
    example: [
      {
        SKU: 'MIRA-001',
        Name: 'Mira Bangle',
        Description: '22K gold bangle, floral motif',
        Shop: 'Main Showroom — Gurugram',
        Category: 'Bridal',
        Subcategory: 'Bangles',
        HSN: '7113',
        'Weight (g)': 12.45,
        Purity: '22K',
        'Stone Weight (g)': 0,
        'Cost Price (₹)': 62000,
        'Selling Price (₹)': '',
        'GST Rate (%)': 3,
        'Making Mode': 'PERCENTAGE',
        'Making (%)': 13.25,
        'Making/g (₹)': '',
        Gender: 'WOMEN',
        Qty: 1,
        Hallmark: 'Certified',
        HUID: 'ABC123',
      },
      {
        SKU: 'COIN-1G',
        Name: 'Gold Coin 1g',
        Description: '24K investment coin',
        Shop: 'Karnal Branch',
        Category: 'Coins',
        Subcategory: '',
        HSN: '7118',
        'Weight (g)': 1,
        Purity: '24K',
        'Stone Weight (g)': 0,
        'Cost Price (₹)': 7200,
        'Selling Price (₹)': 7999,
        'GST Rate (%)': 3,
        'Making Mode': 'PER_GRAM',
        'Making (%)': '',
        'Making/g (₹)': 250,
        Gender: '',
        Qty: 25,
        Hallmark: 'Certified',
        HUID: '',
      },
    ],
  };
}

// ===========================================================================
// PURCHASE ORDER bulk import
// ===========================================================================
//
// Each sheet row is one PO line. Rows are grouped into purchase orders by
// (Vendor, PO Ref): lines that share the same vendor + PO Ref become a single
// PO. A blank PO Ref groups all of that vendor's lines into one order. This
// lets a jeweller paste a supplier's whole invoice — many line items — and get
// one PO per invoice. Costs are GST-inclusive (like the manual PO form); the
// embedded 3% input GST is auto-derived per order for ITC, editable later.

const PO_COLUMN_ALIASES: Record<string, string[]> = {
  poRef: ['po', 'po ref', 'po number', 'po no', 'po #', 'order ref', 'invoice', 'invoice no', 'group'],
  vendor: ['vendor', 'supplier', 'party', 'seller'],
  itemSku: ['sku', 'item code', 'code', 'item id', 'tag'],
  name: ['name', 'item', 'product', 'product name'],
  category: ['category', 'type', 'item type'],
  subcategory: ['subcategory', 'sub category', 'sub-category', 'subtype', 'sub type', 'sub-type'],
  hsn: ['hsn', 'hsn code', 'hsn/sac', 'sac'],
  weightG: ['weight', 'weight (g)', 'gross weight', 'gross wt', 'net weight (g)'],
  purity: ['purity', 'karat', 'carat', 'quality', 'fineness'],
  costPriceRupees: ['cost', 'cost price', 'cost (₹)', 'cost price (₹)', 'purchase price', 'rate', 'rate (₹)'],
  sellingPriceRupees: ['selling price', 'sell price', 'selling price (₹)', 'mrp', 'tag price', 'retail price'],
  gstRatePercent: ['gst', 'gst rate', 'gst %', 'gst (%)', 'tax rate', 'gst rate (%)'],
  makingMode: ['making mode', 'mc mode', 'making type'],
  makingPercent: ['making', 'making %', 'making (%)', 'making charge', 'making charges (%)', 'mc', 'mc%', 'mc (%)'],
  makingPerGramRupees: ['making per gram', 'making/g', 'making per gram (₹)', 'making/g (₹)', 'mc per gram', 'making charges (per gram)', 'making (per gram)'],
  qty: ['qty', 'quantity', 'pieces', 'count'],
};

interface ParsedPoLine {
  rowNum: number;
  groupKey: string; // vendorId::poRef — lines with the same key form one PO
  vendorName: string;
  vendorId: string;
  itemSku: string;
  name?: string;
  categoryId?: string;
  hsnCode?: string;
  gstRateBps?: number;
  weightMg: number;
  purity: number;
  costPaise: number;
  sellingPricePaise?: number;
  makingChargeMode?: 'PERCENTAGE' | 'PER_GRAM';
  makingChargeBps?: number;
  makingChargePerGramPaise?: number;
  quantity: number;
}

function validatePoRow(
  raw: Record<string, unknown>,
  vendorByName: Map<string, string>,
  categories: CategoryResolver,
): { ok: true; row: ParsedPoLine } | { ok: false; errors: BulkImportRowError[] } {
  const errors: BulkImportRowError[] = [];
  const rowNum = Number(raw.__row);

  const vendorName = raw.vendor == null ? '' : String(raw.vendor).trim();
  const vendorId = vendorByName.get(vendorName.toLowerCase());
  if (!vendorName) {
    errors.push({ row: rowNum, column: 'vendor', message: 'Vendor is required' });
  } else if (!vendorId) {
    errors.push({
      row: rowNum,
      column: 'vendor',
      message: `Unknown vendor "${vendorName}". Add it under Inventory → Vendors first, then re-import.`,
    });
  }

  const itemSku = raw.itemSku == null ? '' : String(raw.itemSku).trim();
  if (!itemSku || itemSku.length < 2 || itemSku.length > 60) {
    errors.push({ row: rowNum, column: 'sku', message: 'Item SKU is required (2–60 chars)' });
  }

  const categoryName = raw.category == null ? '' : String(raw.category).trim();
  const subcategoryName = raw.subcategory == null ? '' : String(raw.subcategory).trim();
  let categoryId: string | undefined;
  {
    const res = resolveCategoryId(categories, categoryName, subcategoryName);
    if (!res.ok) errors.push({ row: rowNum, column: res.column, message: res.message });
    else categoryId = res.id;
  }

  const weightG = parseNumber(raw.weightG);
  if (weightG == null || weightG <= 0) {
    errors.push({ row: rowNum, column: 'weight (g)', message: 'Weight must be a positive number in grams' });
  }

  // Purity is optional for PO lines: a blank cell means non-precious "gold tone"
  // / imitation jewellery (e.g. 18K Gold Tone), which has no metal purity and is
  // priced by a fixed cost/selling price. Blank → 0 (how non-precious is stored).
  // A non-blank but unrecognised value is still an error.
  const purityBlank = raw.purity == null || String(raw.purity).trim() === '';
  const purity = purityBlank ? 0 : parsePurity(raw.purity);
  if (purity == null) {
    errors.push({
      row: rowNum,
      column: 'purity',
      message:
        'Purity must be one of 24K, 22K, 18K, 14K, 9K, 925/Silver, or PT/Platinum — or leave it blank for non-precious (18K Gold Tone) jewellery',
    });
  }

  const costPriceRupees = parseNumber(raw.costPriceRupees);
  if (costPriceRupees == null || costPriceRupees <= 0) {
    errors.push({ row: rowNum, column: 'cost price (₹)', message: 'Cost price must be a positive number in rupees' });
  }

  const sellingPriceRupees = parseNumber(raw.sellingPriceRupees);
  if (sellingPriceRupees != null && sellingPriceRupees < 0) {
    errors.push({ row: rowNum, column: 'selling price (₹)', message: 'Selling price cannot be negative' });
  }

  // Making charge can be given as a percentage of metal value (default) or as a
  // flat rupee amount per gram. The Making Mode column selects which; when it's
  // blank we infer PER_GRAM if only the per-gram column is filled.
  const makingPerGramRupees = parseNumber(raw.makingPerGramRupees);
  if (makingPerGramRupees != null && makingPerGramRupees < 0) {
    errors.push({ row: rowNum, column: 'making/g (₹)', message: 'Making per gram cannot be negative' });
  }
  const makingPercent = parseNumber(raw.makingPercent);
  if (makingPercent != null && (makingPercent < 0 || makingPercent > 100)) {
    errors.push({ row: rowNum, column: 'making (%)', message: 'Making charge must be between 0 and 100 %' });
  }
  const makingModeExplicit = raw.makingMode != null && String(raw.makingMode).trim() !== '';
  const isPerGram = makingModeExplicit
    ? parseMakingMode(raw.makingMode) === 'PER_GRAM'
    : makingPerGramRupees != null && makingPercent == null;

  const hsn = parseHsn(raw.hsn);
  if (hsn.invalid) errors.push({ row: rowNum, column: 'hsn', message: 'HSN must be 4–8 digits' });

  const gstRatePercent = parseNumber(raw.gstRatePercent);
  if (gstRatePercent != null && (gstRatePercent < 0 || gstRatePercent > 28)) {
    errors.push({ row: rowNum, column: 'gst rate (%)', message: 'GST rate must be between 0 and 28 %' });
  }

  const qtyRaw = parseNumber(raw.qty);
  if (qtyRaw != null && (qtyRaw < 1 || !Number.isInteger(qtyRaw))) {
    errors.push({ row: rowNum, column: 'qty', message: 'Quantity must be a whole number ≥ 1' });
  }

  if (errors.length > 0) return { ok: false, errors };

  const poRef = raw.poRef == null ? '' : String(raw.poRef).trim();
  const nameRaw = raw.name == null ? '' : String(raw.name).trim();

  return {
    ok: true,
    row: {
      rowNum,
      groupKey: `${vendorId}::${poRef}`,
      vendorName,
      vendorId: vendorId!,
      itemSku,
      name: nameRaw || undefined,
      categoryId,
      hsnCode: hsn.value,
      gstRateBps: gstRatePercent != null ? Math.round(gstRatePercent * 100) : undefined,
      weightMg: Math.round((weightG as number) * 1000),
      purity: purity as number,
      costPaise: Math.round((costPriceRupees as number) * 100),
      sellingPricePaise: sellingPriceRupees != null ? Math.round(sellingPriceRupees * 100) : undefined,
      makingChargeMode: isPerGram ? 'PER_GRAM' : undefined,
      makingChargeBps: !isPerGram && makingPercent != null ? Math.round(makingPercent * 100) : undefined,
      makingChargePerGramPaise:
        isPerGram && makingPerGramRupees != null ? Math.round(makingPerGramRupees * 100) : undefined,
      quantity: qtyRaw != null ? Math.round(qtyRaw) : 1,
    },
  };
}

export async function bulkImportPurchaseOrders(opts: {
  fileBuffer: Buffer;
  filename: string;
  dryRun: boolean;
  performedByUserId?: string;
}): Promise<BulkImportResult> {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('tenantId missing');

  const [vendors, categories] = await Promise.all([
    rawPrisma.vendor.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    rawPrisma.category.findMany({ where: { tenantId }, select: { id: true, name: true, parentId: true } }),
  ]);
  const vendorByName = new Map(vendors.map((v) => [v.name.toLowerCase(), v.id] as const));
  const catResolver = buildCategoryResolver(categories);

  const parsed = await readRows(opts.fileBuffer, opts.filename, PO_COLUMN_ALIASES);

  const errors: BulkImportRowError[] = [];
  const validated: ParsedPoLine[] = [];
  for (const raw of parsed.rows) {
    const out = validatePoRow(raw, vendorByName, catResolver);
    if (out.ok) validated.push(out.row);
    else errors.push(...out.errors);
  }

  // Group valid lines into POs by (vendor, PO Ref).
  const groups = new Map<string, ParsedPoLine[]>();
  for (const line of validated) {
    const arr = groups.get(line.groupKey);
    if (arr) arr.push(line);
    else groups.set(line.groupKey, [line]);
  }

  const baseResult: BulkImportResult = {
    dryRun: opts.dryRun,
    totalRows: parsed.rows.length,
    validRows: validated.length,
    errors,
    duplicates: [],
    inserted: 0,
    poCount: groups.size,
  };

  if (opts.dryRun || errors.length > 0) return baseResult;

  // Commit: one PO per group. Costs are GST-inclusive, so derive the embedded
  // 3% input GST (intra-state CGST+SGST) per order — matches the manual PO
  // form's auto-derivation; the buyer can re-key it later if inter-state.
  let insertedLines = 0;
  for (const lines of groups.values()) {
    const totalPaise = lines.reduce((s, l) => s + l.costPaise * l.quantity, 0);
    const gst = Math.max(0, totalPaise - taxableFromInclusivePaise(totalPaise));
    const cgst = Math.floor(gst / 2);
    await rawPrisma.purchaseOrder.create({
      data: {
        tenantId,
        vendorId: lines[0]!.vendorId,
        totalPaise,
        gstInterState: false,
        cgstPaise: cgst,
        sgstPaise: gst - cgst,
        igstPaise: 0,
        items: {
          create: lines.map((l) => ({
            itemSku: l.itemSku,
            categoryId: l.categoryId ?? null,
            name: l.name ?? null,
            weightMg: l.weightMg,
            purity: l.purity,
            costPaise: l.costPaise,
            sellingPricePaise: l.sellingPricePaise ?? null,
            makingChargeMode: l.makingChargeMode ?? null,
            makingChargeBps: l.makingChargeBps ?? null,
            makingChargePerGramPaise: l.makingChargePerGramPaise ?? null,
            hsnCode: l.hsnCode ?? null,
            gstRateBps: l.gstRateBps ?? null,
            quantity: l.quantity,
          })),
        },
      },
    });
    insertedLines += lines.length;
  }

  try {
    await rawPrisma.auditLog.create({
      data: {
        tenantId,
        userId: opts.performedByUserId ?? null,
        entityType: 'PurchaseOrder',
        entityId: 'BULK',
        action: 'BULK_IMPORT',
        beforeJson: Prisma.DbNull,
        afterJson: {
          filename: opts.filename,
          purchaseOrders: groups.size,
          lines: insertedLines,
        } as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Audit failure must not roll back the committed POs.
  }

  return { ...baseResult, inserted: insertedLines };
}

export function bulkImportPoTemplate(): {
  columns: string[];
  example: Array<Record<string, string | number>>;
} {
  return {
    columns: [
      'PO Ref',
      'Vendor',
      'SKU',
      'Name',
      'Category',
      'Subcategory',
      'HSN',
      'Weight (g)',
      'Purity',
      'Cost Price (₹)',
      'Selling Price (₹)',
      'GST Rate (%)',
      'Making Mode',
      'Making (%)',
      'Making/g (₹)',
      'Qty',
    ],
    example: [
      {
        // Gold line — making charge as a percentage of metal value.
        'PO Ref': 'INV-2201',
        Vendor: 'Rajesh Gold Suppliers',
        SKU: 'RING-22-01',
        Name: 'Solitaire Ring',
        Category: 'Rings',
        Subcategory: 'Solitaire',
        HSN: '7113',
        'Weight (g)': 4.2,
        Purity: '22K',
        'Cost Price (₹)': 26000,
        'Selling Price (₹)': '',
        'GST Rate (%)': 3,
        'Making Mode': 'PERCENTAGE',
        'Making (%)': 10,
        'Making/g (₹)': '',
        Qty: 1,
      },
      {
        // Gold line — flat making charge in rupees per gram.
        'PO Ref': 'INV-2201',
        Vendor: 'Rajesh Gold Suppliers',
        SKU: 'CHAIN-22-07',
        Name: 'Rope Chain 20in',
        Category: 'Chains',
        Subcategory: '',
        HSN: '7113',
        'Weight (g)': 15.8,
        Purity: '22K',
        'Cost Price (₹)': 98000,
        'Selling Price (₹)': 112000,
        'GST Rate (%)': 3,
        'Making Mode': 'PER_GRAM',
        'Making (%)': '',
        'Making/g (₹)': 350,
        Qty: 2,
      },
      {
        // Non-precious "18K Gold Tone" line — leave Purity blank (it has no metal
        // purity); it's priced by the fixed cost/selling price you enter.
        'PO Ref': 'INV-2201',
        Vendor: 'Rajesh Gold Suppliers',
        SKU: 'GT-RING-01',
        Name: 'Gold Tone Ring',
        Category: '18K Gold Tone',
        Subcategory: 'Rings',
        HSN: '7113',
        'Weight (g)': 15,
        Purity: '',
        'Cost Price (₹)': 170,
        'Selling Price (₹)': 1700,
        'GST Rate (%)': 3,
        'Making Mode': '',
        'Making (%)': '',
        'Making/g (₹)': '',
        Qty: 15,
      },
    ],
  };
}
