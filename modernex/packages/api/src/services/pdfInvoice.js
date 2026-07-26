import PDFDocument from 'pdfkit';
import { config } from '../config.js';
import { CGST_RATE_LABEL, formatINR, fromPaise, HSN_CODE, IGST_RATE_LABEL, SGST_RATE_LABEL } from '@modernex/shared';
import { logger } from '../utils/logger.js';
import { getDb } from '../db/connection.js';
import { upiQRDataURL, signedIRNQRDataURL, buildUPIUri } from './qr.js';

/**
 * Stream a GST-compliant invoice PDF to a writable target (HTTP response or file).
 * Layout: A4 portrait · single page · 40pt margins · prints on a thermal printer too.
 *
 * Async because it pre-renders UPI and IRN QR codes inline.
 *
 * @param {object} invoice   Invoice row + items joined
 * @param {object} customer  Customer row (name, gstin, state, address)
 * @param {WritableStream} target  res or fs.createWriteStream
 */
export async function streamInvoicePDF(invoice, customer, target) {
  // ─── RESOLVE COLLECTION ACCOUNT (for UPI details) ───
  const db = getDb();
  let collectionAccount = null;
  if (invoice.collection_account_id) {
    collectionAccount = db.prepare(
      'SELECT * FROM collection_accounts WHERE id = ?'
    ).get(invoice.collection_account_id);
  }
  if (!collectionAccount) {
    collectionAccount = db.prepare(
      'SELECT * FROM collection_accounts WHERE is_default = 1 AND active = 1'
    ).get();
  }

  const upiId = collectionAccount?.upi_id || config.company.upi;
  const upiName = collectionAccount?.upi_name || config.company.name;

  // ─── PRE-RENDER QR CODES ───
  let upiQRData = null;
  let irnQRData = null;
  try {
    if (upiId) {
      upiQRData = await upiQRDataURL({
        upiId, payeeName: upiName,
        amountPaise: invoice.total_paise,
        invoiceId: invoice.id,
        note: `${upiName} · ${invoice.id}`,
      }, { width: 200 });
    }
    if (invoice.signed_qr_payload || invoice.irn) {
      irnQRData = await signedIRNQRDataURL(
        invoice.signed_qr_payload || invoice.irn,
        { width: 200 }
      );
    }
  } catch (err) {
    logger.warn({ err: err.message, invoice: invoice.id }, 'QR render failed, continuing without QR');
  }

  const doc = new PDFDocument({
    size: 'A4', margin: 40, bufferPages: true,
    info: {
      Title: `Invoice ${invoice.id}`,
      Author: config.company.name,
      Subject: 'Tax Invoice',
      Keywords: `GST,Invoice,${invoice.id}`,
    },
  });
  doc.pipe(target);

  const RUST = '#d4522a';
  const GOLD = '#c8993e';
  const GREY = '#555555';
  const DARK = '#1a1612';
  const LINE = '#dddddd';

  // ─── HEADER ───
  doc.fillColor(RUST).fontSize(22).font('Helvetica-Bold')
    .text(config.company.name, 40, 40);
  doc.fillColor(GREY).fontSize(8).font('Helvetica')
    .text(config.company.address, 40, 68, { width: 300 })
    .text(`GSTIN: ${config.company.gstin}   ·   HSN ${config.company.hsn}   ·   State: ${config.company.state}`, 40, 84);

  // Invoice block (right)
  doc.fillColor(DARK).fontSize(20).font('Helvetica-Bold')
    .text('TAX INVOICE', 350, 40, { width: 205, align: 'right' });
  // Indian standard day-first date (DD/MM/YY)
  const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
  doc.fontSize(9).font('Helvetica')
    .fillColor(GREY).text('Invoice No.', 350, 70, { width: 90, align: 'right' })
    .fillColor(DARK).text(invoice.id, 450, 70, { width: 105, align: 'right' })
    .fillColor(GREY).text('Date', 350, 84, { width: 90, align: 'right' })
    .fillColor(DARK).text(fmtDate(invoice.date), 450, 84, { width: 105, align: 'right' })
    .fillColor(GREY).text('Due Date', 350, 98, { width: 90, align: 'right' })
    .fillColor(DARK).text(fmtDate(invoice.due_date), 450, 98, { width: 105, align: 'right' });

  // Divider
  doc.moveTo(40, 120).lineTo(555, 120).strokeColor(LINE).lineWidth(1).stroke();

  // ─── BILL TO ───
  let y = 135;
  doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
    .text('BILL TO', 40, y, { characterSpacing: 1.5 });
  y += 15;
  doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold')
    .text(customer.name || invoice.customer_name, 40, y);
  y += 16;
  if (customer.gstin || invoice.customer_gstin) {
    doc.fillColor(GREY).fontSize(9).font('Helvetica')
      .text(`GSTIN: ${customer.gstin || invoice.customer_gstin}`, 40, y);
    y += 12;
  }
  if (customer.address) {
    doc.text(customer.address, 40, y, { width: 300 });
    y += 24;
  }
  doc.text(`State: ${customer.state || invoice.customer_state}`, 40, y);

  // e-Invoice block (right)
  if (invoice.irn) {
    doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
      .text('e-INVOICE (IRN)', 350, 135, { characterSpacing: 1.5 });
    doc.fillColor(DARK).fontSize(7).font('Courier')
      .text(invoice.irn, 350, 150, { width: 205 });
  }
  if (invoice.eway_bill) {
    doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
      .text('e-WAY BILL', 350, 175, { characterSpacing: 1.5 });
    doc.fillColor(DARK).fontSize(9).font('Courier')
      .text(invoice.eway_bill, 350, 187);
  }

  // ─── ITEMS TABLE ───
  const tableY = 230;
  doc.moveTo(40, tableY - 5).lineTo(555, tableY - 5).stroke();
  doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
    .text('DESCRIPTION', 45, tableY, { characterSpacing: 1 })
    .text('HSN', 250, tableY, { characterSpacing: 1 })
    .text('QTY', 290, tableY, { characterSpacing: 1, width: 40, align: 'right' })
    .text('SQFT', 340, tableY, { characterSpacing: 1, width: 50, align: 'right' })
    .text('RATE', 400, tableY, { characterSpacing: 1, width: 60, align: 'right' })
    .text('AMOUNT', 470, tableY, { characterSpacing: 1, width: 85, align: 'right' });
  doc.moveTo(40, tableY + 12).lineTo(555, tableY + 12).stroke();

  let rowY = tableY + 20;
  const items = invoice.items || [];
  items.forEach(item => {
    doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text(item.variety, 45, rowY);
    doc.fillColor(GREY).fontSize(8).font('Helvetica')
      .text(`${item.slab_id || ''} · ${item.size || ''}mm · ${item.thickness_mm || ''}mm · Gr.${item.grade || ''}`, 45, rowY + 12);
    doc.fillColor(DARK).fontSize(9).font('Helvetica')
      .text(HSN_CODE, 250, rowY)
      .text(String(item.qty), 290, rowY, { width: 40, align: 'right' })
      .text((item.sqft * item.qty).toFixed(2), 340, rowY, { width: 50, align: 'right' })
      .text(fromPaise(item.rate_paise).toFixed(2), 400, rowY, { width: 60, align: 'right' })
      .text(fromPaise(item.line_total_paise).toFixed(2), 470, rowY, { width: 85, align: 'right' });
    rowY += 30;
  });

  // Table footer line
  doc.moveTo(40, rowY).lineTo(555, rowY).stroke();
  rowY += 10;

  // ─── TOTALS ───
  const totY = rowY;
  const totLeft = 370, totRight = 555, valW = 90;
  const totalsRow = (label, value, bold = false) => {
    doc.fillColor(bold ? DARK : GREY).fontSize(bold ? 11 : 10)
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(label, totLeft, rowY, { width: totRight - totLeft - valW - 10, align: 'right' });
    doc.fillColor(DARK).fontSize(bold ? 11 : 10)
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(value, totRight - valW, rowY, { width: valW, align: 'right' });
    rowY += bold ? 18 : 14;
  };

  totalsRow('Subtotal', formatINR(invoice.gross_paise).replace('₹\u202f', '₹ '));
  if (invoice.discount_paise > 0) {
    totalsRow(`Discount (${invoice.discount_pct}%)`,
      '− ' + formatINR(invoice.discount_paise).replace('₹\u202f', '₹ '));
  }
  totalsRow('Taxable Value', formatINR(invoice.taxable_paise).replace('₹\u202f', '₹ '));
  if (invoice.igst_paise > 0) {
    totalsRow(`IGST @ ${IGST_RATE_LABEL}%`, formatINR(invoice.igst_paise).replace('₹\u202f', '₹ '));
  } else {
    totalsRow(`CGST @ ${CGST_RATE_LABEL}%`, formatINR(invoice.cgst_paise).replace('₹\u202f', '₹ '));
    totalsRow(`SGST @ ${SGST_RATE_LABEL}%`, formatINR(invoice.sgst_paise).replace('₹\u202f', '₹ '));
  }
  doc.moveTo(totLeft, rowY).lineTo(totRight, rowY).strokeColor(RUST).lineWidth(1.5).stroke();
  rowY += 8;
  totalsRow('GRAND TOTAL', formatINR(invoice.total_paise).replace('₹\u202f', '₹ '), true);

  // ─── PAYMENT BLOCK (UPI QR + bank details + IRN QR) ───
  rowY += 14;

  // Left: UPI QR + VPA
  if (upiQRData) {
    doc.strokeColor(LINE).lineWidth(1).rect(40, rowY, 250, 100).stroke();
    doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
      .text('SCAN TO PAY VIA UPI', 50, rowY + 8, { characterSpacing: 1.5 });
    // QR on left side of box
    try {
      doc.image(upiQRData, 50, rowY + 22, { width: 70, height: 70 });
    } catch (err) { logger.warn({ err: err.message }, 'UPI QR embed failed'); }
    // UPI details on right side of box
    doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold')
      .text(upiId || '—', 130, rowY + 24, { width: 155 });
    doc.fillColor(GREY).fontSize(8).font('Helvetica')
      .text(`Amount: ${formatINR(invoice.total_paise).replace('₹\u202f', '₹ ')}`, 130, rowY + 42, { width: 155 })
      .text(`Reference: ${invoice.id}`, 130, rowY + 55, { width: 155 })
      .text(`Payee: ${upiName || '—'}`, 130, rowY + 68, { width: 155 });
  } else if (upiId) {
    // Fallback no-QR block
    doc.strokeColor(LINE).lineWidth(1).rect(40, rowY, 250, 70).stroke();
    doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
      .text('PAY VIA UPI', 50, rowY + 8, { characterSpacing: 1.5 });
    doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
      .text(upiId, 50, rowY + 22);
    doc.fillColor(GREY).fontSize(9).font('Helvetica')
      .text(`Amount: ${formatINR(invoice.total_paise).replace('₹\u202f', '₹ ')}`, 50, rowY + 40)
      .text(`Reference: ${invoice.id}`, 50, rowY + 54);
  }

  // Right: IRN signed QR (if present) OR bank transfer details
  if (irnQRData) {
    doc.strokeColor(LINE).lineWidth(1).rect(305, rowY, 250, 100).stroke();
    doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
      .text('e-INVOICE QR (IRP SIGNED)', 315, rowY + 8, { characterSpacing: 1.5 });
    try {
      doc.image(irnQRData, 315, rowY + 22, { width: 70, height: 70 });
    } catch (err) { logger.warn({ err: err.message }, 'IRN QR embed failed'); }
    doc.fillColor(GREY).fontSize(7).font('Helvetica')
      .text('Scan to verify via IRP', 395, rowY + 24, { width: 155 });
    if (invoice.eway_bill) {
      doc.fontSize(8).fillColor(DARK).font('Helvetica-Bold')
        .text('e-Way Bill', 395, rowY + 48, { width: 155 });
      doc.font('Courier').fontSize(8).fillColor(GREY)
        .text(invoice.eway_bill, 395, rowY + 60, { width: 155 });
    }
  } else if (collectionAccount && (collectionAccount.kind === 'bank' || collectionAccount.kind === 'both') && collectionAccount.account_number) {
    doc.strokeColor(LINE).lineWidth(1).rect(305, rowY, 250, 100).stroke();
    doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
      .text('BANK TRANSFER', 315, rowY + 8, { characterSpacing: 1.5 });
    doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold')
      .text(collectionAccount.bank_name || '—', 315, rowY + 24);
    doc.fillColor(GREY).fontSize(8).font('Helvetica')
      .text(`A/C: ${collectionAccount.account_number}`, 315, rowY + 40)
      .text(`IFSC: ${collectionAccount.ifsc}`, 315, rowY + 53)
      .text(`Name: ${collectionAccount.account_holder || upiName}`, 315, rowY + 66)
      .text(`Branch: ${collectionAccount.branch || '—'}`, 315, rowY + 79);
  }

  // If both QR+bank would be useful, stack bank details below on a new row
  if (irnQRData && collectionAccount && (collectionAccount.kind === 'bank' || collectionAccount.kind === 'both') && collectionAccount.account_number) {
    const bankY = rowY + 110;
    doc.strokeColor(LINE).lineWidth(1).rect(40, bankY, 515, 42).stroke();
    doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
      .text('BANK TRANSFER', 50, bankY + 6, { characterSpacing: 1.5 });
    doc.fillColor(GREY).fontSize(8).font('Helvetica')
      .text(`${collectionAccount.bank_name || '—'} · A/C ${collectionAccount.account_number} · IFSC ${collectionAccount.ifsc} · ${collectionAccount.account_holder || upiName} · ${collectionAccount.branch || ''}`,
            50, bankY + 20, { width: 500 });
  }

  // ─── FOOTER ───
  doc.fillColor(GREY).fontSize(7).font('Helvetica-Oblique')
    .text(
      'Computer-generated invoice under GST Act 2017 · Krishnagiri jurisdiction · ' +
      'E. & O. E. · Subject to recipient acceptance on delivery.',
      40, 780, { width: 515, align: 'center' }
    );

  doc.end();
  logger.info({ invoice: invoice.id }, 'Invoice PDF streamed');
}
