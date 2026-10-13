// ───────────────────────────────────────────────────────────────────
// /api/variety-defaults — GET dict of {variety: {photo_url, region, ...}}
// Used by the frontend Inventory/POS/Products pages to render
// per-variety reference photos when products lack custom uploads.
//
// Admin can also POST/PATCH to override individual variety photos
// (the Variety Photo Library admin UI).
// ───────────────────────────────────────────────────────────────────

import { Router, json } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

export const varietyDefaultsRouter = Router();

// Public: fetch dict of variety → reference photo
varietyDefaultsRouter.get('/', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT d.variety, d.region, d.photo_url, d.photo_alt_url, d.source, d.notes,
           (SELECT COUNT(*) FROM variety_frames f WHERE f.variety = d.variety) AS frame_count
    FROM variety_defaults d
    WHERE d.active = 1
    ORDER BY d.region, d.variety
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
      frame_count: r.frame_count,
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

// Admin: clear (delete) a variety's reference photo
varietyDefaultsRouter.delete('/:variety/photo', authenticate, requireRole('admin'), (req, res) => {
  const { variety } = req.params;
  const db = getDb();
  db.prepare(`UPDATE variety_defaults SET photo_url = NULL, updated_at = datetime('now') WHERE variety = ?`).run(variety);
  logger.info({ variety, user: req.user.username }, 'Variety photo deleted');
  res.json({ ok: true, variety });
});

// ── 360 frame sequences ────────────────────────────────────────────────────
// Frames are fetched per variety, never with the listing: a catalogue-wide
// response carrying every frame would be tens of megabytes.

const MAX_FRAMES = 36;                 // 10 degrees apart — finer than this is wasted
const MAX_FRAME_BYTES = 600_000;       // ~600 KB per frame after downscaling
const MIN_SPIN_FRAMES = 4;             // coarse, but still reads as rotation

varietyDefaultsRouter.get('/:variety/frames', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT idx, data_url FROM variety_frames WHERE variety = ? ORDER BY idx'
  ).all(req.params.variety);
  res.json({ variety: req.params.variety, frames: rows.map(r => r.data_url), count: rows.length });
});

// Replace the whole sequence. A rotation is only coherent as a complete,
// ordered set, so this is a PUT of the entire set rather than an append.
// 36 frames x 600KB plus JSON overhead; the global 5mb parser skips this path.
varietyDefaultsRouter.put('/:variety/frames', json({ limit: '26mb' }), authenticate, requireRole('admin', 'sales', 'yard'), (req, res) => {
  const { variety } = req.params;
  const frames = Array.isArray(req.body?.frames) ? req.body.frames : null;
  if (!frames) return res.status(400).json({ error: 'frames must be an array' });
  if (frames.length > MAX_FRAMES) {
    return res.status(413).json({ error: `Too many frames (max ${MAX_FRAMES})` });
  }
  if (frames.length && frames.length < MIN_SPIN_FRAMES) {
    return res.status(400).json({ error: `A rotation needs at least ${MIN_SPIN_FRAMES} frames` });
  }
  for (const f of frames) {
    if (typeof f !== 'string' || !f.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Each frame must be an image data URI' });
    }
    if (f.length > MAX_FRAME_BYTES) {
      return res.status(413).json({ error: 'A frame is too large — downscale before upload' });
    }
  }

  const db = getDb();
  if (!db.prepare('SELECT 1 FROM variety_defaults WHERE variety = ?').get(variety)) {
    return res.status(404).json({ error: 'Unknown variety' });
  }

  // All-or-nothing: a half-written rotation is worse than none.
  const replace = db.transaction(list => {
    db.prepare('DELETE FROM variety_frames WHERE variety = ?').run(variety);
    const ins = db.prepare('INSERT INTO variety_frames (variety, idx, data_url) VALUES (?, ?, ?)');
    list.forEach((url, i) => ins.run(variety, i, url));
  });
  replace(frames);

  logger.info({ variety, count: frames.length, user: req.user.username }, 'Variety 360 frames replaced');
  res.json({ ok: true, variety, count: frames.length });
});

varietyDefaultsRouter.delete('/:variety/frames', authenticate, requireRole('admin'), (req, res) => {
  const db = getDb();
  const { changes } = db.prepare('DELETE FROM variety_frames WHERE variety = ?').run(req.params.variety);
  logger.info({ variety: req.params.variety, removed: changes, user: req.user.username }, 'Variety 360 frames cleared');
  res.json({ ok: true, removed: changes });
});
