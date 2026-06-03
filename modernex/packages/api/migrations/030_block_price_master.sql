-- Migration 030: Block price master — variety × grade → rate per CFT
-- Used to auto-fill rate when raising a PO from an inspection.

CREATE TABLE IF NOT EXISTS block_price_master (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  variety   TEXT NOT NULL,
  grade     TEXT NOT NULL CHECK(grade IN ('A+','A','B')),
  rate_per_cft_paise INTEGER NOT NULL DEFAULT 0,
  notes     TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(variety, grade)
);

CREATE INDEX IF NOT EXISTS idx_bpm_variety ON block_price_master(variety);
