// Shared toolbar + filter helpers for every admin table. Designed as an
// opt-in wrapper — existing callers stay working without any change; new
// callers add a couple of lines:
//
//   const filtered = useTableSearch(rows, (r) => [r.sku, r.name], q);
//   <TableToolbar
//     query={q}
//     onQueryChange={setQ}
//     searchPlaceholder="Search by SKU or name"
//     filters={[
//       { key: 'shop', label: 'Shop', value: shop, onChange: setShop, options: [...] },
//       { key: 'status', label: 'Status', value: status, onChange: setStatus, options: [...] },
//     ]}
//     count={filtered.length}
//   />
//   <DataTable data={filtered} ... />
//
// Keeps the UX consistent across modules (Inventory / E-commerce / Analytics /
// CRM / Transfers) so an owner who learns the bar on one page reads it on
// every page.

import { Search, X } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/cn';

export interface TableFilterConfig {
  key: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  /**
   * Filter options. Use value: '' for the "all"/"clear" option, label
   * spelled out (e.g. "All shops"). Options are rendered as a native
   * <select> for accessibility + zero JS state in the toolbar itself.
   */
  options: ReadonlyArray<{ value: string; label: string }>;
}

export interface TableToolbarProps {
  query: string;
  onQueryChange: (next: string) => void;
  /** Helpful one-liner like "Search by SKU or name". */
  searchPlaceholder?: string;
  /** Optional select-style filters rendered to the right of the search box. */
  filters?: ReadonlyArray<TableFilterConfig>;
  /** Total rows after filtering. Shown as a small pill on the right. */
  count?: number;
  /** Human-readable noun for the count pill ("items" / "leads" / "orders"). */
  countLabel?: string;
  /** Right-aligned extra controls (e.g. an "Add row" button). */
  end?: React.ReactNode;
  className?: string;
}

export function TableToolbar({
  query,
  onQueryChange,
  searchPlaceholder = 'Search…',
  filters,
  count,
  countLabel = 'rows',
  end,
  className,
}: TableToolbarProps): JSX.Element {
  const hasFilters = (filters?.length ?? 0) > 0;
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-2 mb-3',
        className,
      )}
    >
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full h-9 pl-9 pr-9 rounded-md border border-ink-200 bg-ink-0 text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100"
            aria-label="Clear search"
            title="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {filters!.map((f) => (
            <select
              key={f.key}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="h-9 px-2 rounded-md border border-ink-200 bg-ink-0 text-sm text-ink-700 focus:outline-none focus:border-brand-500"
              aria-label={f.label}
              title={f.label}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      {typeof count === 'number' && (
        <span className="inline-flex items-center justify-center h-9 px-2.5 rounded-md text-xs text-ink-600 bg-ink-25 border border-ink-100 whitespace-nowrap">
          {count} {countLabel}
        </span>
      )}

      {end}
    </div>
  );
}

/**
 * Token-AND search hook. Splits the query into whitespace-delimited tokens
 * and keeps a row only if every token appears (case-insensitive) in any of
 * the strings returned by getSearchHaystack(row). Returns the original
 * array unchanged when the query is empty.
 *
 *   const filtered = useTableSearch(items, (i) => [i.sku, i.name, i.barcodeData], q);
 *
 * No deps beyond React — works against any in-memory data the page already
 * has, so no server changes are needed to enable search on a table.
 */
export function useTableSearch<T>(
  rows: readonly T[],
  getHaystack: (row: T) => Array<string | null | undefined>,
  query: string,
): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows as T[];
    const tokens = q.split(/\s+/).filter(Boolean);
    return (rows as T[]).filter((row) => {
      const haystack = getHaystack(row)
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [rows, query, getHaystack]);
}
