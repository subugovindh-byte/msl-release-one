import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { AppError, NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';

export const consumablesRouter = Router();
consumablesRouter.use(authenticate);

const ALLOWED = ['admin', 'accounts', 'yard', 'sales'];

// ─── ID generator ───
function nextId(db) {
  const year = new Date().getFullYear();
  const prefix = `CP-${year}-`;
  const row = db.prepare(
    `SELECT id FROM consumable_purchases WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${prefix}%`);
  const num = row ? parseInt(row.id.split('-')[2], 10) + 1 : 1;
  return `${prefix}${String(num).padStart(4, '0')}`;
}

// ─── GET /api/consumable-purchases ───
consumablesRouter.get('/', requireRole(...ALLOWED), (req, res, next) => {
  try {
    const db = getDb();
    const { status, category, from, to, search } = req.query;

    let sql = `SELECT * FROM consumable_purchases WHERE 1=1`;
    const params = [];

    if (status && status !== 'all') { sql += ` AND status = ?`; params.push(status); }
    if (category && category !== 'all') { sql += ` AND category = ?`; params.push(category); }
    if (from)   { sql += ` AND date >= ?`; params.push(from); }
    if (to)     { sql += ` AND date <= ?`; params.push(to); }
    if (search) {
      sql += ` AND (vendor_name LIKE ? OR id LIKE ? OR notes LIKE ?)`;
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    sql += ` ORDER BY date DESC, created_at DESC`;
    const rows = db.prepare(sql).all(...params);

    const purchases = rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
    res.json({ purchases });
  } catch (err) { next(err); }
});

// ─── POST /api/consumable-purchases ───
consumablesRouter.post('/', requireRole(...ALLOWED), (req, res, next) => {
  try {
    const { date, vendor_name, vendor_id, category, items, payment_mode, reference_no, notes } = req.body;
    if (!date || !vendor_name || !category) {
      throw new AppError('date, vendor_name and category are required', 400);
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('At least one line item required', 400);
    }

    const db = getDb();
    const id = nextId(db);
    const total_paise = items.reduce((s, it) => s + (it.amount_paise || 0), 0);

    db.prepare(`
      INSERT INTO consumable_purchases
        (id, date, vendor_id, vendor_name, category, items, total_paise,
         payment_mode, reference_no, notes, status, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?)
    `).run(
      id, date, vendor_id || null, vendor_name, category,
      JSON.stringify(items), total_paise,
      payment_mode || null, reference_no || null, notes || null,
      req.user.username
    );

    audit(req, 'CP_CREATE', 'consumable_purchases', id, null, { vendor_name, category, total_paise });
    const created = db.prepare('SELECT * FROM consumable_purchases WHERE id = ?').get(id);
    res.status(201).json({ purchase: { ...created, items: JSON.parse(created.items) } });
  } catch (err) { next(err); }
});

// ─── PATCH /api/consumable-purchases/:id ───
consumablesRouter.patch('/:id', requireRole(...ALLOWED), (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM consumable_purchases WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('Purchase not found');
    if (existing.status === 'cancelled') throw new AppError('Cannot edit a cancelled purchase', 400);

    const { date, vendor_name, vendor_id, category, items, payment_mode, reference_no, notes, status } = req.body;

    const newItems = items ?? JSON.parse(existing.items);
    const total_paise = newItems.reduce((s, it) => s + (it.amount_paise || 0), 0);

    db.prepare(`
      UPDATE consumable_purchases SET
        date = COALESCE(?, date),
        vendor_name = COALESCE(?, vendor_name),
        vendor_id = ?,
        category = COALESCE(?, category),
        items = ?,
        total_paise = ?,
        payment_mode = ?,
        reference_no = ?,
        notes = ?,
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      date || null, vendor_name || null,
      vendor_id !== undefined ? vendor_id : existing.vendor_id,
      category || null,
      JSON.stringify(newItems), total_paise,
      payment_mode !== undefined ? payment_mode : existing.payment_mode,
      reference_no !== undefined ? reference_no : existing.reference_no,
      notes !== undefined ? notes : existing.notes,
      status || null,
      req.params.id
    );

    audit(req, 'CP_UPDATE', 'consumable_purchases', req.params.id, existing, req.body);
    const updated = db.prepare('SELECT * FROM consumable_purchases WHERE id = ?').get(req.params.id);
    res.json({ purchase: { ...updated, items: JSON.parse(updated.items) } });
  } catch (err) { next(err); }
});

// ─── DELETE /api/consumable-purchases/:id ───
consumablesRouter.delete('/:id', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM consumable_purchases WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('Purchase not found');

    db.prepare(`UPDATE consumable_purchases SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
    audit(req, 'CP_CANCEL', 'consumable_purchases', req.params.id, existing, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
