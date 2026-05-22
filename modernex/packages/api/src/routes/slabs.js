import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';

/**
 * Backward-compatibility shim. /api/slabs continues to work but delegates to
 * the new `products` table (kind='slab'). Will be removed in v6.
 */
export const slabsRouter = Router();
slabsRouter.use(authenticate);

function toLegacy(db, p) {
  const dims = db.prepare(
    'SELECT size_lw, thickness_mm, sqft FROM product_slabs WHERE product_id = ?'
  ).get(p.id) || {};
  return {
    id: p.id,
    lot_id: p.lot_id,
    variety: p.variety,
    size: dims.size_lw,
    thickness_mm: dims.thickness_mm,
    grade: p.grade,
    sqft: dims.sqft,
    rate_paise: p.rate_paise,
    stock: p.stock,
    photo_url: p.photo_url,
    photo_uploaded_at: p.photo_uploaded_at,
    photo_uploaded_by: p.photo_uploaded_by,
    photo_size_bytes: p.photo_size_bytes,
    effective_photo_url: p.effective_photo_url,
    photo_source: p.photo_source,
  };
}

slabsRouter.get('/', (req, res) => {
  const { q, variety, grade, lot, minStock } = req.query;
  const db = getDb();
  let sql = `
    SELECT p.*,
           COALESCE(p.photo_url, vp.photo_url) AS effective_photo_url,
           CASE WHEN p.photo_url IS NOT NULL THEN 'custom'
                WHEN vp.photo_url IS NOT NULL THEN 'variety'
                ELSE NULL END AS photo_source
    FROM products p
    LEFT JOIN variety_photos vp ON vp.variety = p.variety
    WHERE p.kind = 'slab' AND p.active = 1`;
  const params = [];
  if (q) { sql += ' AND (p.variety LIKE ? OR p.id LIKE ? OR p.lot_id LIKE ?)';
    const pat = `%${q}%`; params.push(pat, pat, pat); }
  if (variety && variety !== 'All') { sql += ' AND p.variety = ?'; params.push(variety); }
  if (grade && grade !== 'All')     { sql += ' AND p.grade = ?';   params.push(grade); }
  if (lot)                          { sql += ' AND p.lot_id = ?';  params.push(lot); }
  if (minStock !== undefined)       { sql += ' AND p.stock >= ?';  params.push(Number(minStock)); }
  sql += ' ORDER BY p.variety, p.grade DESC';

  const rows = db.prepare(sql).all(...params);
  res.json({ slabs: rows.map(r => toLegacy(db, r)) });
});

slabsRouter.get('/stats/summary', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*)         AS varieties_count,
      SUM(p.stock)     AS total_pieces,
      SUM(COALESCE(s.sqft, 0) * p.stock) AS total_sqft,
      SUM(p.rate_paise * COALESCE(s.sqft, 0) * p.stock) AS value_paise,
      SUM(CASE WHEN p.stock <= 2 THEN 1 ELSE 0 END) AS low_stock_count
    FROM products p
    LEFT JOIN product_slabs s ON s.product_id = p.id
    WHERE p.kind = 'slab' AND p.active = 1
  `).get();
  res.json({ summary: row });
});

slabsRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const p = db.prepare(`
      SELECT p.*,
             COALESCE(p.photo_url, vp.photo_url) AS effective_photo_url
      FROM products p
      LEFT JOIN variety_photos vp ON vp.variety = p.variety
      WHERE p.id = ? AND p.kind = 'slab'
    `).get(req.params.id);
    if (!p) throw new NotFoundError('Slab not found');
    res.json({ slab: toLegacy(db, p) });
  } catch (err) { next(err); }
});

slabsRouter.patch('/:id', requireRole('admin', 'yard'), (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare(
      `SELECT * FROM products WHERE id = ? AND kind = 'slab'`
    ).get(req.params.id);
    if (!existing) throw new NotFoundError('Slab not found');

    const updates = [];
    const params = [];
    if (req.body.rate_paise !== undefined) { updates.push('rate_paise = ?'); params.push(req.body.rate_paise); }
    if (req.body.stock !== undefined)      { updates.push('stock = ?');      params.push(req.body.stock); }
    if (req.body.grade !== undefined)      { updates.push('grade = ?');      params.push(req.body.grade); }
    if (updates.length === 0) return res.json({ slab: { id: req.params.id } });

    updates.push('updated_by = ?', 'updated_at = datetime(\'now\')');
    params.push(req.user.username, req.params.id);
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    audit(req, 'SLAB_UPDATE_LEGACY', 'products', req.params.id, existing, req.body);
    const updated = db.prepare(`SELECT * FROM products WHERE id = ?`).get(req.params.id);
    res.json({ slab: toLegacy(db, updated) });
  } catch (err) { next(err); }
});
