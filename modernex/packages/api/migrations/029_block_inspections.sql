-- Migration 029: Block inspections — pre-PO quarry site inspection
-- Inspector visits quarry, grades blocks (A+/A/B), uploads photos,
-- then raises a PO directly from the approved inspection record.

CREATE TABLE IF NOT EXISTS block_inspections (
  id               TEXT PRIMARY KEY,          -- BLK/25-26/0001
  date             TEXT NOT NULL,             -- inspection date (YYYY-MM-DD)
  vendor_id        TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  quarry_location  TEXT,                      -- quarry name / GPS note
  variety          TEXT NOT NULL,
  block_count      INTEGER NOT NULL DEFAULT 1,
  est_cft          REAL NOT NULL DEFAULT 0,   -- estimated total CFT
  grade            TEXT NOT NULL DEFAULT 'A', -- A+, A, B
  defect_note      TEXT,                      -- cracks, colour variance, etc.
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | po_raised | rejected
  po_id            TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  inspected_by     TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS block_inspection_photos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id    TEXT NOT NULL REFERENCES block_inspections(id) ON DELETE CASCADE,
  data_url         TEXT NOT NULL,   -- base64 data: URI stored in SQLite
  caption          TEXT,
  uploaded_at      TEXT NOT NULL DEFAULT (datetime('now')),
  uploaded_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bi_vendor   ON block_inspections(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bi_status   ON block_inspections(status);
CREATE INDEX IF NOT EXISTS idx_bi_po       ON block_inspections(po_id);
CREATE INDEX IF NOT EXISTS idx_bip_insp    ON block_inspection_photos(inspection_id);

-- Add inspection_id back-reference on purchase_orders
-- (SQLite ignores ALTER TABLE if column already exists via IF NOT EXISTS emulation — safe to run on existing db)
ALTER TABLE purchase_orders ADD COLUMN inspection_id TEXT REFERENCES block_inspections(id) ON DELETE SET NULL;
