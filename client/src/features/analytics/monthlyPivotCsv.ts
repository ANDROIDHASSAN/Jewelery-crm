// Shared CSV builder for the month-by-month sub-category & item sales pivot.
// Used by both the Analytics → Real-time and Finance → Overview CSV exports so
// the two dashboards produce an identical breakdown. Months become columns
// (one per YYYY-MM), values are revenue in ₹, with a trailing Total column.

import { paiseToRupeeString } from '@/features/finance/lib/export';
import type { MonthlyCategoryItem } from './analyticsApi';

export function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo) return m;
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Returns the CSV rows for the monthly pivot — two stacked tables
 * (by sub-category, then by item), each with a month-per-column layout.
 * Caller spreads these into the larger sheet (with a blank row before).
 */
export function monthlyPivotCsvBlocks(rep: MonthlyCategoryItem): (string | number)[][] {
  const { months } = rep;
  const labels = months.map(monthLabel);
  const range = `${rep.from.slice(0, 10)} → ${rep.to.slice(0, 10)}`;

  const rows: (string | number)[][] = [];

  rows.push(['Monthly sales by sub-category · POS + online · revenue ₹', range]);
  rows.push(['Sub-category', 'Main category', ...labels, 'Total']);
  for (const r of rep.subcategories) {
    rows.push([
      r.name,
      r.mainCategoryName ?? '—',
      ...months.map((m) => paiseToRupeeString(r.byMonth[m]?.revenuePaise ?? 0)),
      paiseToRupeeString(r.totalRevenuePaise),
    ]);
  }
  if (rep.subcategories.length === 0) rows.push(['No sales in this period']);

  rows.push([]);

  rows.push(['Monthly sales by item · POS + online · revenue ₹', range]);
  rows.push(['Item', 'Sub-category', ...labels, 'Total']);
  for (const r of rep.items) {
    rows.push([
      r.name,
      r.subCategoryName ?? '—',
      ...months.map((m) => paiseToRupeeString(r.byMonth[m]?.revenuePaise ?? 0)),
      paiseToRupeeString(r.totalRevenuePaise),
    ]);
  }
  if (rep.items.length === 0) rows.push(['No sales in this period']);

  return rows;
}
