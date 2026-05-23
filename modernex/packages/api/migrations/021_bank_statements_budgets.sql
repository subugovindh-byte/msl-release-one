-- Bank statement lines for reconciliation
CREATE TABLE IF NOT EXISTS bank_statements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_name  TEXT NOT NULL,              -- e.g. "SBI Current A/C"
  stmt_date     TEXT NOT NULL,
  description   TEXT NOT NULL,
  debit_paise   INTEGER NOT NULL DEFAULT 0,
  credit_paise  INTEGER NOT NULL DEFAULT 0,
  balance_paise INTEGER,
  ref_no        TEXT,
  matched       INTEGER NOT NULL DEFAULT 0, -- 0=unmatched,1=matched
  matched_to    TEXT,                       -- payment id or journal voucher id
  matched_by    TEXT,
  matched_at    TEXT,
  imported_at   TEXT NOT NULL DEFAULT (datetime('now')),
  imported_by   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bs_date    ON bank_statements(stmt_date);
CREATE INDEX IF NOT EXISTS idx_bs_matched ON bank_statements(matched);
CREATE INDEX IF NOT EXISTS idx_bs_account ON bank_statements(account_name);
