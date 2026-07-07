// Bulk Excel/CSV import — the biggest jeweller-onboarding blocker.
//
// Flow:
//   1. User opens modal → optionally downloads template
//   2. User attaches .xlsx or .csv
//   3. Client posts file with dryRun=true → server validates + returns
//      a row-by-row error list + valid-row count
//   4. UI shows the dry-run summary. If errors, user fixes their sheet
//      and retries.
//   5. User clicks "Import" → same endpoint with dryRun=false → server
//      runs the all-or-nothing transactional insert and returns the
//      inserted count. invalidatesTags refreshes the inventory list.
//
// Template download is built client-side from a tiny JSON the server
// exposes, so the columns can never drift from the validator.

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  useBulkImportItemsMutation,
  useLazyGetBulkImportTemplateQuery,
  useBulkImportPurchaseOrdersMutation,
  useLazyGetPoBulkImportTemplateQuery,
} from './inventoryApi';

interface BulkImportResultData {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  inserted: number;
  duplicates: string[];
  poCount?: number;
  errors: Array<{ row: number; column?: string; message: string }>;
}

type Variant = 'items' | 'purchase-orders';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Which importer to drive. Defaults to items. */
  variant?: Variant;
}

// Per-variant copy so the same modal serves items and purchase orders.
const VARIANT_COPY: Record<Variant, { eyebrow: string; title: string; blurb: string; noun: string; templateFile: string }> = {
  items: {
    eyebrow: 'Inventory',
    title: 'Bulk import items',
    blurb: "Upload an Excel or CSV sheet of items. We'll validate every row first — nothing is written until you confirm.",
    noun: 'item',
    templateFile: 'zelora-inventory-import-template.csv',
  },
  'purchase-orders': {
    eyebrow: 'Purchasing',
    title: 'Bulk import purchase orders',
    blurb: "Upload an Excel or CSV of PO lines. Rows are grouped into orders by Vendor + PO Ref. We validate first — nothing is written until you confirm.",
    noun: 'line',
    templateFile: 'zelora-po-import-template.csv',
  },
};

