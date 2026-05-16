// Client-side export helpers. CSV is built in-browser (no backend round trip);
// Tally exports come from the backend (POST-quality data formatting), and
// "print as PDF" is just window.print() against a print-ready DOM.

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const escape = (cell: string | number): string => {
    const s = String(cell ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  // BOM ensures Excel opens ₹ and other unicode correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function paiseToRupeeString(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Fire the browser print dialog scoped to a CSS-targeted DOM element.
 * Caller passes the id of the wrapper to print; everything else is hidden
 * via a transient <style> tag.
 */
export function printSection(elementId: string, documentTitle: string): void {
  const node = document.getElementById(elementId);
  if (!node) return;
  const prevTitle = document.title;
  document.title = documentTitle;
  const style = document.createElement('style');
  style.id = '__print_scope';
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #${elementId}, #${elementId} * { visibility: visible !important; }
      #${elementId} { position: absolute; left: 0; top: 0; width: 100%; }
      .no-print { display: none !important; }
    }
  `;
  document.head.appendChild(style);
  window.print();
  setTimeout(() => {
    document.title = prevTitle;
    style.remove();
  }, 500);
}

/** Trigger a Tally export download via the backend. */
export async function downloadTallyExport(from: string, to: string): Promise<void> {
  const f = encodeURIComponent(from);
  const t = encodeURIComponent(to);
  const res = await fetch(`/api/v1/finance/tally-export?from=${f}&to=${t}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tally-${from.slice(0, 10)}-to-${to.slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
