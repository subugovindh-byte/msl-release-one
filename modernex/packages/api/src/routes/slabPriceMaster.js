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
      `SELECT * FROM slab_price_master ORDER BY kind, variety, grade, thickness_mm`
    ).all();
    res.json({ prices: rows });
  } catch (err) { next(err); }
});

const FINISHED_KINDS = ['slab', 'cts', 'tile', 'monument', 'kerb', 'cobble', 'strip'];

// PUT /slab-price-master — upsert a kind+variety+grade+thickness price
slabPriceMasterRouter.put('/',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const { kind = 'slab', variety, grade, thickness_mm, rate_paise, notes } = req.body;
      if (!variety || !grade) {
        return res.status(400).json({ error: 'variety and grade are required' });
      }
      if (!['A+', 'A', 'B'].includes(grade)) {
        return res.status(400).json({ error: 'grade must be A+, A, or B' });
      }
      if (!FINISHED_KINDS.includes(kind)) {
        return res.status(400).json({ error: `kind must be one of ${FINISHED_KINDS.join(', ')}` });
      }
      const thickness = Number.isFinite(+thickness_mm) ? Math.round(+thickness_mm) : 0;
      db.prepare(`
        INSERT INTO slab_price_master (kind, variety, grade, thickness_mm, rate_paise, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(kind, variety, grade, thickness_mm) DO UPDATE SET
          rate_paise = excluded.rate_paise,
          notes = excluded.notes,
          updated_at = datetime('now')
      `).run(kind, variety, grade, thickness, rate_paise || 0, notes || null);
      const row = db.prepare(
        `SELECT * FROM slab_price_master WHERE kind = ? AND variety = ? AND grade = ? AND thickness_mm = ?`
      ).get(kind, variety, grade, thickness);
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
