// server/src/lib/receipt-pdf.ts — A4 branded tax-invoice renderer for both
// POS bills and e-commerce orders. Every visible string is editable through
// the Website CMS → Invoice Layout tab; this file is just the layout engine.
//
// Why server-side?
//   1. Identical output for in-store (POS) and online (storefront) — both
//      call this single render function.
//   2. The receipt is the legal tax invoice in India; rendering server-side
//      keeps the layout / GST math out of reach of the browser.
//
// pdfkit is Node-only, no native deps, safe on Render's free tier. Bytes
// stream to the response so memory use is bounded regardless of bill size.
// QR generation uses the `qrcode` npm package — also pure JS.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { paiseToIndianWords } from './amount-in-words.js';

export interface ReceiptLine {
  description: string;
  details?: string; // e.g. "22K · 10.45 g · making 12%"
  qty: number;
  unitPaise: number;
  amountPaise: number;
  // Optional structured columns shown in the new design. When provided,
  // they render in dedicated columns; when omitted, the renderer falls
  // back to packing them into `details`.
  weightG?: number;
  ratePerGPaise?: number;      // per-gram metal rate (gold/silver items)
  makingPct?: number;          // PERCENTAGE mode: displayed as X.XX%
  makingPerGramPaise?: number; // PER_GRAM mode: displayed as Rs.X/g
  isQtyPriced?: boolean;       // true for fixed-price items (steel/gold-tone)
  perQtyPricePaise?: number;   // unit price for fixed-price items
}

export interface InvoiceLayout {
  brandSubTagline?: string;
  brandEstablishedLine?: string;
  heroHeadline?: string;
  heroBody?: string;
  heroImage?: string;
  invoiceTitle?: string;
  invoiceNumberPrefix?: string;
  businessAddress?: string;
  businessEmail?: string;
  thankYouTitle?: string;
  thankYouBody?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  upiId?: string;
  termsAndConditions?: string;
  footerRibbon?: string;
  contactWebsite?: string;
  contactPhone?: string;
  contactAddressLine?: string;
  showLogo?: boolean;
  showHeroImage?: boolean;
  showAmountInWords?: boolean;
  showUpiQr?: boolean;
  showStamp?: boolean;
  accentColor?: string;
  // legacy fields kept so callers don't have to filter them out
  headerNote?: string;
  footerNote?: string;
  signatoryName?: string;
}

