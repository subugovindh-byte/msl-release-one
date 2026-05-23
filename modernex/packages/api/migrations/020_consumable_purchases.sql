-- Operational purchases: consumables, machinery parts, tools, etc.
CREATE TABLE IF NOT EXISTS consumable_purchases (
  id           TEXT PRIMARY KEY,          -- CP-2025-0001
  date         TEXT NOT NULL,
  vendor_id    TEXT,                      -- optional link to vendors table
  vendor_name  TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Consumables',
  items        TEXT NOT NULL DEFAULT '[]', -- JSON [{description,qty,unit,rate_paise,amount_paise}]
  total_paise  INTEGER NOT NULL DEFAULT 0,
  payment_mode TEXT,                      -- Cash|Cheque|NEFT|RTGS|UPI
  reference_no TEXT,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_by   TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cp_date     ON consumable_purchases(date);
CREATE INDEX IF NOT EXISTS idx_cp_status   ON consumable_purchases(status);
CREATE INDEX IF NOT EXISTS idx_cp_category ON consumable_purchases(category);
CREATE INDEX IF NOT EXISTS idx_cp_vendor   ON consumable_purchases(vendor_name);

CREATE TRIGGER IF NOT EXISTS trg_cp_updated
  AFTER UPDATE ON consumable_purchases
BEGIN
  UPDATE consumable_purchases SET updated_at = datetime('now') WHERE id = NEW.id;
END;
