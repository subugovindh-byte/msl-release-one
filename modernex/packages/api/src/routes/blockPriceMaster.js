import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error.js';

export const blockPriceMasterRouter = Router();
blockPriceMasterRouter.use(authenticate);

// GET /block-price-master — returns all rows (variety+grade → rate)
blockPriceMasterRouter.get('/', (_req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM block_price_master ORDER BY variety, grade`
    ).all();
    res.json({ prices: rows });
  } catch (err) { next(err); }
});

// PUT /block-price-master — upsert a variety+grade price
blockPriceMasterRouter.put('/',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const { variety, grade, rate_per_cft_paise, notes } = req.body;
      if (!variety || !grade) {
        return res.status(400).json({ error: 'variety and grade are required' });
      }
      if (!['A+', 'A', 'B'].includes(grade)) {
        return res.status(400).json({ error: 'grade must be A+, A, or B' });
      }
      db.prepare(`
        INSERT INTO block_price_master (variety, grade, rate_per_cft_paise, notes, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(variety, grade) DO UPDATE SET
          rate_per_cft_paise = excluded.rate_per_cft_paise,
          notes = excluded.notes,
          updated_at = datetime('now')
      `).run(variety, grade, rate_per_cft_paise || 0, notes || null);
      const row = db.prepare(`SELECT * FROM block_price_master WHERE variety = ? AND grade = ?`).get(variety, grade);
      res.json({ price: row });
    } catch (err) { next(err); }
  }
);

// DELETE /block-price-master/:id
blockPriceMasterRouter.delete('/:id',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const row = db.prepare('SELECT id FROM block_price_master WHERE id = ?').get(req.params.id);
      if (!row) throw new NotFoundError('Price entry not found');
      db.prepare('DELETE FROM block_price_master WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);
