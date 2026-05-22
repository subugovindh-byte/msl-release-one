-- ════════════════════════════════════════════════════════
-- MIGRATION 004 — collection accounts + invoice QR storage
-- ════════════════════════════════════════════════════════

-- ─── COLLECTION ACCOUNTS ───
-- A "collection account" is where funds are received:
--   kind='upi'   — UPI VPA (e.g. modernex@hdfcbank)
--   kind='bank'  — bank account (for NEFT/RTGS/IMPS)
--   kind='both'  — one logical account that has BOTH (UPI tied to same bank)
CREATE TABLE IF NOT EXISTS collection_accounts (
  id               TEXT PRIMARY KEY,          -- CA001, CA002...
  name             TEXT NOT NULL,             -- display name e.g. "HDFC Current — Main"
  kind             TEXT NOT NULL CHECK (kind IN ('upi','bank','both')),
  -- UPI fields
  upi_id           TEXT,                      -- e.g. modernexstones@hdfcbank
  upi_name         TEXT,                      -- payee name shown in UPI apps
  -- Bank fields
  account_number   TEXT,
  ifsc             TEXT,
  bank_name        TEXT,
  branch           TEXT,
  account_holder   TEXT,
  account_type     TEXT CHECK (account_type IN ('savings','current','od','cc') OR account_type IS NULL),
  -- Flags
  is_default       INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1,
  notes            TEXT,
  -- Audit
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_by       TEXT,
  updated_at       TEXT,
  updated_by       TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_default
  ON collection_accounts(is_default) WHERE is_default = 1;

-- ─── INVOICE → COLLECTION ACCOUNT ───
ALTER TABLE invoices ADD COLUMN collection_account_id TEXT
  REFERENCES collection_accounts(id);

-- ─── INVOICE QR (IRN signed payload from IRP) ───
-- The IRP returns a signed JSON blob ("SignedQRCode") which must be rendered as a QR
-- on the invoice. Store verbatim so we can regenerate the image on demand.
ALTER TABLE invoices ADD COLUMN signed_qr_payload TEXT;

-- ─── SEED DEFAULT ACCOUNT FROM EXISTING COMPANY UPI ───
-- Use the UPI ID that was in config as the first collection account
-- (so existing invoices and workflows don't break).
INSERT OR IGNORE INTO collection_accounts
  (id, name, kind, upi_id, upi_name, is_default, active, created_by)
VALUES
  ('CA001', 'Modernex UPI — Default', 'upi',
   'modernexstones@hdfcbank', 'Modernex Stones LLP',
   1, 1, 'migration');
