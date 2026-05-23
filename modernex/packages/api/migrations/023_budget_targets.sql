-- Budget targets: monthly spend targets per category (distinct from COA-linked budgets in 015)
CREATE TABLE IF NOT EXISTS budget_targets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fy            TEXT NOT NULL,          -- '2025-26'
  month         TEXT NOT NULL,          -- '2025-04'
  category      TEXT NOT NULL,          -- e.g. 'Revenue', 'Raw Material', 'Consumables', 'Payroll'
  amount_paise  INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT NOT NULL,
  UNIQUE(fy, month, category)
);

CREATE INDEX IF NOT EXISTS idx_bt_fy    ON budget_targets(fy);
CREATE INDEX IF NOT EXISTS idx_bt_month ON budget_targets(month);
