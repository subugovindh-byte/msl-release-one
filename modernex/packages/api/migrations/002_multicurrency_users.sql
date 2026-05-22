-- ════════════════════════════════════════════════════════
-- MIGRATION 002 — multi-currency & user management
-- ════════════════════════════════════════════════════════

-- ─── FX RATES ───
CREATE TABLE IF NOT EXISTS fx_rates (
  currency    TEXT NOT NULL,
  rate_date   TEXT NOT NULL,
  inr_per_1   REAL NOT NULL,
  source      TEXT NOT NULL DEFAULT 'manual',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (currency, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_fx_currency_date ON fx_rates(currency, rate_date DESC);

-- ─── INVOICE MULTI-CURRENCY ───
-- Add columns (SQLite: one at a time)
ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE invoices ADD COLUMN fx_rate REAL NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN foreign_total_minor INTEGER;
ALTER TABLE invoices ADD COLUMN export_type TEXT NOT NULL DEFAULT 'NONE'
  CHECK (export_type IN ('NONE','WITHOUT_TAX','WITH_TAX','DEEMED'));
ALTER TABLE invoices ADD COLUMN port_code TEXT;       -- for export shipping bill
ALTER TABLE invoices ADD COLUMN shipping_bill_no TEXT;
ALTER TABLE invoices ADD COLUMN shipping_bill_date TEXT;

-- ─── CUSTOMER CURRENCY PREFERENCE ───
ALTER TABLE customers ADD COLUMN preferred_currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE customers ADD COLUMN country TEXT NOT NULL DEFAULT 'India';

-- ─── USER MANAGEMENT ENHANCEMENTS ───
-- (users table already exists from migration 001; add columns here)
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN created_by TEXT;         -- username of admin who created this user
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN deactivated_at TEXT;
ALTER TABLE users ADD COLUMN deactivated_by TEXT;
ALTER TABLE users ADD COLUMN deactivation_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