export function BulkImportModal({ open, onClose, variant = 'items' }: Props): JSX.Element | null {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<BulkImportResultData | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const copy = VARIANT_COPY[variant];

  // Both hooks are created unconditionally (rules of hooks); we pick by variant.
  const [importItems, itemsState] = useBulkImportItemsMutation();
  const [importPos, posState] = useBulkImportPurchaseOrdersMutation();
  const [fetchItemTpl, itemTplState] = useLazyGetBulkImportTemplateQuery();
  const [fetchPoTpl, poTplState] = useLazyGetPoBulkImportTemplateQuery();
  const isPo = variant === 'purchase-orders';
  const bulkImport = isPo ? importPos : importItems;
  const importing = isPo ? posState.isLoading : itemsState.isLoading;
  const fetchTemplate = isPo ? fetchPoTpl : fetchItemTpl;
  const templateLoading = isPo ? poTplState.isFetching : itemTplState.isFetching;

  // Reset state when the modal closes/reopens — otherwise the prior
  // import's results stick around and the user sees a confusing mix.
  useEffect(() => {
    if (!open) {
      setFile(null);
      setResult(null);
    }
  }, [open]);

  if (!open) return null;

  function onPickFile(f: File | null): void {
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.csv')) {
      toast.error('Only .xlsx or .csv files are supported');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error('File must be under 8 MB');
      return;
    }
    setFile(f);
    setResult(null);
  }

  async function runImport(dryRun: boolean): Promise<void> {
    if (!file) return;
    try {
      const res = await bulkImport({ file, dryRun }).unwrap();
      setResult(res.data);
      if (!dryRun && res.data.inserted > 0) {
        const poSuffix = res.data.poCount != null ? ` across ${res.data.poCount} PO${res.data.poCount === 1 ? '' : 's'}` : '';
        toast.success(`Imported ${res.data.inserted} ${copy.noun}${res.data.inserted === 1 ? '' : 's'}${poSuffix}`);
        // Close after the user has a moment to see the success summary.
        setTimeout(() => onClose(), 1500);
      } else if (!dryRun && res.data.errors.length > 0) {
        toast.error(`Import blocked by ${res.data.errors.length} validation error${res.data.errors.length === 1 ? '' : 's'}`);
      }
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Bulk import failed');
    }
  }

  async function downloadTemplate(): Promise<void> {
    try {
      const res = await fetchTemplate().unwrap();
      const { columns, example } = res.data;
      // Build a CSV the user can open in Excel/Sheets. CSV is the
      // lowest-common-denominator format — keeps this client-side
      // download bundle small (we'd need exceljs in the browser to
      // generate a real .xlsx, ~300KB bundle weight).
      const rows = [columns.join(','), ...example.map((row) => columns.map((c) => csvCell(row[c])).join(','))];
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = copy.templateFile;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not load template');
    }
  }

  const hasErrors = (result?.errors.length ?? 0) > 0;
  const canCommit = result?.dryRun === true && !hasErrors && result.validRows > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-2xl bg-ink-0 rounded-lg shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        <header className="flex items-start justify-between px-6 py-5 border-b border-ink-100">
          <div>
            <p className="text-eyebrow uppercase text-ink-500">{copy.eyebrow}</p>
            <h2 className="font-display text-display-sm text-ink-900 mt-1">{copy.title}</h2>
            <p className="text-sm text-ink-500 mt-2 max-w-md">{copy.blurb}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md text-ink-500 hover:bg-ink-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-ink-100 bg-ink-25">
            <div className="flex items-center gap-3 min-w-0">
              <Download className="h-4 w-4 text-ink-500 shrink-0" />
              <div className="text-sm min-w-0">
                <p className="text-ink-900 font-medium">Don't have a sheet yet?</p>
                <p className="text-ink-500 text-xs">Download a CSV template with the right columns + sample rows.</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadTemplate}
              disabled={templateLoading}
            >
              {templateLoading ? 'Loading…' : 'Template'}
            </Button>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) onPickFile(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-md border-2 border-dashed cursor-pointer transition-colors',
              dragOver
                ? 'border-brand-500 bg-brand-50'
                : file
                  ? 'border-success-300 bg-success-50/40'
                  : 'border-ink-200 hover:border-ink-300 hover:bg-ink-25',
            )}
          >
            {file ? (
              <>
                <FileSpreadsheet className="h-7 w-7 text-success-600" aria-hidden />
                <p className="text-sm text-ink-900 font-medium">{file.name}</p>
                <p className="text-xs text-ink-500">
                  {(file.size / 1024).toFixed(1)} KB · click to replace
                </p>
              </>
            ) : (
              <>
                <Upload className="h-7 w-7 text-ink-500" aria-hidden />
                <p className="text-sm text-ink-700">
                  <span className="font-medium text-ink-900">Click to upload</span> or drag &amp; drop
                </p>
                <p className="text-xs text-ink-500">.xlsx or .csv · up to 8 MB</p>
              </>
            )}
          </div>
          {/* Sibling, not child: when nested inside the dropzone the input's
              programmatic .click() bubbled back to the dropzone onClick and
              re-fired the picker — opening the file dialog twice. */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />

          {result && (
            <ResultSummary result={result} noun={copy.noun} />
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-ink-100 bg-ink-25">
          <p className="text-xs text-ink-500">
            {result?.dryRun === true
              ? 'Dry run — nothing has been written yet.'
              : result && !result.dryRun
                ? `${result.inserted} ${copy.noun}${result.inserted === 1 ? '' : 's'} imported.`
                : 'Step 1 of 2 — validate first, then commit.'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {result?.dryRun === false && !hasErrors ? (
              <Button onClick={onClose}>Done</Button>
            ) : canCommit ? (
              <Button onClick={() => runImport(false)} disabled={importing}>
                {importing ? 'Importing…' : `Import ${result.validRows} ${copy.noun}${result.validRows === 1 ? '' : 's'}`}
              </Button>
            ) : (
              <Button onClick={() => runImport(true)} disabled={!file || importing}>
                {importing ? 'Validating…' : 'Validate'}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function ResultSummary({ result, noun }: { result: BulkImportResultData; noun: string }): JSX.Element {
  const hasErrors = result.errors.length > 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <SummaryTile label="Total rows" value={result.totalRows} />
        <SummaryTile label="Valid" value={result.validRows} positive />
        <SummaryTile label="Errors" value={result.errors.length} negative={hasErrors} />
      </div>

      {result.dryRun && result.poCount != null && result.poCount > 0 && !hasErrors && (
        <p className="text-xs text-ink-500">
          These rows will create <span className="font-medium text-ink-700">{result.poCount}</span> purchase
          order{result.poCount === 1 ? '' : 's'} (grouped by Vendor + PO Ref).
        </p>
      )}

      {!result.dryRun && result.inserted > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-success-50 border border-success-200 text-sm text-success-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Imported {result.inserted} {noun}{result.inserted === 1 ? '' : 's'}
          {result.poCount != null ? ` across ${result.poCount} PO${result.poCount === 1 ? '' : 's'}` : ''} successfully.
        </div>
      )}

      {hasErrors && (
        <div className="rounded-md border border-warning-200 bg-warning-50 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-warning-200 text-sm text-warning-700">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Fix these in your sheet and re-upload. We won't write anything until every row validates.
            </span>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-warning-50/95 backdrop-blur">
                <tr className="text-left text-warning-700">
                  <th className="px-3 py-1.5 font-medium w-16">Row</th>
                  <th className="px-3 py-1.5 font-medium w-32">Column</th>
                  <th className="px-3 py-1.5 font-medium">Problem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warning-200">
                {result.errors.map((e, i) => (
                  <tr key={i} className="text-ink-700">
                    <td className="px-3 py-1.5 font-mono">{e.row}</td>
                    <td className="px-3 py-1.5">{e.column ?? '—'}</td>
                    <td className="px-3 py-1.5">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2',
        positive ? 'border-success-200 bg-success-50/60' : negative ? 'border-warning-200 bg-warning-50/60' : 'border-ink-100 bg-ink-25',
      )}
    >
      <p className="text-eyebrow uppercase text-ink-500">{label}</p>
      <p className={cn('text-xl font-mono tabular-nums mt-0.5', negative ? 'text-warning-700' : 'text-ink-900')}>
        {value}
      </p>
    </div>
  );
}

// Light CSV escaper — wraps a value in quotes only if needed, doubles up
// embedded quotes. Used for the template download.
function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
