-- ─── COMPANY DETAILS (single-row settings table) ───
CREATE TABLE IF NOT EXISTS company_details (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  name        TEXT NOT NULL DEFAULT '',
  trade_name  TEXT,
  gstin       TEXT NOT NULL DEFAULT '',
  pan         TEXT NOT NULL DEFAULT '',
  hsn         TEXT NOT NULL DEFAULT '2516',
  address     TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL DEFAULT 'Tamil Nadu',
  pincode     TEXT NOT NULL DEFAULT '',
  phone       TEXT,
  email       TEXT,
  fy          TEXT NOT NULL DEFAULT '2025-26',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT
);

-- Seed empty placeholder row (fill via System → Company Settings in the UI)
INSERT OR IGNORE INTO company_details (id, name, gstin, pan, hsn, address, city, state, pincode, fy)
VALUES (1, '', '', '', '2516', '', '', 'Tamil Nadu', '', '2025-26');
