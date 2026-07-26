import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error.js';

export const slabPriceMasterRouter = Router();
slabPriceMasterRouter.use(authenticate);

// GET /slab-price-master — finished-goods selling prices (variety+grade+thickness → ₹/sqft)
slabPriceMasterRouter.get('/', (_req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM slab_price_master ORDER BY variety, grade, thickness_mm`
    ).all();
    res.json({ prices: rows });
  } catch (err) { next(err); }
});

// PUT /slab-price-master — upsert a variety+grade+thickness price
slabPriceMasterRouter.put('/',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const { variety, grade, thickness_mm, rate_per_sqft_paise, notes } = req.body;
      if (!variety || !grade) {
        return res.status(400).json({ error: 'variety and grade are required' });
      }
      if (!['A+', 'A', 'B'].includes(grade)) {
        return res.status(400).json({ error: 'grade must be A+, A, or B' });
      }
      const thickness = Number.isFinite(+thickness_mm) ? Math.round(+thickness_mm) : 0;
      db.prepare(`
        INSERT INTO slab_price_master (variety, grade, thickness_mm, rate_per_sqft_paise, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(variety, grade, thickness_mm) DO UPDATE SET
          rate_per_sqft_paise = excluded.rate_per_sqft_paise,
          notes = excluded.notes,
          updated_at = datetime('now')
      `).run(variety, grade, thickness, rate_per_sqft_paise || 0, notes || null);
      const row = db.prepare(
        `SELECT * FROM slab_price_master WHERE variety = ? AND grade = ? AND thickness_mm = ?`
      ).get(variety, grade, thickness);
      res.json({ price: row });
    } catch (err) { next(err); }
  }
);

// DELETE /slab-price-master/:id
slabPriceMasterRouter.delete('/:id',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const row = db.prepare('SELECT id FROM slab_price_master WHERE id = ?').get(req.params.id);
      if (!row) throw new NotFoundError('Price entry not found');
      db.prepare('DELETE FROM slab_price_master WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);
