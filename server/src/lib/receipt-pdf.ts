// server/src/lib/receipt-pdf.ts — A4 sale receipt PDF for POS bills and
// storefront orders. Streams a single-page PDF the cashier can print on
// any A4 printer, or share via WhatsApp / email.
//
// Why server-side? Two reasons:
//   1. Identical output for in-store bills (POS) and online orders
//      (storefront) — both call the same render function.
//   2. The receipt is the legal tax invoice in India; rendering it
//      server-side keeps the layout / GST math out of reach of the
//      client. The browser only ever sees the rendered bytes.
//
// pdfkit is a Node-only library with no native deps — safe on Render's
// free tier and inside the BullMQ worker. Bytes are streamed to the
// response, so memory use is bounded regardless of bill size.

import PDFDocument from 'pdfkit';

export interface ReceiptLine {
  description: string;
  details?: string; // e.g. "22K · 10.45 g · making 12%"
  qty: number;
  unitPaise: number;
  amountPaise: number;
}

export interface ReceiptInput {
  business: {
    name: string;
    address: string;
    gstin: string | null;
    phone: string;
    logoUrl?: string | null; // currently unused; future enhancement
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
  };
  lines: ReceiptLine[];
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  discountPaise: number;
  totalPaise: number;
  payments: Array<{ mode: string; amountPaise: number; referenceId?: string | null }>;
  /** Optional footer note — usually the BIS hallmark guarantee + return policy. */
  footerNote?: string;
}

const rupees = (paise: number): string => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ind = (date: Date): string => date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

/**
 * Streams an A4 receipt PDF to the provided writable. Returns when the
 * PDF is fully written. Caller is responsible for `Content-Type` and
 * `Content-Disposition` headers.
 */
export function renderReceiptPdf(input: ReceiptInput, out: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${input.invoice.number}` } });
    doc.on('end', resolve);
    doc.on('error', reject);
    doc.pipe(out);

    // Header — business name + GSTIN + contact strip.
    doc.font('Helvetica-Bold').fontSize(18).text(input.business.name, { align: 'left' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(input.business.address)
      .text(`Phone: ${input.business.phone}${input.business.gstin ? `   GSTIN: ${input.business.gstin}` : ''}`);

    doc.moveTo(40, doc.y + 6).lineTo(555, doc.y + 6).strokeColor('#bbb').stroke();
    doc.moveDown(0.8);

    // Invoice meta — two-column block.
    const metaTop = doc.y;
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(12).text('Tax Invoice', 40, metaTop);
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`Invoice No: ${input.invoice.number}`, 40, metaTop + 18)
      .text(`Date: ${ind(new Date(input.invoice.dateIso))}`, 40, metaTop + 32)
      .text(`Place of Supply: ${input.invoice.placeOfSupply}`, 40, metaTop + 46);

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Bill to', 360, metaTop);
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(input.customer.name, 360, metaTop + 18)
      .text(input.customer.phone, 360, metaTop + 32);
    if (input.customer.gstin) doc.text(`GSTIN: ${input.customer.gstin}`, 360, metaTop + 46);

    doc.y = metaTop + 70;
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#bbb').stroke();
    doc.moveDown(0.6);

    // Line items table.
    const colX = { desc: 40, qty: 330, unit: 380, amt: 480 };
    const tableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
      .text('Description', colX.desc, tableTop)
      .text('Qty', colX.qty, tableTop, { width: 40, align: 'right' })
      .text('Rate', colX.unit, tableTop, { width: 80, align: 'right' })
      .text('Amount', colX.amt, tableTop, { width: 75, align: 'right' });
    doc.moveTo(40, tableTop + 14).lineTo(555, tableTop + 14).strokeColor('#ddd').stroke();

    let y = tableTop + 22;
    doc.font('Helvetica').fontSize(9).fillColor('#000');
    for (const line of input.lines) {
      const startY = y;
      doc.text(line.description, colX.desc, y, { width: 270 });
      if (line.details) {
        y = doc.y + 1;
        doc.fontSize(8).fillColor('#777').text(line.details, colX.desc, y, { width: 270 });
        doc.fontSize(9).fillColor('#000');
      }
      doc.text(String(line.qty), colX.qty, startY, { width: 40, align: 'right' });
      doc.text(rupees(line.unitPaise), colX.unit, startY, { width: 80, align: 'right' });
      doc.text(rupees(line.amountPaise), colX.amt, startY, { width: 75, align: 'right' });
      y = Math.max(y, doc.y) + 6;
    }

    // Totals — right-aligned ladder.
    y += 6;
    doc.moveTo(330, y).lineTo(555, y).strokeColor('#ddd').stroke();
    y += 6;
    const totalRow = (label: string, value: string, bold?: boolean): void => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor('#000');
      doc.text(label, 360, y, { width: 110, align: 'right' });
      doc.text(value, 480, y, { width: 75, align: 'right' });
      y += bold ? 18 : 14;
    };
    totalRow('Subtotal', rupees(input.subtotalPaise));
    if (input.discountPaise > 0) totalRow('Discount', `− ${rupees(input.discountPaise)}`);
    if (input.cgstPaise > 0) totalRow('CGST 1.5%', rupees(input.cgstPaise));
    if (input.sgstPaise > 0) totalRow('SGST 1.5%', rupees(input.sgstPaise));
    if (input.igstPaise > 0) totalRow('IGST 3%', rupees(input.igstPaise));
    totalRow('Total', rupees(input.totalPaise), true);

    // Payments breakdown.
    if (input.payments.length > 0) {
      y += 6;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Payments', 40, y);
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#555');
      for (const p of input.payments) {
        const ref = p.referenceId ? ` · Ref ${p.referenceId}` : '';
        doc.text(`${p.mode}${ref}`, 40, y);
        doc.text(rupees(p.amountPaise), 480, y, { width: 75, align: 'right' });
        y += 12;
      }
    }

    // Footer — guarantees + branding.
    y = Math.max(y, 760);
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#ddd').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#777')
      .text(
        input.footerNote ?? 'Every gold piece is BIS hallmarked; weight is verified in front of the customer. Returns within 7 days with original tags & invoice.',
        40, y + 6, { width: 515, align: 'center' },
      );

    doc.end();
  });
}
