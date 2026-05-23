// ───────────────────────────────────────────────────────────────────
// /api/variety-defaults — GET dict of {variety: {photo_url, region, ...}}
// Used by the frontend Inventory/POS/Products pages to render
// per-variety reference photos when products lack custom uploads.
//
// Admin can also POST/PATCH to override individual variety photos
// (the Variety Photo Library admin UI).
// ───────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

export const varietyDefaultsRouter = Router();

// Public: fetch dict of variety → reference photo
varietyDefaultsRouter.get('/', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT variety, region, photo_url, photo_alt_url, source, notes
    FROM variety_defaults
    WHERE active = 1
    ORDER BY region, variety
  `).all();

  // Reshape into both list (for admin UI) and map (for inventory pages)
  const map = {};
  for (const r of rows) {
    map[r.variety] = {
      region: r.region,
      photo_url: r.photo_url,
      photo_alt_url: r.photo_alt_url,
      source: r.source,
      notes: r.notes,
    };
  }
  res.json({ varieties: rows, map });
});

// Admin, sales, yard: override one variety's reference photo (data URI in body)
varietyDefaultsRouter.patch('/:variety', authenticate, requireRole('admin', 'sales', 'yard'), (req, res) => {
  const { variety } = req.params;
  const { photo_url, region, notes } = req.body || {};

  if (photo_url && typeof photo_url === 'string' && photo_url.length > 5_000_000) {
    return res.status(413).json({ error: 'Photo too large (>5MB)' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM variety_defaults WHERE variety = ?').get(variety);

  if (existing) {
    db.prepare(`
      UPDATE variety_defaults
         SET photo_url = COALESCE(?, photo_url),
             region    = COALESCE(?, region),
             notes     = COALESCE(?, notes),
             source    = 'uploaded',
             updated_at = datetime('now')
       WHERE variety = ?
    `).run(photo_url || null, region || null, notes || null, variety);
  } else {
    db.prepare(`
      INSERT INTO variety_defaults (variety, region, photo_url, notes, source)
      VALUES (?, ?, ?, ?, 'uploaded')
    `).run(variety, region || null, photo_url || null, notes || null);
  }

  logger.info({ variety, user: req.user.username }, 'Variety photo updated');
  res.json({ ok: true, variety });
});
