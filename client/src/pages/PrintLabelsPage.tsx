// Print-labels page. Renders a grid of jewellery tags for the items
// the user selected on the Inventory page. Each tag carries:
//   - Shop name (top-left)
//   - SKU + Code-128 barcode (machine-scan)
//   - Item name + weight + purity (human-read)
//   - Optional QR code linking to /admin/inventory?sku=<sku> for fast
//     item lookup at the counter.
//
// Layout is print-CSS driven (@page + page-break-inside) so the same
// markup that previews on screen prints correctly on a sheet of label
// stock. Default page is A4 with a 4×10 grid of 50×25mm tags (40 per
// page, the most common Avery/Letterland format Indian printers carry).
//
// We pass selection through router state (location.state.skus) instead
// of query string — a 200-SKU URL would blow past the URL length limit.
// If the user lands here without state (refresh, direct link), we fall
// back to whatever's in localStorage so a print preview survives a reload.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { Printer, ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BarcodePreview } from '@/components/ui/BarcodePreview';
import { useGetItemsQuery, useGetCategoriesQuery } from '@/features/inventory/inventoryApi';
import { useGetShopsQuery } from '@/features/shops/shopsApi';
import type { Item } from '@goldos/shared/types';

const STORAGE_KEY = 'zelora.printLabels.skus';
// Saved custom label sizes (user-defined W×H presets), reused across sessions.
const PRESETS_KEY = 'zelora.printLabels.customSizes';

interface LabelSize {
  key: string;
  label: string;
  /** mm */
  width: number;
  /** mm */
  height: number;
  /** cols × rows per A4 page */
  cols: number;
  rows: number;
  /** User-defined preset (deletable) vs a built-in. */
  custom?: boolean;
}

const LABEL_SIZES: LabelSize[] = [
  { key: '50x25', label: '50 × 25 mm — Standard jewellery tag', width: 50, height: 25, cols: 4, rows: 10 },
  { key: '40x20', label: '40 × 20 mm — Small ring tag', width: 40, height: 20, cols: 5, rows: 13 },
  { key: '70x40', label: '70 × 40 mm — Display card', width: 70, height: 40, cols: 2, rows: 6 },
];

// A4 usable area (210×297mm minus the @page 5mm margins) — used to auto-derive
// how many custom labels fit per row/page from their width/height.
const A4_USABLE_W = 200;
const A4_USABLE_H = 287;

function deriveGrid(width: number, height: number): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.floor(A4_USABLE_W / width)),
    rows: Math.max(1, Math.floor(A4_USABLE_H / height)),
  };
}

// Build a LabelSize from raw W×H (mm), auto-deriving the grid.
function makeCustomSize(width: number, height: number): LabelSize {
  const { cols, rows } = deriveGrid(width, height);
  return {
    key: `custom-${width}x${height}`,
    label: `${width} × ${height} mm — Custom`,
    width,
    height,
    cols,
    rows,
    custom: true,
  };
}

function loadCustomPresets(): LabelSize[] {
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    // Re-derive the grid on load so presets saved before a formula tweak stay valid.
    return arr
      .filter((s): s is { width: number; height: number } =>
        !!s && typeof (s as { width?: unknown }).width === 'number' && typeof (s as { height?: unknown }).height === 'number',
      )
      .map((s) => makeCustomSize(s.width, s.height));
  } catch {
    return [];
  }
}

function saveCustomPresets(list: LabelSize[]): void {
  try {
    window.localStorage.setItem(
      PRESETS_KEY,
      JSON.stringify(list.map((s) => ({ width: s.width, height: s.height }))),
    );
  } catch {
    /* localStorage full / disabled — presets just won't persist. */
  }
}

interface SelectionState {
  skus?: string[];
}

