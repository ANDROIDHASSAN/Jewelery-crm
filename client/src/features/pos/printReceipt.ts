// POS receipt printing — generates a print-friendly HTML document and opens
// it in an `about:blank` popup window, then triggers window.print().
//
// Why `about:blank` instead of a Blob URL? Same-origin: `window.close()`
// only works on script-opened, same-origin windows. A Blob URL is treated
// as a different origin and silently refuses to close, leaving the cashier
// with a stuck tab. About-blank inherits the opener origin so Close works.
//
// Why a popup at all instead of an in-page CSS @media print?
// - Bill state in the POS is cleared the moment the charge succeeds (next
//   bill starts). The popup snapshots the data so the cashier can re-print
//   without re-entering anything.

import { metalPurityLabel, type MetalTypeLike } from '@goldos/shared/metal-rate';

export interface PrintReceiptInput {
  billNumber: string;
  createdAt: string | Date;
  shop: { name: string; address?: string | null; phone?: string | null; gstStateCode?: string };
  tenant?: { businessName: string; gstNumber?: string | null; phone?: string | null };
  customer: { name: string; phone: string } | null;
  lines: Array<{
    sku: string;
    weightMg: number;
    purityCaratX100: number;
    /** Needed to label the line: purity 0 means "no carat" for silver AND
     *  non-precious, so purity alone can't name the metal. */
    metalType?: MetalTypeLike;
    ratePerGramPaise: number;
    makingChargeBps: number;
    stoneChargePaise: number;
    goldValuePaise: number;
    makingPaise: number;
    linePaise: number;
  }>;
  totals: {
    subtotalPaise: number;
    makingPaise: number;
    stonePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    discountPaise: number;
    oldGoldValuePaise: number;
    totalPaise: number;
  };
  payments: Array<{ mode: string; amountPaise: number; reference?: string | null }>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Was: `x100 < 1000 ? (x100 === 0 ? 'Silver' : x100/10) : `${x100/100}K``.
// That printed "90" for 9K gold (900 fell into the millesimal branch), "95K"
// for Pt 950, and "Silver" for stainless steel. Delegates to the one canonical
// labeller now.
function purityLabel(x100: number, metalType: MetalTypeLike): string {
  return metalPurityLabel(metalType, x100);
}

// Shared CSS for the receipt. Kept separate so we can stamp it into a same-
// origin popup's <head> via createElement('style') (no document.write).
const RECEIPT_CSS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; padding: 16px; }
  .wrap { max-width: 740px; margin: 0 auto; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  .muted { color: #666; }
  .small { font-size: 10.5px; }
  .right { text-align: right; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bold { font-weight: 600; }
  h2 { font-size: 14px; font-weight: 600; margin: 18px 0 6px; letter-spacing: 0.04em; text-transform: uppercase; color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { font-weight: 500; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th.num { text-align: right; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .totals { margin-top: 12px; margin-left: auto; width: 320px; }
  .totals td { padding: 4px 8px; border: 0; }
  .totals .grand td { border-top: 2px solid #111; padding-top: 10px; font-size: 14px; font-weight: 600; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f3f1ea; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: #6b5a18; }
  .foot { margin-top: 24px; padding-top: 14px; border-top: 1px dashed #ccc; color: #666; font-size: 11px; }
  .signature { margin-top: 50px; display: flex; justify-content: space-between; gap: 40px; }
  .signature div { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 11px; color: #666; }
  .toolbar { text-align: center; margin-top: 20px; }
  .toolbar button { padding: 8px 20px; font: 14px sans-serif; border-radius: 999px; cursor: pointer; }
  .toolbar .primary { background: #111; color: #fff; border: 0; }
  .toolbar .secondary { background: #fff; color: #111; border: 1px solid #ccc; }
  @media print { body { padding: 0; } .toolbar { display: none !important; } }
`;

export function renderReceiptHtml(input: PrintReceiptInput): string {
  const dt = new Date(input.createdAt);
  const dateStr = dt.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  const linesHtml = input.lines
    .map(
      (l, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td>${escapeHtml(l.sku)}</td>
          <td class="num">${(l.weightMg / 1000).toFixed(3)} g</td>
          <td class="num">${escapeHtml(purityLabel(l.purityCaratX100, l.metalType ?? null))}</td>
          <td class="num">${rupees(l.ratePerGramPaise)}/g</td>
          <td class="num">${rupees(l.goldValuePaise)}</td>
          <td class="num">${(l.makingChargeBps / 100).toFixed(2)}%</td>
          <td class="num">${rupees(l.makingPaise)}</td>
          <td class="num">${rupees(l.stoneChargePaise)}</td>
          <td class="num bold">${rupees(l.linePaise)}</td>
        </tr>`,
    )
    .join('');

  const paymentRows = input.payments
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.mode)}${p.reference ? ` <span class="muted">(${escapeHtml(p.reference)})</span>` : ''}</td>
        <td class="num">${rupees(p.amountPaise)}</td>
      </tr>`,
    )
    .join('');

  const t = input.totals;
  const bodyMarkup = `
<div class="wrap">
  <header class="row">
    <div>
      <div class="brand">${escapeHtml(input.tenant?.businessName ?? input.shop.name)}</div>
      <div class="muted small">${escapeHtml(input.shop.name)}</div>
      ${input.shop.address ? `<div class="muted small">${escapeHtml(input.shop.address)}</div>` : ''}
      ${input.shop.phone ? `<div class="muted small">Ph: ${escapeHtml(input.shop.phone)}</div>` : ''}
      ${input.tenant?.gstNumber ? `<div class="muted small">GSTIN: ${escapeHtml(input.tenant.gstNumber)}</div>` : ''}
    </div>
    <div class="right">
      <span class="pill">Tax Invoice</span>
      <div style="font-size:16px; font-weight:600; margin-top:6px;">${escapeHtml(input.billNumber)}</div>
      <div class="muted small">${escapeHtml(dateStr)} IST</div>
    </div>
  </header>

  <h2>Customer</h2>
  <div class="small">
    ${input.customer
      ? `${escapeHtml(input.customer.name)} &middot; <span class="muted">${escapeHtml(input.customer.phone)}</span>`
      : '<span class="muted">Walk-in customer</span>'}
  </div>

  <h2>Items</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th>SKU</th>
        <th class="num">Weight</th><th class="num">Purity</th>
        <th class="num">Rate</th><th class="num">Gold value</th>
        <th class="num">Making</th><th class="num">Mkg ₹</th>
        <th class="num">Stone</th><th class="num">Line ₹</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <table class="totals">
    <tr><td class="muted">Gold value</td><td class="num">${rupees(t.subtotalPaise)}</td></tr>
    <tr><td class="muted">Making charges</td><td class="num">${rupees(t.makingPaise)}</td></tr>
    ${t.stonePaise > 0 ? `<tr><td class="muted">Stone charges</td><td class="num">${rupees(t.stonePaise)}</td></tr>` : ''}
    ${t.oldGoldValuePaise > 0 ? `<tr><td class="muted">Old gold exchange</td><td class="num">− ${rupees(t.oldGoldValuePaise)}</td></tr>` : ''}
    ${t.discountPaise > 0 ? `<tr><td class="muted">Discount</td><td class="num">− ${rupees(t.discountPaise)}</td></tr>` : ''}
    ${t.cgstPaise > 0 ? `<tr><td class="muted">CGST (1.5%)</td><td class="num">${rupees(t.cgstPaise)}</td></tr>` : ''}
    ${t.sgstPaise > 0 ? `<tr><td class="muted">SGST (1.5%)</td><td class="num">${rupees(t.sgstPaise)}</td></tr>` : ''}
    ${t.igstPaise > 0 ? `<tr><td class="muted">IGST (3%)</td><td class="num">${rupees(t.igstPaise)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="num">${rupees(t.totalPaise)}</td></tr>
  </table>

  <h2>Payment</h2>
  <table>
    <thead><tr><th>Mode</th><th class="num">Amount</th></tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>

  <div class="signature">
    <div>Customer signature</div>
    <div>For ${escapeHtml(input.tenant?.businessName ?? input.shop.name)}</div>
  </div>

  <div class="foot small">
    Every piece is BIS-hallmarked and weighed in front of you. Lifetime exchange against pure-gold value.
    <br>This is a computer-generated invoice. Please keep it for warranty &amp; exchange.
  </div>
</div>

<div class="toolbar">
  <button class="primary" type="button" id="print-btn">Print receipt</button>
  <button class="secondary" type="button" id="close-btn">Close</button>
</div>`;

  // Full standalone document — used by tests / fallback paths.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt ${escapeHtml(input.billNumber)}</title>
<style>${RECEIPT_CSS}</style>
</head>
<body>${bodyMarkup}</body>
</html>`;
}

// Internal: returns just the receipt body markup (no <html>/<head>/<body>)
// so we can inject it into a same-origin popup via element.innerHTML and
// keep window.close() working. Reuses renderReceiptHtml + strips wrappers.
function renderReceiptBody(input: PrintReceiptInput): string {
  const full = renderReceiptHtml(input);
  const match = full.match(/<body>([\s\S]*)<\/body>/);
  return match ? match[1]! : full;
}

// Open the receipt in an `about:blank` popup, then build its document via
// DOM APIs. Parsing the markup with DOMParser first means the popup never
// sees innerHTML/document.write — we just move parsed nodes in. Same-origin
// (`about:blank` inherits opener origin) so the Close button can actually
// call window.close().
export function printReceipt(input: PrintReceiptInput): boolean {
  const w = window.open('about:blank', '_blank', 'width=820,height=900');
  if (!w) return false;

  // Title.
  w.document.title = `Receipt ${input.billNumber}`;

  // <head>: meta + style.
  const meta = w.document.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  w.document.head.appendChild(meta);
  const style = w.document.createElement('style');
  style.textContent = RECEIPT_CSS;
  w.document.head.appendChild(style);

  // <body>: parse the receipt markup in a sandbox document via DOMParser,
  // then import each child node into the popup. The markup contains only
  // pre-escaped strings (escapeHtml on every dynamic value) so there is no
  // injection surface.
  const parser = new DOMParser();
  const parsed = parser.parseFromString(
    `<!doctype html><html><body>${renderReceiptBody(input)}</body></html>`,
    'text/html',
  );
  Array.from(parsed.body.childNodes).forEach((node) => {
    w.document.body.appendChild(w.document.importNode(node, true));
  });

  // Wire toolbar buttons via the popup's own document — no inline handlers.
  const printBtn = w.document.getElementById('print-btn');
  const closeBtn = w.document.getElementById('close-btn');
  if (printBtn) printBtn.addEventListener('click', () => w.print());
  if (closeBtn) closeBtn.addEventListener('click', () => w.close());

  // Auto-fire the print dialog after a paint tick.
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* user can still hit the Print button if auto-print fails */
    }
  }, 300);

  return true;
}
