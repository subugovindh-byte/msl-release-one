import { getDb, closeDb } from '../db/connection.js';
import { calculateInvoice } from '@modernex/shared';
import { logger } from '../utils/logger.js';

function loadInvoiceItems(db, invoiceId) {
  return db.prepare(
    `SELECT rate_paise, uom_qty, qty, hsn FROM invoice_items WHERE invoice_id = ? ORDER BY line_no`
  ).all(invoiceId);
}

function main() {
  const db = getDb();
  const invoices = db.prepare(
    `SELECT id, customer_id, customer_state, discount_pct, total_paise, cgst_paise, sgst_paise, igst_paise, irn
     FROM invoices
     WHERE paid = 0
     ORDER BY date DESC, id DESC`
  ).all();

  let updatedCount = 0;
  let totalDelta = 0;

  const tx = db.transaction(() => {
    for (const invoice of invoices) {
      const items = loadInvoiceItems(db, invoice.id);
      if (!items.length) continue;

      const calc = calculateInvoice(items, invoice.customer_state, invoice.discount_pct || 0);
      const delta = calc.grandTotal - invoice.total_paise;

      const unchanged =
        calc.taxable === invoice.taxable_paise &&
        calc.cgst === invoice.cgst_paise &&
        calc.sgst === invoice.sgst_paise &&
        calc.igst === invoice.igst_paise &&
        delta === 0;

      if (unchanged) continue;

      db.prepare(
        `UPDATE invoices
         SET gross_paise = ?, discount_paise = ?, taxable_paise = ?,
             cgst_paise = ?, sgst_paise = ?, igst_paise = ?, total_paise = ?,
             updated_at = datetime('now'), updated_by = ?,
             irn = CASE WHEN ? != 0 THEN NULL ELSE irn END,
             eway_bill = CASE WHEN ? != 0 THEN NULL ELSE eway_bill END,
             signed_qr_payload = CASE WHEN ? != 0 THEN NULL ELSE signed_qr_payload END
         WHERE id = ?`
      ).run(
        calc.grossPaise,
        calc.discountPaise,
        calc.taxable,
        calc.cgst,
        calc.sgst,
        calc.igst,
        calc.grandTotal,
        'system-gst-recalc',
        delta,
        delta,
        delta,
        invoice.id,
      );

      db.prepare(
        `UPDATE customers
         SET outstanding_paise = outstanding_paise + ?,
             updated_at = datetime('now'), updated_by = ?
         WHERE id = ?`
      ).run(delta, 'system-gst-recalc', invoice.customer_id);

      db.prepare(
        `INSERT INTO audit_log (
          username, action, table_name, record_id, before_json, after_json, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'system-gst-recalc',
        'INVOICE_GST_RECALC',
        'invoices',
        invoice.id,
        JSON.stringify({
          total_paise: invoice.total_paise,
          cgst_paise: invoice.cgst_paise,
          sgst_paise: invoice.sgst_paise,
          igst_paise: invoice.igst_paise,
          irn: invoice.irn,
        }),
        JSON.stringify({
          total_paise: calc.grandTotal,
          cgst_paise: calc.cgst,
          sgst_paise: calc.sgst,
          igst_paise: calc.igst,
          irn_cleared: delta !== 0 && !!invoice.irn,
        }),
        'maintenance-script',
      );

      updatedCount += 1;
      totalDelta += delta;
    }
  });

  tx();

  logger.info({ updatedCount, totalDelta }, 'Unpaid invoice GST recalculation completed');
  console.log(JSON.stringify({ updatedCount, totalDelta }, null, 2));
}

try {
  main();
} finally {
  closeDb();
}