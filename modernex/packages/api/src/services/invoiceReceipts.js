import { AppError, NotFoundError } from '../middleware/error.js';

/** The invoice and what is still owed on it. */
export function invoiceWithBalance(db, invoiceId) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) throw new NotFoundError('Invoice not found');
  return { inv, balance: inv.total_paise - (inv.received_paise || 0) };
}

/** Refuses a receipt that is not positive or is more than the invoice's balance. */
export function checkReceipt(db, invoiceId, amountPaise) {
  const { inv, balance } = invoiceWithBalance(db, invoiceId);
  if (!(amountPaise > 0)) throw new AppError('Receipt amount must be positive', 400);
  if (amountPaise > balance) {
    throw new AppError(`Receipt ₹${(amountPaise / 100).toFixed(2)} is more than the balance ₹${(balance / 100).toFixed(2)} on ${inv.id}`, 400);
  }
  return inv;
}

/**
 * Re-derives received / paid / paid_date from the receipts on record. Call it in
 * the same transaction as any receipt insert or delete.
 */
export function settleInvoice(db, invoiceId) {
  const received = db.prepare(
    "SELECT COALESCE(SUM(amount_paise), 0) AS v, MAX(date) AS last FROM payments WHERE invoice_id = ? AND type = 'receipt'"
  ).get(invoiceId);
  db.prepare(`
    UPDATE invoices SET received_paise = ?,
           paid = CASE WHEN ? >= total_paise THEN 1 ELSE 0 END,
           paid_date = CASE WHEN ? >= total_paise THEN ? ELSE NULL END
     WHERE id = ?
  `).run(received.v, received.v, received.v, received.last, invoiceId);
}
