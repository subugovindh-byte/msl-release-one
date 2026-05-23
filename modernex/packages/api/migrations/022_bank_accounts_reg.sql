-- Bank account registry for bank reconciliation module
CREATE TABLE IF NOT EXISTS bank_accounts_reg (
  id                    TEXT PRIMARY KEY,          -- BANK-001
  name                  TEXT NOT NULL,             -- 'SBI Current A/C'
  account_no            TEXT,
  ifsc                  TEXT,
  bank_name             TEXT NOT NULL,
  branch                TEXT,
  opening_balance_paise INTEGER NOT NULL DEFAULT 0,
  opening_date          TEXT NOT NULL DEFAULT (date('now')),
  account_id            TEXT,                      -- FK to chart_of_accounts id (optional)
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Detailed statement lines imported from bank CSV / manual entry
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_account_id       TEXT NOT NULL REFERENCES bank_accounts_reg(id),
  txn_date              TEXT NOT NULL,
  value_date            TEXT,
  description           TEXT,
  ref_no                TEXT,
  debit_paise           INTEGER NOT NULL DEFAULT 0,
  credit_paise          INTEGER NOT NULL DEFAULT 0,
  running_balance_paise INTEGER NOT NULL DEFAULT 0,
  reconciled            INTEGER NOT NULL DEFAULT 0,  -- 0=unreconciled, 1=reconciled
  matched_payment_id    TEXT,                        -- FK to payments.id
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bsl_account ON bank_statement_lines(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bsl_date    ON bank_statement_lines(txn_date);
CREATE INDEX IF NOT EXISTS idx_bsl_recon   ON bank_statement_lines(reconciled);
