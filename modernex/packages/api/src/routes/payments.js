import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paymentCreateSchema } from '@modernex/shared';
import { audit } from '../services/audit.js';
import { nextPaymentId } from '../services/idGenerator.js';

export const paymentsRouter = Router();

paymentsRouter.use(authenticate);

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

      db.prepare(`
        INSERT INTO payments (id, date, type, invoice_id, po_id, cp_id, party, amount_paise, mode, utr, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, p.date || new Date().toISOString().slice(0, 10),
        p.type, p.invoice_id || null, p.po_id || null, p.cp_id || null,
        p.party, p.amount_paise, p.mode, p.utr || null,
        p.notes || null, req.user.username
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

      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
      audit(req, 'PAYMENT_CREATE', 'payments', id, null, payment);
      res.status(201).json({ payment });
    } catch (err) { next(err); }
  }
);
