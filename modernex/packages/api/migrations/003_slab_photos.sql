-- ════════════════════════════════════════════════════════
-- MIGRATION 003 — slab photos + variety default images
-- ════════════════════════════════════════════════════════

-- Per-slab photo (captured by yard staff)
ALTER TABLE slabs ADD COLUMN photo_url TEXT;
ALTER TABLE slabs ADD COLUMN photo_uploaded_at TEXT;
ALTER TABLE slabs ADD COLUMN photo_uploaded_by TEXT;
ALTER TABLE slabs ADD COLUMN photo_size_bytes INTEGER;

-- Default photo per variety (shown when slab has no custom photo yet)
CREATE TABLE IF NOT EXISTS variety_photos (
  variety          TEXT PRIMARY KEY,
  photo_url        TEXT NOT NULL,
  attribution      TEXT,                  -- photographer / source credit
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by       TEXT
);

-- Seed with neutral placeholder data-URLs (1x1 colored SVGs encoded inline).
-- Replace with real product photography in production via /api/slabs/varieties/:name/photo
INSERT OR IGNORE INTO variety_photos (variety, photo_url, attribution) VALUES
  ('Paradiso Classic',  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0%" stop-color="%234a3a35"/><stop offset="50%" stop-color="%23786460"/><stop offset="100%" stop-color="%233a2e2a"/></linearGradient></defs><rect width="100" height="60" fill="url(%23g)"/></svg>', 'Placeholder'),
  ('Paradiso Extra',    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0%" stop-color="%235c4a45"/><stop offset="50%" stop-color="%238a7570"/><stop offset="100%" stop-color="%234a3a35"/></linearGradient></defs><rect width="100" height="60" fill="url(%23g)"/></svg>', 'Placeholder'),
  ('Multicolour Red',   'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0%" stop-color="%23703025"/><stop offset="50%" stop-color="%238c4535"/><stop offset="100%" stop-color="%236a2818"/></linearGradient></defs><rect width="100" height="60" fill="url(%23g)"/></svg>', 'Placeholder'),
  ('Tan Brown',         'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0%" stop-color="%234a2f22"/><stop offset="50%" stop-color="%236d4830"/><stop offset="100%" stop-color="%233a2418"/></linearGradient></defs><rect width="100" height="60" fill="url(%23g)"/></svg>', 'Placeholder'),
  ('Black Galaxy',      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="%23181818"/><circle cx="20" cy="20" r=".8" fill="%23c8993e"/><circle cx="45" cy="35" r=".6" fill="%23c8993e"/><circle cx="70" cy="15" r=".9" fill="%23c8993e"/><circle cx="85" cy="45" r=".7" fill="%23c8993e"/><circle cx="30" cy="50" r=".8" fill="%23c8993e"/></svg>', 'Placeholder'),
  ('Vizag Blue',        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0%" stop-color="%232a3a50"/><stop offset="50%" stop-color="%234a5d7a"/><stop offset="100%" stop-color="%23253044"/></linearGradient></defs><rect width="100" height="60" fill="url(%23g)"/></svg>', 'Placeholder'),
  ('Steel Grey',        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0%" stop-color="%23454545"/><stop offset="50%" stop-color="%23686868"/><stop offset="100%" stop-color="%23383838"/></linearGradient></defs><rect width="100" height="60" fill="url(%23g)"/></svg>', 'Placeholder'),
  ('Absolute Black',    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="%230a0a0a"/></svg>', 'Placeholder'),
  ('Kashmir White',     'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0%" stop-color="%23e0d8c8"/><stop offset="50%" stop-color="%23f0ebdc"/><stop offset="100%" stop-color="%23d8cfba"/></linearGradient></defs><rect width="100" height="60" fill="url(%23g)"/></svg>', 'Placeholder'),
  ('Colombo Juparana',  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0%" stop-color="%23886a50"/><stop offset="50%" stop-color="%23a4856a"/><stop offset="100%" stop-color="%23705540"/></linearGradient></defs><rect width="100" height="60" fill="url(%23g)"/></svg>', 'Placeholder');

CREATE INDEX IF NOT EXISTS idx_slabs_photo ON slabs(photo_url) WHERE photo_url IS NOT NULL;
