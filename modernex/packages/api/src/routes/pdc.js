import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error.js';
import { nextPdcId } from '../services/idGenerator.js';

export const pdcRouter = Router();
pdcRouter.use(authenticate);

// ─── GET /pdc ────────────────────────────────────────────────────────────────
pdcRouter.get('/', requireRole('admin', 'accounts', 'sales'), (req, res) => {
  const { type, status, customer_id, vendor_id, from, to } = req.query;
  const db = getDb();
  let sql = `
    SELECT p.*,
           c.name AS customer_name,
           v.name AS vendor_name
    FROM post_dated_cheques p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN vendors v   ON v.id = p.vendor_id
    WHERE 1=1
  `;
  const params = [];
  if (type)        { sql += ' AND p.type = ?';        params.push(type); }
  if (status)      { sql += ' AND p.status = ?';      params.push(status); }
  if (customer_id) { sql += ' AND p.customer_id = ?'; params.push(customer_id); }
  if (vendor_id)   { sql += ' AND p.vendor_id = ?';   params.push(vendor_id); }
  if (from)        { sql += ' AND p.cheque_date >= ?'; params.push(from); }
  if (to)          { sql += ' AND p.cheque_date <= ?'; params.push(to); }
  sql += ' ORDER BY p.cheque_date ASC, p.id ASC';
  res.json({ pdcs: db.prepare(sql).all(...params) });
});

// ─── GET /pdc/due-today ── cheques due within next 3 days (deposit reminder)
pdcRouter.get('/due-today', requireRole('admin', 'accounts', 'sales'), (req, res) => {
  const db = getDb();
  const cheques = db.prepare(`
    SELECT p.*, c.name AS customer_name, v.name AS vendor_name
    FROM post_dated_cheques p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN vendors v   ON v.id = p.vendor_id
    WHERE p.status = 'pending'
      AND p.cheque_date <= date('now', '+3 days')
    ORDER BY p.cheque_date ASC
  `).all();
  res.json({ due: cheques });
});

// ─── POST /pdc ───────────────────────────────────────────────────────────────
pdcRouter.post('/', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { type, cheque_no, bank_name, branch, amount_paise, cheque_date,
            customer_id, vendor_id, invoice_id, po_id, notes } = req.body;
    if (!type || !cheque_no || !bank_name || !amount_paise || !cheque_date)
      return res.status(400).json({ error: 'type, cheque_no, bank_name, amount_paise, cheque_date required' });
    if (type === 'received' && !customer_id)
      return res.status(400).json({ error: 'customer_id required for received cheques' });
    if (type === 'issued' && !vendor_id)
      return res.status(400).json({ error: 'vendor_id required for issued cheques' });

    const id = nextPdcId();
    db.prepare(`
      INSERT INTO post_dated_cheques
        (id, type, cheque_no, bank_name, branch, amount_paise, cheque_date,
         customer_id, vendor_id, invoice_id, po_id, notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, type, cheque_no, bank_name, branch || null, amount_paise, cheque_date,
           customer_id || null, vendor_id || null, invoice_id || null, po_id || null,
           notes || null, req.user.username);

    res.status(201).json({ pdc: db.prepare('SELECT * FROM post_dated_cheques WHERE id = ?').get(id) });
  } catch (err) { next(err); }
});

// ─── PATCH /pdc/:id/status ── transition: pending → deposited → cleared/returned
pdcRouter.patch('/:id/status', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const pdc = db.prepare('SELECT * FROM post_dated_cheques WHERE id = ?').get(req.params.id);
    if (!pdc) throw new NotFoundError('PDC not found');

    const { status, deposited_date, cleared_date, returned_reason } = req.body;
    const allowed = ['deposited', 'cleared', 'returned', 'cancelled'];
    if (!allowed.includes(status))
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

    db.prepare(`
      UPDATE post_dated_cheques
      SET status = ?, deposited_date = ?, cleared_date = ?, returned_reason = ?
      WHERE id = ?
    `).run(status, deposited_date || pdc.deposited_date, cleared_date || pdc.cleared_date,
           returned_reason || pdc.returned_reason, req.params.id);

    res.json({ pdc: db.prepare('SELECT * FROM post_dated_cheques WHERE id = ?').get(req.params.id) });
  } catch (err) { next(err); }
});