export function PrintLabelsPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [size, setSize] = useState<LabelSize>(LABEL_SIZES[0]!);
  // User-defined size presets (persisted) + the inline custom-entry panel.
  const [customPresets, setCustomPresets] = useState<LabelSize[]>(() => loadCustomPresets());
  const [customMode, setCustomMode] = useState(false);
  const [cw, setCw] = useState('50');
  const [ch, setCh] = useState('25');

  const allSizes = useMemo<LabelSize[]>(() => [...LABEL_SIZES, ...customPresets], [customPresets]);

  // Parse + validate the custom W×H inputs. Returns null (with a toast) if bad.
  const parseCustom = (): LabelSize | null => {
    const w = Math.round(parseFloat(cw));
    const h = Math.round(parseFloat(ch));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      toast.error('Enter a valid width and height in mm');
      return null;
    }
    if (w > A4_USABLE_W || h > A4_USABLE_H) {
      toast.error(`Max ${A4_USABLE_W} × ${A4_USABLE_H} mm (A4 usable area)`);
      return null;
    }
    return makeCustomSize(w, h);
  };

  const useCustomSize = (): void => {
    const s = parseCustom();
    if (!s) return;
    setSize(s);
    setCustomMode(false);
  };

  const saveCustomPreset = (): void => {
    const s = parseCustom();
    if (!s) return;
    setCustomPresets((prev) => {
      const next = prev.some((p) => p.key === s.key) ? prev : [...prev, s];
      saveCustomPresets(next);
      return next;
    });
    setSize(s);
    setCustomMode(false);
    toast.success(`Saved ${s.width} × ${s.height} mm preset`);
  };

  const deletePreset = (key: string): void => {
    setCustomPresets((prev) => {
      const next = prev.filter((p) => p.key !== key);
      saveCustomPresets(next);
      return next;
    });
    // If the deleted preset was selected, fall back to the first built-in.
    setSize((cur) => (cur.key === key ? LABEL_SIZES[0]! : cur));
  };

  // Pull SKUs from router state first, then localStorage as a refresh-safe
  // fallback. The InventoryPage hands us the SKUs in state when the user
  // clicks Print Labels; we persist on every render so reloads still work.
  const selectedSkus = useMemo<string[]>(() => {
    const state = location.state as SelectionState | null;
    if (state?.skus && state.skus.length > 0) return state.skus;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }, [location.state]);

  useEffect(() => {
    if (selectedSkus.length > 0) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedSkus));
      } catch {
        /* localStorage full / disabled — print still works for this session. */
      }
    }
  }, [selectedSkus]);

  // We fetch a comfortably-large page so most label batches fit in one
  // call; for the rare 200-item print job we'd page through, but the
  // typical workflow is "print today's intake of 5-30 pieces".
  const { data: itemsRes, isLoading } = useGetItemsQuery({});
  const { data: shopsRes } = useGetShopsQuery();
  const { data: categoriesRes } = useGetCategoriesQuery();

  const items: Item[] = useMemo(() => {
    const all = itemsRes?.data ?? [];
    if (selectedSkus.length === 0) return all.slice(0, 40); // Show some defaults if no selection.
    const setOf = new Set(selectedSkus);
    return all.filter((it) => setOf.has(it.sku));
  }, [itemsRes, selectedSkus]);

  const shopName = useMemo(() => {
    const map = new Map<string, string>();
    (shopsRes?.data ?? []).forEach((s) => map.set(s.id, s.name));
    return (id: string): string => map.get(id) ?? 'Shop';
  }, [shopsRes]);

  const categoryName = useMemo(() => {
    const map = new Map<string, string>();
    (categoriesRes?.data ?? []).forEach((c) => map.set(c.id, c.name));
    return (id: string): string => map.get(id) ?? '';
  }, [categoriesRes]);

  // metalType lives on the main (parent) category; sub-categories inherit it.
  const categoryMetalType = useMemo(() => {
    const cats = categoriesRes?.data ?? [];
    const byId = new Map(cats.map((c) => [c.id, c]));
    const map = new Map<string, string>();
    for (const c of cats) {
      const main = c.parentId ? byId.get(c.parentId) : c;
      map.set(c.id, (main ?? c).metalType ?? '');
    }
    return (id: string): string => map.get(id) ?? '';
  }, [categoriesRes]);

  function handlePrint(): void {
    window.print();
  }

  return (
    <div className="min-h-screen bg-ink-25 print:bg-ink-0">
      {/* Toolbar — hidden on print so it never lands on a tag */}
      <header className="sticky top-0 z-10 bg-ink-0 border-b border-ink-100 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-ink-700 hover:text-ink-900 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="text-ink-500 text-xs">Label size</label>
          <select
            value={customMode ? '__custom__' : size.key}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustomMode(true);
                setCw(String(size.width));
                setCh(String(size.height));
                return;
              }
              setCustomMode(false);
              setSize(allSizes.find((s) => s.key === e.target.value) ?? LABEL_SIZES[0]!);
            }}
            className="h-8 px-2 rounded-md border border-ink-200 bg-ink-0 text-sm"
          >
            <optgroup label="Standard">
              {LABEL_SIZES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </optgroup>
            {customPresets.length > 0 && (
              <optgroup label="Saved sizes">
                {customPresets.map((s) => (
                  <option key={s.key} value={s.key}>{s.width} × {s.height} mm</option>
                ))}
              </optgroup>
            )}
            <option value="__custom__">＋ Custom size…</option>
          </select>

          {customMode ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                value={cw}
                onChange={(e) => setCw(e.target.value)}
                className="h-8 w-16 px-2 rounded-md border border-ink-200 text-sm text-right tabular-nums"
                aria-label="Custom width (mm)"
              />
              <span className="text-ink-400 text-xs">×</span>
              <input
                type="number"
                min={1}
                value={ch}
                onChange={(e) => setCh(e.target.value)}
                className="h-8 w-16 px-2 rounded-md border border-ink-200 text-sm text-right tabular-nums"
                aria-label="Custom height (mm)"
              />
              <span className="text-ink-400 text-xs">mm</span>
              <Button size="sm" variant="outline" onClick={useCustomSize}>Use once</Button>
              <Button size="sm" onClick={saveCustomPreset}>Save preset</Button>
            </div>
          ) : (
            <>
              {size.custom && (
                <button
                  type="button"
                  onClick={() => deletePreset(size.key)}
                  className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-danger-600"
                  aria-label="Delete saved size"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
              <span className="text-xs text-ink-500">
                {items.length} label{items.length === 1 ? '' : 's'} · {size.cols * size.rows} per A4
              </span>
            </>
          )}
        </div>

        <Button onClick={handlePrint} disabled={items.length === 0}>
          <Printer className="h-4 w-4 mr-1.5" /> Print
        </Button>
      </header>

      <main className="px-4 sm:px-6 py-6 print:p-0">
        {isLoading && (
          <p className="text-sm text-ink-500">Loading items…</p>
        )}
        {!isLoading && items.length === 0 && (
          <div className="max-w-md mx-auto text-center mt-12">
            <p className="font-display text-display-sm text-ink-900">No items selected</p>
            <p className="text-sm text-ink-500 mt-2">
              Go back to the Inventory page, tick the items you want labels for, and click Print Labels.
            </p>
          </div>
        )}
        {items.length > 0 && (
          <LabelSheet
            items={items}
            size={size}
            shopName={shopName}
            categoryName={categoryName}
            categoryMetalType={categoryMetalType}
          />
        )}
      </main>

      {/* @page rules — tells the browser to use A4 with zero margins so
          our label grid maps to the printer's full sheet. The grid
          itself draws its own padding; that's the safe-zone label
          printers expect. The CSS lives inline because it's tightly
          coupled to the label dimensions chosen above. */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 5mm;
          }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

function LabelSheet({
  items,
  size,
  shopName,
  categoryName,
  categoryMetalType,
}: {
  items: Item[];
  size: LabelSize;
  shopName: (id: string) => string;
  categoryName: (id: string) => string;
  categoryMetalType: (id: string) => string;
}): JSX.Element {
  return (
    <div
      className="mx-auto bg-ink-0 print:bg-transparent shadow-sm print:shadow-none"
      style={{
        // A4 with grid gap
        width: '200mm',
        display: 'grid',
        gridTemplateColumns: `repeat(${size.cols}, ${size.width}mm)`,
        gridAutoRows: `${size.height}mm`,
        gap: '0',
      }}
    >
      {items.map((item) => (
        <LabelCell
          key={item.id}
          item={item}
          size={size}
          shopName={shopName(item.shopId)}
          category={categoryName(item.categoryId)}
          metalType={categoryMetalType(item.categoryId)}
        />
      ))}
    </div>
  );
}

function purityCodeForLabel(purityCaratX100: number, metalType: string): string {
  if (metalType === 'STAINLESS_STEEL') return 'ST';
  if (metalType === 'OTHER') return 'N/P';
  if (purityCaratX100 === 0) return '925';      // silver
  if (purityCaratX100 === 9500) return 'PT950';
  if (purityCaratX100 === 2400) return '24K';
  if (purityCaratX100 === 2200) return '22K';
  if (purityCaratX100 === 1800) return '18K';
  if (purityCaratX100 === 1400) return '14K';
  const k = purityCaratX100 / 100;
  return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K`;
}

function LabelCell({
  item,
  size,
  shopName,
  category,
  metalType,
}: {
  item: Item;
  size: LabelSize;
  shopName: string;
  category: string;
  metalType: string;
}): JSX.Element {
  const purityLabel = purityCodeForLabel(item.purityCaratX100, metalType);
  const weightG = (item.weightMg / 1000).toFixed(2);

  // Compact-mode tag (40×20) drops the QR + category to keep the SKU
  // readable. Bigger tags get the full layout.
  const compact = size.width < 50 || size.height < 25;

  return (
    <div
      className="border border-dashed border-ink-200 print:border-ink-100 p-[1.5mm] flex flex-col justify-between overflow-hidden text-ink-900"
      style={{ width: `${size.width}mm`, height: `${size.height}mm`, breakInside: 'avoid' }}
    >
      <div className="flex items-center justify-between text-[6pt] leading-none text-ink-500">
        <span className="truncate max-w-[60%]">{shopName}</span>
        <span className="font-mono">{purityLabel}</span>
      </div>

      <div
        className="flex-1 min-h-0 flex items-center justify-center my-[1mm]"
        style={{ maxHeight: `${compact ? 8 : 9}mm` }}
      >
        <BarcodePreview
          value={item.barcodeData || item.sku}
          height={compact ? 20 : 24}
          className="w-full"
          hideLabel
        />
      </div>

      <div className="flex items-end justify-between gap-[1mm]">
        <div className="min-w-0">
          <p className="text-[7pt] leading-tight font-mono truncate">{item.sku}</p>
          <p className="text-[6pt] leading-tight text-ink-600 truncate">
            {weightG} g{!compact && category ? ` · ${category}` : ''}
          </p>
        </div>
        {!compact && <InlineQrCode value={item.sku} sizeMm={6} />}
      </div>
    </div>
  );
}

/**
 * QR code rendered as a data URL inside an <img>. We use the `qrcode`
 * library's `toDataURL` so the encoding is correct (Reed-Solomon error
 * correction etc.) instead of hand-rolling. The library only runs once
 * per item because the data URL is memoised per (value).
 */
function InlineQrCode({ value, sizeMm }: { value: string; sizeMm: number }): JSX.Element {
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 0,
      // 240px renders crisply at any tag size up to ~25mm; the browser
      // scales down without aliasing.
      width: 240,
    })
      .then((url) => {
        if (!cancelled && ref.current) ref.current.src = url;
      })
      .catch(() => {
        /* QR generation failure shouldn't break the label — leave empty. */
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return (
    <img
      ref={ref}
      alt=""
      aria-hidden
      style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm`, imageRendering: 'pixelated' }}
    />
  );
}
