import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { debitCreditNoteSchema } from '@modernex/shared';
import { NotFoundError, AppError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { nextDCNId } from '../services/idGenerator.js';

export const dcnRouter = Router();
dcnRouter.use(authenticate);

// ─── GET /dcn ───
dcnRouter.get('/', requireRole('admin', 'accounts', 'sales'), (req, res) => {
  const { type, customer_id, from, to } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM debit_credit_notes WHERE 1=1';
  const params = [];
  if (type)        { sql += ' AND type = ?';        params.push(type); }
  if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
  if (from)        { sql += ' AND date >= ?';        params.push(from); }
  if (to)          { sql += ' AND date <= ?';        params.push(to); }
  sql += ' ORDER BY date DESC, id DESC';
  res.json({ notes: db.prepare(sql).all(...params) });
});

// ─── GET /dcn/:id ───
dcnRouter.get('/:id', requireRole('admin', 'accounts', 'sales'), (req, res, next) => {
  try {
    const note = getDb().prepare('SELECT * FROM debit_credit_notes WHERE id = ?').get(req.params.id);
    if (!note) throw new NotFoundError('Note not found');
    res.json({ note });
  } catch (err) { next(err); }
});

// ─── POST /dcn ───
dcnRouter.post('/',
  requireRole('admin', 'accounts'),
  validate(debitCreditNoteSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const n = req.body;
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(n.customer_id);
      if (!customer) throw new NotFoundError('Customer not found');

      const id = nextDCNId(n.type);
      const total = n.taxable_paise + n.cgst_paise + n.sgst_paise + n.igst_paise;
      const date = n.date || new Date().toISOString().slice(0, 10);

      db.prepare(`
        INSERT INTO debit_credit_notes
          (id, type, ref_invoice_id, customer_id, customer_name, customer_gstin,
           customer_state, date, reason, taxable_paise, cgst_paise, sgst_paise,
           igst_paise, total_paise, notes, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
      `).run(id, n.type, n.ref_invoice_id || null, n.customer_id,
             customer.name, customer.gstin || null, customer.state,
             date, n.reason, n.taxable_paise, n.cgst_paise, n.sgst_paise,
             n.igst_paise, total, n.notes || null, req.user.username);

      const note = db.prepare('SELECT * FROM debit_credit_notes WHERE id = ?').get(id);
      audit(req, 'DCN_CREATE', 'debit_credit_notes', id, null, note);
      res.status(201).json({ note });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /dcn/:id/confirm ───
dcnRouter.patch('/:id/confirm',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM debit_credit_notes WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Note not found');
      if (existing.status !== 'draft') throw new AppError('Only draft notes can be confirmed', 400);
      db.prepare("UPDATE debit_credit_notes SET status='confirmed', updated_by=? WHERE id=?")
        .run(req.user.username, req.params.id);
      const updated = db.prepare('SELECT * FROM debit_credit_notes WHERE id = ?').get(req.params.id);
      audit(req, 'DCN_CONFIRM', 'debit_credit_notes', req.params.id, existing, updated);
      res.json({ note: updated });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /dcn/:id/cancel ───
dcnRouter.patch('/:id/cancel',
  requireRole('admin'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM debit_credit_notes WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Note not found');
      if (existing.status === 'cancelled') return res.json({ note: existing });
      db.prepare("UPDATE debit_credit_notes SET status='cancelled', updated_by=? WHERE id=?")
        .run(req.user.username, req.params.id);
      const updated = db.prepare('SELECT * FROM debit_credit_notes WHERE id = ?').get(req.params.id);
      audit(req, 'DCN_CANCEL', 'debit_credit_notes', req.params.id, existing, updated);
      res.json({ note: updated });
    } catch (err) { next(err); }
  }
);