export interface ReceiptInput {
  business: {
    name: string;
    address: string;
    gstin: string | null;
    phone: string;
    logoUrl?: string | null;
    email?: string | null;
  };
  invoice: {
    number: string;
    dateIso: string;
    placeOfSupply: string;
  };
  customer: {
    name: string;
    phone: string;
    gstin?: string | null;
    address?: string | null;
  };
  lines: ReceiptLine[];
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  discountPaise: number;
  totalPaise: number;
  payments: Array<{ mode: string; amountPaise: number; referenceId?: string | null }>;
  /** Optional CMS-driven layout overrides. */
  layout?: InvoiceLayout | null;
  /** Optional footer override — legacy callers can pass it inline. */
  footerNote?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────

const rupees = (paise: number): string => `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Compact rate without trailing zeros — "Rs.1,000" not "Rs.1,000.00".
const compactRs = (paise: number): string => `Rs.${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const istDate = (date: Date): string => date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

// Brand palette derived from the reference design. accentColor (peach/copper)
// drives headlines, totals card and ribbon. The rest are neutrals.
const PALETTE = {
  ink: '#3A2D26',         // primary text
  inkSoft: '#7B6A60',     // secondary text
  inkSofter: '#A8978C',   // labels / eyebrows
  cream: '#FBF6EF',       // page background
  band: '#F4E7D8',        // soft band background (Bill-to / Business cards, totals card)
  hairline: '#E9D9C6',    // thin dividers
  surface: '#FFFFFF',     // card surface
} as const;

function fetchImageBuffer(url: string): Promise<Buffer | null> {
  // Inline data URLs (data:image/...;base64,XYZ) — decode directly.
  if (url.startsWith('data:')) {
    const idx = url.indexOf('base64,');
    if (idx === -1) return Promise.resolve(null);
    try {
      return Promise.resolve(Buffer.from(url.slice(idx + 7), 'base64'));
    } catch {
      return Promise.resolve(null);
    }
  }
  // Remote URLs — fetch with a 4 s timeout so a stalled CDN can't hold up
  // the invoice. Failure is non-fatal; the renderer skips the image.
  if (!/^https?:\/\//.test(url)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        clearTimeout(timer);
        if (!r.ok) return resolve(null);
        const arr = await r.arrayBuffer();
        resolve(Buffer.from(arr));
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

async function makeQrPng(text: string, sizePx: number): Promise<Buffer | null> {
  try {
    return await QRCode.toBuffer(text, { type: 'png', errorCorrectionLevel: 'M', margin: 0, width: sizePx });
  } catch {
    return null;
  }
}

/**
 * Streams an A4 invoice PDF to the provided writable. Returns when the
 * PDF is fully written. Caller is responsible for `Content-Type` and
 * `Content-Disposition` headers.
 */
export async function renderReceiptPdf(input: ReceiptInput, out: NodeJS.WritableStream): Promise<void> {
  const L: InvoiceLayout = input.layout ?? {};
  const accent = L.accentColor ?? '#C7895A';

  // Pre-fetch every image we'll need (logo, hero, QR). Done in parallel so
  // the renderer can't be blocked by a single slow source. nulls are fine —
  // we skip the slot.
  const upiPayload = L.upiId
    ? `upi://pay?pa=${encodeURIComponent(L.upiId)}&pn=${encodeURIComponent(input.business.name)}&am=${(input.totalPaise / 100).toFixed(2)}&cu=INR`
    : null;
  const [logoBuf, heroBuf, qrBuf] = await Promise.all([
    L.showLogo !== false && input.business.logoUrl ? fetchImageBuffer(input.business.logoUrl) : Promise.resolve(null),
    L.showHeroImage !== false && L.heroImage ? fetchImageBuffer(L.heroImage) : Promise.resolve(null),
    L.showUpiQr !== false && upiPayload ? makeQrPng(upiPayload, 280) : Promise.resolve(null),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      info: { Title: `Invoice ${input.invoice.number}`, Author: input.business.name },
    });
    doc.on('end', resolve);
    doc.on('error', reject);
    doc.pipe(out);

    // Page-wide cream background.
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(PALETTE.cream);

    const PAGE_W = doc.page.width;
    const M = 36;
    const CONTENT_W = PAGE_W - M * 2;
    const LEFT_COL_W = CONTENT_W * 0.6;
    const RIGHT_COL_X = M + LEFT_COL_W + 16;
    const RIGHT_COL_W = CONTENT_W - LEFT_COL_W - 16;

    // ── 1. Brand band (top-left) + Tax-invoice meta (top-right) ──────────
    let y = M;
    let logoRight = M;
    if (logoBuf) {
      try {
        doc.save();
        // Rounded box behind the logo, accent-coloured peach.
        doc.roundedRect(M, y, 52, 52, 8).fill(PALETTE.band);
        doc.image(logoBuf, M + 6, y + 6, { fit: [40, 40] });
        doc.restore();
        logoRight = M + 52 + 12;
      } catch {
        logoRight = M;
      }
    }
    // Brand wordmark.
    doc.fillColor(PALETTE.ink).font('Helvetica-Bold').fontSize(34)
      .text(input.business.name, logoRight, y, { width: LEFT_COL_W - (logoRight - M), align: 'left' });
    const wordmarkBottom = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(PALETTE.inkSofter)
      .text(L.brandSubTagline ?? 'FINE JEWELLERY', logoRight, wordmarkBottom - 4, {
        width: LEFT_COL_W - (logoRight - M),
        characterSpacing: 3,
      });
    doc.font('Helvetica').fontSize(8).fillColor(accent)
      .text(L.brandEstablishedLine ?? '', logoRight, doc.y, {
        width: LEFT_COL_W - (logoRight - M),
        characterSpacing: 2,
      });

    // Right column: Tax invoice block. Anchor by Y so we don't drift.
    doc.font('Helvetica-Bold').fontSize(18).fillColor(accent)
      .text(L.invoiceTitle ?? 'TAX INVOICE', RIGHT_COL_X, y, { width: RIGHT_COL_W, align: 'left' });
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSofter).text('Invoice No.', RIGHT_COL_X, doc.y, { width: RIGHT_COL_W });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(PALETTE.ink)
      .text(`${L.invoiceNumberPrefix ?? ''}${input.invoice.number}`, RIGHT_COL_X, doc.y, { width: RIGHT_COL_W });
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSofter).text('Date', RIGHT_COL_X, doc.y, { width: RIGHT_COL_W });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(PALETTE.ink)
      .text(istDate(new Date(input.invoice.dateIso)), RIGHT_COL_X, doc.y, { width: RIGHT_COL_W });
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSofter).text('Place of Supply', RIGHT_COL_X, doc.y, { width: RIGHT_COL_W });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(PALETTE.ink)
      .text(input.invoice.placeOfSupply, RIGHT_COL_X, doc.y, { width: RIGHT_COL_W });

    // Advance the cursor below whichever column was taller.
    y = Math.max(doc.y, wordmarkBottom + 36) + 14;

    // ── 2. Hero block (left) ─────────────────────────────────────────────
    const heroY = y;
    doc.font('Helvetica-Bold').fontSize(22).fillColor(PALETTE.ink)
      .text(L.heroHeadline ?? '', M, heroY, { width: LEFT_COL_W * 0.55 });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSoft)
      .text(L.heroBody ?? '', M, doc.y, { width: LEFT_COL_W * 0.55, lineGap: 2 });
    const leftHeroBottom = doc.y;
    if (heroBuf) {
      try {
        const imgX = M + LEFT_COL_W * 0.55 + 8;
        const imgW = LEFT_COL_W - LEFT_COL_W * 0.55 - 8;
        doc.image(heroBuf, imgX, heroY, { fit: [imgW, 110], align: 'center', valign: 'center' });
      } catch {
        // ignore — keep going
      }
    }
    y = Math.max(leftHeroBottom, heroY + 110) + 18;

