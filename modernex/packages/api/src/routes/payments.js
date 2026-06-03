import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paymentCreateSchema } from '@modernex/shared';
import { NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { nextPaymentId } from '../services/idGenerator.js';

export const paymentsRouter = Router();

paymentsRouter.use(authenticate);

// Payment IDs are FY-format with slashes (PMT/2026/001). The frontend swaps
// / with ~ to survive Azure's IIS proxy; decode it back here.
paymentsRouter.param('id', (req, _res, next, id) => {
  req.params.id = id.replace(/~/g, '/');
  next();
});

paymentsRouter.get('/', requireRole('admin', 'accounts', 'sales'), (req, res) => {
  const { type, from, to } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM payments WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY date DESC, id DESC';
  res.json({ payments: db.prepare(sql).all(...params) });
});

paymentsRouter.post('/',
  requireRole('admin', 'accounts'),
  validate(paymentCreateSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const p = req.body;
      const id = nextPaymentId(p.type);

      // apply_advance_paise: amount of vendor advance to deduct (reduces
      // effective payment from cash; the advance covers the rest)
      const applyAdvance = Math.max(0, p.apply_advance_paise || 0);

      const tx = db.transaction(() => {
        // Deduct advance from vendor if requested; capture the actual amount used
        let advanceUsed = 0;
        if (applyAdvance > 0) {
          let vendorId = null;
          if (p.po_id) {
            const po = db.prepare('SELECT vendor_id FROM purchase_orders WHERE id = ?').get(p.po_id);
            vendorId = po?.vendor_id;
          } else if (p.cp_id) {
            const cp = db.prepare('SELECT vendor_id FROM consumable_purchases WHERE id = ?').get(p.cp_id);
            vendorId = cp?.vendor_id;
          }
          if (vendorId) {
            const vendor = db.prepare('SELECT advance_paise FROM vendors WHERE id = ?').get(vendorId);
            const available = vendor?.advance_paise ?? 0;
            advanceUsed = Math.min(applyAdvance, available);
            if (advanceUsed > 0) {
              db.prepare('UPDATE vendors SET advance_paise = advance_paise - ? WHERE id = ?')
                .run(advanceUsed, vendorId);
            }
          }
        }

        db.prepare(`
          INSERT INTO payments (id, date, type, invoice_id, po_id, cp_id, party, amount_paise, mode, utr, notes, advance_applied_paise, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, p.date || new Date().toISOString().slice(0, 10),
          p.type, p.invoice_id || null, p.po_id || null, p.cp_id || null,
          p.party, p.amount_paise, p.mode, p.utr || null,
          p.notes || null, advanceUsed, req.user.username
        );

        // Auto-update consumable purchase status based on running balance
        if (p.cp_id) {
          const cp = db.prepare('SELECT total_paise FROM consumable_purchases WHERE id = ?').get(p.cp_id);
          if (cp) {
            const paidRow = db.prepare(
              `SELECT COALESCE(SUM(amount_paise),0) AS v FROM payments WHERE cp_id = ? AND type = 'payment'`
            ).get(p.cp_id);
            const paid = paidRow.v;
            const newStatus = paid >= cp.total_paise ? 'paid' : 'partial';
            db.prepare(`UPDATE consumable_purchases SET status = ? WHERE id = ? AND status != 'cancelled'`)
              .run(newStatus, p.cp_id);
          }
        }
      });
      tx();

      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
      audit(req, 'PAYMENT_CREATE', 'payments', id, null, { ...payment, apply_advance_paise: applyAdvance });
      res.status(201).json({ payment });
    } catch (err) { next(err); }
  }
);

// ─── POST /payments/:id/reverse — reverse a payment and undo its side-effects ───
paymentsRouter.post('/:id/reverse',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
      if (!pay) throw new NotFoundError('Payment not found');

      db.transaction(() => {
        // 1. Invoice receipt → re-open the invoice and restore customer outstanding
        if (pay.invoice_id) {
          const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(pay.invoice_id);
          if (inv) {
            db.prepare("UPDATE invoices SET paid = 0, paid_date = NULL WHERE id = ?").run(pay.invoice_id);
            db.prepare('UPDATE customers SET outstanding_paise = outstanding_paise + ? WHERE id = ?')
              .run(pay.amount_paise, inv.customer_id);
          }
        }

        // 2. Restore any vendor advance that this payment consumed
        if (pay.advance_applied_paise > 0) {
          let vendorId = null;
          if (pay.po_id) vendorId = db.prepare('SELECT vendor_id FROM purchase_orders WHERE id = ?').get(pay.po_id)?.vendor_id;
          else if (pay.cp_id) vendorId = db.prepare('SELECT vendor_id FROM consumable_purchases WHERE id = ?').get(pay.cp_id)?.vendor_id;
          if (vendorId) {
            db.prepare('UPDATE vendors SET advance_paise = advance_paise + ? WHERE id = ?')
              .run(pay.advance_applied_paise, vendorId);
          }
        }

        // 3. Remove the payment row (PO balance is computed dynamically from SUM)
        db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);

        // 4. Recompute consumable-purchase status from remaining payments
        if (pay.cp_id) {
          const cp = db.prepare('SELECT total_paise FROM consumable_purchases WHERE id = ?').get(pay.cp_id);
          if (cp) {
            const paid = db.prepare(
              "SELECT COALESCE(SUM(amount_paise),0) AS v FROM payments WHERE cp_id = ? AND type = 'payment'"
            ).get(pay.cp_id).v;
            const st = paid <= 0 ? 'pending' : paid >= cp.total_paise ? 'paid' : 'partial';
            db.prepare("UPDATE consumable_purchases SET status = ? WHERE id = ? AND status != 'cancelled'")
              .run(st, pay.cp_id);
          }
        }
      })();

      audit(req, 'PAYMENT_REVERSE', 'payments', req.params.id, pay, null);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);
