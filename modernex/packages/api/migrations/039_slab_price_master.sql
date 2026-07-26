-- Migration 039: Slab price master — variety × grade × thickness → rate per sqft
-- The finished-goods selling-price list. Producing a slab auto-fills its selling
-- rate from here (variety + grade + thickness), still overridable. Mirrors
-- block_price_master, which drives purchase (block) pricing.

CREATE TABLE IF NOT EXISTS slab_price_master (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  variety             TEXT NOT NULL,
  grade               TEXT NOT NULL CHECK(grade IN ('A+','A','B')),
  thickness_mm        INTEGER NOT NULL DEFAULT 0,
  rate_per_sqft_paise INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(variety, grade, thickness_mm)
);

CREATE INDEX IF NOT EXISTS idx_spm_variety ON slab_price_master(variety);