    // Soft divider line.
    doc.moveTo(M, y).lineTo(M + CONTENT_W, y).lineWidth(0.5).strokeColor(PALETTE.hairline).stroke();
    y += 16;

    // ── 3. Bill-to & Business cards (two columns of soft-band cards) ────
    const CARD_GAP = 14;
    const CARD_W = (CONTENT_W - CARD_GAP) / 2;
    const cardTop = y;
    const cardH = 96;
    doc.roundedRect(M, cardTop, CARD_W, cardH, 6).fill(PALETTE.surface);
    doc.roundedRect(M + CARD_W + CARD_GAP, cardTop, CARD_W, cardH, 6).fill(PALETTE.surface);
    doc.lineWidth(0.5).strokeColor(PALETTE.hairline);
    doc.roundedRect(M, cardTop, CARD_W, cardH, 6).stroke();
    doc.roundedRect(M + CARD_W + CARD_GAP, cardTop, CARD_W, cardH, 6).stroke();

    // Bill To (left)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(accent).text('BILL TO', M + 14, cardTop + 12, { characterSpacing: 1.6 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(PALETTE.ink).text(input.customer.name, M + 14, cardTop + 30, { width: CARD_W - 28 });
    doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSoft)
      .text(input.customer.phone, M + 14, doc.y + 2, { width: CARD_W - 28 });
    if (input.customer.address) {
      doc.text(input.customer.address, M + 14, doc.y + 1, { width: CARD_W - 28 });
    }
    if (input.customer.gstin) {
      doc.text(`GSTIN: ${input.customer.gstin}`, M + 14, doc.y + 1, { width: CARD_W - 28 });
    }

    // Business Details (right)
    const bX = M + CARD_W + CARD_GAP + 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(accent).text('BUSINESS DETAILS', bX, cardTop + 12, { characterSpacing: 1.6 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(PALETTE.ink).text(input.business.name, bX, cardTop + 30, { width: CARD_W - 28 });
    doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSoft);
    if (input.business.gstin) doc.text(`GSTIN: ${input.business.gstin}`, bX, doc.y + 2, { width: CARD_W - 28 });
    if (input.business.address) doc.text(input.business.address, bX, doc.y + 1, { width: CARD_W - 28 });
    if (input.business.phone) doc.text(`Phone: ${input.business.phone}`, bX, doc.y + 1, { width: CARD_W - 28 });
    if (input.business.email) doc.text(`Email: ${input.business.email}`, bX, doc.y + 1, { width: CARD_W - 28 });

    y = cardTop + cardH + 18;

    // ── 4. Line items table ──────────────────────────────────────────────
    // Column X positions are set so the AMOUNT column gets ≥75 pt —
    // enough for "Rs. 16,608.75" at Helvetica-Bold 11 pt without wrapping.
    const cols = {
      num: M + 12,
      desc: M + 36,
      weight: M + 226,   // shifted left vs the old 260 to reclaim space for amount
      rate: M + 286,
      making: M + 354,
      qty: M + 408,
      amount: M + 436,   // gives tableRight-cols.amount ≈ 75 pt
    };
    const tableRight = M + CONTENT_W - 12;
    const descColW = cols.weight - cols.desc - 8;  // 182 pt, keeps desc from bleeding into weight

    // Table header band.
    doc.roundedRect(M, y, CONTENT_W, 26, 4).fill(PALETTE.band);
    doc.fillColor(PALETTE.ink).font('Helvetica-Bold').fontSize(9);
    doc.text('#', cols.num, y + 9, { width: 18 });
    doc.text('DESCRIPTION', cols.desc, y + 9, { width: descColW });
    doc.text('WEIGHT', cols.weight, y + 9, { width: 56, align: 'left' });
    doc.text('RATE', cols.rate, y + 9, { width: 62, align: 'left' });
    doc.text('MAKING', cols.making, y + 9, { width: 48, align: 'left' });
    doc.text('QTY', cols.qty, y + 9, { width: 24, align: 'left' });
    doc.text('AMOUNT (Rs.)', cols.amount, y + 9, { width: tableRight - cols.amount, align: 'right' });
    y += 30;

    doc.font('Helvetica').fontSize(10).fillColor(PALETTE.ink);
    input.lines.forEach((line, idx) => {
      const rowTop = y;
      // Row number
      doc.font('Helvetica').fontSize(10).fillColor(PALETTE.inkSoft).text(String(idx + 1), cols.num, rowTop, { width: 18 });
      // Description (name + details)
      doc.font('Helvetica-Bold').fontSize(11).fillColor(PALETTE.ink).text(line.description, cols.desc, rowTop, { width: descColW });
      if (line.details) {
        doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSoft).text(line.details, cols.desc, doc.y + 1, { width: descColW });
      }
      const descBottom = doc.y;

      // Numeric columns — render anchored at rowTop so they sit next to the
      // first line of the description rather than the bottom of details.
      doc.font('Helvetica').fontSize(10).fillColor(PALETTE.ink);
      doc.text(line.weightG != null ? `${line.weightG.toFixed(3)} g` : '—', cols.weight, rowTop, { width: 56 });

      // Rate column: per-gram for gold/silver, per-piece for fixed-price items.
      const rateText = line.isQtyPriced && line.perQtyPricePaise != null
        ? `${compactRs(line.perQtyPricePaise)}/pc`
        : line.ratePerGPaise != null
        ? `${compactRs(line.ratePerGPaise)}/g`
        : '—';
      doc.text(rateText, cols.rate, rowTop, { width: 62 });

      // Making column: Rs.X/g for PER_GRAM mode, X.XX% for PERCENTAGE mode.
      const makingText = line.makingPerGramPaise != null
        ? `${compactRs(line.makingPerGramPaise)}/g`
        : line.makingPct != null
        ? `${line.makingPct.toFixed(2)}%`
        : '—';
      doc.text(makingText, cols.making, rowTop, { width: 48 });
      doc.text(String(line.qty), cols.qty, rowTop, { width: 24 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(PALETTE.ink)
        .text(rupees(line.amountPaise), cols.amount, rowTop, { width: tableRight - cols.amount, align: 'right' });

      y = Math.max(descBottom, rowTop + 16) + 10;
      // Hairline between rows.
      doc.moveTo(M + 12, y - 4).lineTo(tableRight, y - 4).lineWidth(0.4).strokeColor(PALETTE.hairline).stroke();
    });

    y += 8;

    // ── 5. Amount-in-words card + Totals card (two columns) ──────────────
    const summaryTop = y;
    const wordsCardW = CARD_W;
    const totalsCardW = CARD_W;
    const totalsCardX = M + wordsCardW + CARD_GAP;

    // Amount in words (left card)
    if (L.showAmountInWords !== false) {
      doc.roundedRect(M, summaryTop, wordsCardW, 92, 6).fill(PALETTE.band);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(PALETTE.ink).text('Amount in Words', M + 14, summaryTop + 12, { characterSpacing: 0.5 });
      doc.font('Helvetica').fontSize(10).fillColor(PALETTE.inkSoft)
        .text(paiseToIndianWords(input.totalPaise), M + 14, summaryTop + 30, { width: wordsCardW - 28, lineGap: 2 });
    }

    // Totals (right card) — subtotal, taxes, discount, total highlight.
    let ty = summaryTop + 8;
    const labelX = totalsCardX + 14;
    const valueX = totalsCardX + totalsCardW - 14;
    const row = (label: string, value: string, isTotal = false): void => {
      doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isTotal ? 13 : 10).fillColor(isTotal ? PALETTE.ink : PALETTE.inkSoft);
      doc.text(label, labelX, ty, { width: totalsCardW / 2 - 14 });
      doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isTotal ? 13 : 10).fillColor(isTotal ? PALETTE.ink : PALETTE.ink);
      doc.text(value, labelX, ty, { width: valueX - labelX, align: 'right' });
      ty += isTotal ? 22 : 18;
    };
    row('Subtotal', rupees(input.subtotalPaise));
    if (input.discountPaise > 0) row('Discount', `- ${rupees(input.discountPaise)}`);
    if (input.cgstPaise > 0) row('CGST (1.50%)', rupees(input.cgstPaise));
    if (input.sgstPaise > 0) row('SGST (1.50%)', rupees(input.sgstPaise));
    if (input.igstPaise > 0) row('IGST (3.00%)', rupees(input.igstPaise));
    // Total highlight strip
    ty += 4;
    doc.roundedRect(totalsCardX, ty, totalsCardW, 36, 6).fill(PALETTE.band);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(PALETTE.ink).text('TOTAL', labelX, ty + 11);
    doc.font('Helvetica-Bold').fontSize(15).fillColor(accent)
      .text(rupees(input.totalPaise), labelX, ty + 9, { width: valueX - labelX, align: 'right' });
    ty += 44;

    y = Math.max(summaryTop + 92, ty) + 18;

    // ── 6. Footer block (thank-you → payment | QR | terms | stamp) ──────
    // All four horizontal columns share a single top anchor (footerTop) so
    // the QR image (footerTop+14 … footerTop+90) and stamp circle
    // (bottom = footerTop+94) always clear the ribbon at page.height-86.
    //
    // The left column stacks the thank-you message directly above the
    // payment details so neither can overlap the other or any adjacent column.
    // 202 = 86 (ribbon) + 116 (block height including left-column text).
    const footerTop = Math.min(y, doc.page.height - 202);

    const payX = M;
    const qrX = M + 176;
    const termsX = M + 278;
    const stampX = M + CONTENT_W - 100;
    const payColW = qrX - payX - 10;        // ≈166 pt
    const qrSectionW = termsX - qrX - 8;    // ≈94 pt
    const termsColW = stampX - termsX - 12; // ≈133 pt

    // ── Left column: thank-you → gap → payment details (top-to-bottom) ──
    let py = footerTop;
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(accent)
      .text(L.thankYouTitle ?? '', payX, py, { width: payColW });
    py = doc.y + 2;
    doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSoft)
      .text(L.thankYouBody ?? '', payX, py, { width: payColW, lineGap: 2 });
    py = doc.y + 10;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(accent)
      .text('PAYMENT DETAILS', payX, py, { characterSpacing: 1.6, width: payColW });
    py = doc.y + 4;
    doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSoft);
    if (L.bankName) { doc.text(`Bank: ${L.bankName}`, payX, py, { width: payColW }); py = doc.y + 1; }
    if (L.bankAccountNumber) { doc.text(`A/C: ${L.bankAccountNumber}`, payX, py, { width: payColW }); py = doc.y + 1; }
    if (L.bankIfsc) { doc.text(`IFSC: ${L.bankIfsc}`, payX, py, { width: payColW }); py = doc.y + 1; }
    if (L.upiId) { doc.text(`UPI: ${L.upiId}`, payX, py, { width: payColW }); py = doc.y + 1; }

    // ── QR — anchored to footerTop, same row as PAYMENT DETAILS header ──
    if (qrBuf) {
      try {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(accent)
          .text('SCAN TO PAY', qrX, footerTop, { characterSpacing: 1.6, width: qrSectionW });
        doc.image(qrBuf, qrX, footerTop + 14, { fit: [76, 76] });
      } catch {
        // ignore
      }
    }

    // ── Terms ─────────────────────────────────────────────────────────────
    let ty2 = footerTop;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(accent)
      .text('TERMS & NOTES', termsX, ty2, { characterSpacing: 1.6, width: termsColW });
    ty2 = doc.y + 4;
    if (L.termsAndConditions) {
      doc.font('Helvetica').fontSize(8.5).fillColor(PALETTE.inkSoft);
      const items = L.termsAndConditions.split('\n').map((s) => s.trim()).filter(Boolean);
      for (const it of items) {
        doc.text(`•  ${it}`, termsX, ty2, { width: termsColW, lineGap: 1 });
        ty2 = doc.y + 1;
      }
    }

    // ── Stamp circle ───────────────────────────────────────────────────────
    if (L.showStamp !== false) {
      const cx = stampX + 50;
      const cy = footerTop + 50;
      const r = 44;
      doc.lineWidth(1.2).strokeColor(accent);
      doc.circle(cx, cy, r).stroke();
      doc.circle(cx, cy, r - 4).stroke();
      doc.fontSize(7).fillColor(accent).font('Helvetica-Bold')
        .text((input.business.name || 'BRAND').toUpperCase(), cx - r + 4, cy - 14, { width: (r - 4) * 2, align: 'center', characterSpacing: 1 });
      doc.fontSize(11).fillColor(accent).font('Helvetica-Bold')
        .text('SINCE', cx - r + 4, cy - 5, { width: (r - 4) * 2, align: 'center', characterSpacing: 1 });
      // Year extracted from established line, defaults to 1972.
      const yearMatch = (L.brandEstablishedLine ?? '').match(/\d{4}/);
      doc.fontSize(14).font('Helvetica-Bold').text(yearMatch?.[0] ?? '1972', cx - r + 4, cy + 6, { width: (r - 4) * 2, align: 'center', characterSpacing: 2 });
    }

    // ── 7. Footer ribbon + contact bar ──────────────────────────────────
    const ribbonY = doc.page.height - 86;
    const contactY = doc.page.height - 56;

    // Contact bar (slightly above the ribbon)
    doc.font('Helvetica').fontSize(9).fillColor(PALETTE.inkSoft);
    const contactBits = [
      L.contactWebsite ? L.contactWebsite : null,
      input.business.email,
      L.contactPhone || input.business.phone,
      L.contactAddressLine || input.business.address,
    ].filter(Boolean) as string[];
    doc.text(contactBits.join('   •   '), M, contactY, { width: CONTENT_W, align: 'center' });

    // Ribbon (full-width strip just above the page bottom).
    doc.rect(0, ribbonY, doc.page.width, 22).fill(PALETTE.band);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(accent)
      .text(L.footerRibbon ?? '', 0, ribbonY + 6, { width: doc.page.width, align: 'center', characterSpacing: 4 });

    doc.end();
  });
}
