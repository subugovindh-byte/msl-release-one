-- ============================================================
-- 014_advanced_accounting.sql
-- TDS, Chart of Accounts, Journal Vouchers, Fixed Assets,
-- Bank Reconciliation, PDC, Payroll, GSTR-2B Reconciliation,
-- MSME 45-day view, Trial Balance view
-- ============================================================

-- ─── TDS SECTIONS (reference data) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tds_sections (
  code                      TEXT PRIMARY KEY,
  description               TEXT NOT NULL,
  rate_individual_pct       REAL NOT NULL DEFAULT 1.0,
  rate_company_pct          REAL NOT NULL DEFAULT 2.0,
  threshold_single_paise    INTEGER NOT NULL DEFAULT 3000000,
  threshold_aggregate_paise INTEGER NOT NULL DEFAULT 7500000
);

INSERT OR IGNORE INTO tds_sections VALUES
  ('194C', 'Payments to Contractors/Sub-contractors', 1.0,  2.0,  3000000,   7500000),
  ('194J', 'Professional / Technical Services',       10.0, 10.0, 3000000,   3000000),
  ('194I', 'Rent — Land / Building / Furniture',      10.0, 10.0, 240000000, 240000000),
  ('194Q', 'Purchase of Goods (buyer TDS)',            0.1,  0.1,  5000000000,5000000000),
  ('194H', 'Commission or Brokerage',                  5.0,  5.0,  1500000,   1500000);

-- Extend vendors with TDS fields
ALTER TABLE vendors ADD COLUMN pan              TEXT;
ALTER TABLE vendors ADD COLUMN tds_section      TEXT;
ALTER TABLE vendors ADD COLUMN tds_exempt       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vendors ADD COLUMN deductee_type    TEXT    NOT NULL DEFAULT 'individual';

-- TDS transactions (one row per payment where TDS was deducted)
CREATE TABLE IF NOT EXISTS tds_transactions (
  id                TEXT PRIMARY KEY,
  vendor_id         TEXT    NOT NULL REFERENCES vendors(id),
  payment_id        TEXT    REFERENCES payments(id),
  po_id             TEXT    REFERENCES purchase_orders(id),
  section           TEXT    NOT NULL,
  payment_date      TEXT    NOT NULL,
  gross_amount_paise INTEGER NOT NULL,
  tds_rate_pct      REAL    NOT NULL,
  tds_amount_paise  INTEGER NOT NULL,
  challan_no        TEXT,
  challan_date      TEXT,
  bsr_code          TEXT,
  deposited         INTEGER NOT NULL DEFAULT 0,
  fy                TEXT    NOT NULL,
  quarter           TEXT    NOT NULL CHECK(quarter IN ('Q1','Q2','Q3','Q4')),
  notes             TEXT,
  created_by        TEXT    NOT NULL DEFAULT 'system',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- TDS challans (ITNS 281 deposit records)
CREATE TABLE IF NOT EXISTS tds_challans (
  id               TEXT PRIMARY KEY,
  challan_date     TEXT NOT NULL,
  bsr_code         TEXT NOT NULL,
  challan_serial_no TEXT NOT NULL,
  section          TEXT NOT NULL,
  amount_paise     INTEGER NOT NULL,
  fy               TEXT NOT NULL,
  quarter          TEXT NOT NULL CHECK(quarter IN ('Q1','Q2','Q3','Q4')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── CHART OF ACCOUNTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES account_groups(id),
  nature     TEXT NOT NULL CHECK(nature IN ('asset','liability','income','expense','capital')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  group_id              TEXT NOT NULL REFERENCES account_groups(id),
  code                  TEXT UNIQUE,
  opening_balance_paise INTEGER NOT NULL DEFAULT 0,
  is_debit_balance      INTEGER NOT NULL DEFAULT 1,
  is_system             INTEGER NOT NULL DEFAULT 0,
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_vouchers (
  id           TEXT PRIMARY KEY,
  date         TEXT NOT NULL,
  narration    TEXT NOT NULL,
  voucher_type TEXT NOT NULL CHECK(voucher_type IN ('journal','contra','payment','receipt','sales','purchase','debit_note','credit_note')),
  ref_id       TEXT,
  ref_type     TEXT,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id   TEXT    NOT NULL REFERENCES journal_vouchers(id) ON DELETE CASCADE,
  account_id   TEXT    NOT NULL REFERENCES accounts(id),
  debit_paise  INTEGER NOT NULL DEFAULT 0,
  credit_paise INTEGER NOT NULL DEFAULT 0,
  narration    TEXT
);

-- ── Seed account groups (Tally-style hierarchy) ──
INSERT OR IGNORE INTO account_groups (id,name,parent_id,nature,sort_order) VALUES
  ('AG-CAP',    'Capital Account',          NULL,       'capital',   1),
  ('AG-LOAN',   'Loans (Liability)',         NULL,       'liability', 2),
  ('AG-CL',     'Current Liabilities',      NULL,       'liability', 3),
  ('AG-FA',     'Fixed Assets',             NULL,       'asset',     4),
  ('AG-CA',     'Current Assets',           NULL,       'asset',     6),
  ('AG-INC',    'Income',                   NULL,       'income',    7),
  ('AG-DIREX',  'Direct Expenses',          NULL,       'expense',   8),
  ('AG-INDX',   'Indirect Expenses',        NULL,       'expense',   9),
  -- Sub-groups under CA
  ('AG-BANK',   'Bank Accounts',            'AG-CA',    'asset',     1),
  ('AG-CASH',   'Cash-in-Hand',             'AG-CA',    'asset',     2),
  ('AG-DEB',    'Sundry Debtors',           'AG-CA',    'asset',     3),
  ('AG-STOCK',  'Stock-in-Trade',           'AG-CA',    'asset',     4),
  ('AG-ADVIN',  'Advances (Receivable)',    'AG-CA',    'asset',     5),
  ('AG-TAXA',   'Duties & Taxes (Asset)',   'AG-CA',    'asset',     6),
  -- Sub-groups under CL
  ('AG-CRED',   'Sundry Creditors',         'AG-CL',    'liability', 1),
  ('AG-ADVOUT', 'Advances (Payable)',        'AG-CL',    'liability', 2),
  ('AG-TAXL',   'Duties & Taxes (Liab)',    'AG-CL',    'liability', 3),
  -- Sub-groups under FA
  ('AG-PLANT',  'Plant & Machinery',        'AG-FA',    'asset',     1),
  ('AG-VEH',    'Vehicles',                 'AG-FA',    'asset',     2),
  ('AG-BLDG',   'Land & Building',          'AG-FA',    'asset',     3),
  ('AG-FURN',   'Furniture & Fixtures',     'AG-FA',    'asset',     4);

-- ── Seed default accounts ──
-- Columns: id, name, group_id, code, is_system, is_debit_balance
--   is_debit_balance=1 → Assets, Expenses (normal debit balance)
--   is_debit_balance=0 → Liabilities, Capital, Income, Contra-assets
INSERT OR IGNORE INTO accounts (id,name,group_id,code,is_system,is_debit_balance) VALUES
  ('ACC-CASH',    'Cash in Hand',               'AG-CASH',  '1001', 1, 1),
  ('ACC-BANK1',   'SBI Current Account',        'AG-BANK',  '1010', 0, 1),
  ('ACC-DEB',     'Sundry Debtors',             'AG-DEB',   '1100', 1, 1),
  ('ACC-STOCK',   'Stock — Granite Products',   'AG-STOCK', '1200', 1, 1),
  ('ACC-ADVTAX',  'Advance Tax Paid',           'AG-TAXA',  '1300', 0, 1),
  ('ACC-TDSR',    'TDS Receivable',             'AG-TAXA',  '1301', 0, 1),
  ('ACC-CGSTR',   'CGST Input Credit',          'AG-TAXA',  '1302', 1, 1),
  ('ACC-SGSTR',   'SGST Input Credit',          'AG-TAXA',  '1303', 1, 1),
  ('ACC-IGSTR',   'IGST Input Credit',          'AG-TAXA',  '1304', 1, 1),
  ('ACC-PLANT',   'Plant & Machinery',          'AG-PLANT', '2001', 0, 1),
  ('ACC-PLANTDEP','Accum. Depr — Plant',        'AG-PLANT', '2001D',0, 0),
  ('ACC-VEH',     'Vehicles',                   'AG-VEH',   '2002', 0, 1),
  ('ACC-VEHDEP',  'Accum. Depr — Vehicles',     'AG-VEH',   '2002D',0, 0),
  ('ACC-BLDG',    'Land & Building',            'AG-BLDG',  '2003', 0, 1),
  ('ACC-CRED',    'Sundry Creditors',           'AG-CRED',  '3001', 1, 0),
  ('ACC-ADVRCV',  'Advance from Customers',     'AG-ADVOUT','3002', 0, 0),
  ('ACC-CGST',    'CGST Payable',               'AG-TAXL',  '3100', 1, 0),
  ('ACC-SGST',    'SGST Payable',               'AG-TAXL',  '3101', 1, 0),
  ('ACC-IGST',    'IGST Payable',               'AG-TAXL',  '3102', 1, 0),
  ('ACC-TDSP',    'TDS Payable',                'AG-TAXL',  '3103', 1, 0),
  ('ACC-SALP',    'Salary Payable',             'AG-TAXL',  '3104', 0, 0),
  ('ACC-PFP',     'PF Payable',                 'AG-TAXL',  '3105', 0, 0),
  ('ACC-ESIP',    'ESI Payable',                'AG-TAXL',  '3106', 0, 0),
  ('ACC-PTP',     'Professional Tax Payable',   'AG-TAXL',  '3107', 0, 0),
  ('ACC-CAP',     'Partner Capital Account',    'AG-CAP',   '4001', 0, 0),
  ('ACC-RET',     'Retained Earnings',          'AG-CAP',   '4002', 1, 0),
  ('ACC-SALES',   'Sales — Granite Products',   'AG-INC',   '5001', 1, 0),
  ('ACC-OTHERINC','Other Income',               'AG-INC',   '5099', 0, 0),
  ('ACC-PURCH',   'Purchases — Raw Blocks',     'AG-DIREX', '6001', 1, 1),
  ('ACC-FREIGHT', 'Freight Inward',             'AG-DIREX', '6002', 0, 1),
  ('ACC-DIRLBR',  'Direct Labour',              'AG-DIREX', '6003', 0, 1),
  ('ACC-TRANS',   'Transport Charges',          'AG-INDX',  '7001', 0, 1),
  ('ACC-BANKCHG', 'Bank Charges',               'AG-INDX',  '7002', 0, 1),
  ('ACC-RENT',    'Rent',                       'AG-INDX',  '7003', 0, 1),
  ('ACC-DEPR',    'Depreciation',               'AG-INDX',  '7004', 1, 1),
  ('ACC-SAL',     'Salaries & Wages',           'AG-INDX',  '7005', 0, 1),
  ('ACC-PFEX',    'PF — Employer Contribution', 'AG-INDX',  '7006', 0, 1),
  ('ACC-ESIEX',   'ESI — Employer Contribution','AG-INDX',  '7007', 0, 1),
  ('ACC-MISC',    'Miscellaneous Expenses',     'AG-INDX',  '7099', 0, 1);

-- ─── FIXED ASSETS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_assets (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  category              TEXT NOT NULL CHECK(category IN (
                          'Plant & Machinery','Vehicles','Land & Building',
                          'Furniture & Fixtures','Computer & Peripherals','Other')),
  it_block              TEXT NOT NULL DEFAULT 'Plant & Machinery',
  purchase_date         TEXT NOT NULL,
  purchase_cost_paise   INTEGER NOT NULL,
  description           TEXT,
  vendor_id             TEXT REFERENCES vendors(id),
  location              TEXT,
  serial_no             TEXT,
  depreciation_method   TEXT NOT NULL DEFAULT 'WDV' CHECK(depreciation_method IN ('WDV','SLM')),
  depreciation_rate_pct REAL NOT NULL DEFAULT 15.0,
  account_id            TEXT REFERENCES accounts(id),
  disposed              INTEGER NOT NULL DEFAULT 0,
  disposal_date         TEXT,
  disposal_value_paise  INTEGER,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_depreciation_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id            TEXT    NOT NULL REFERENCES fixed_assets(id),
  fy                  TEXT    NOT NULL,
  opening_wdv_paise   INTEGER NOT NULL,
  addition_paise      INTEGER NOT NULL DEFAULT 0,
  disposal_paise      INTEGER NOT NULL DEFAULT 0,
  depreciation_paise  INTEGER NOT NULL,
  closing_wdv_paise   INTEGER NOT NULL,
  journal_voucher_id  TEXT    REFERENCES journal_vouchers(id),
  UNIQUE(asset_id, fy)
);

-- ─── BANK ACCOUNTS REGISTER ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts_reg (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  account_no             TEXT,
  ifsc                   TEXT,
  bank_name              TEXT NOT NULL,
  branch                 TEXT,
  opening_balance_paise  INTEGER NOT NULL DEFAULT 0,
  opening_date           TEXT    NOT NULL DEFAULT (date('now')),
  account_id             TEXT    REFERENCES accounts(id),
  active                 INTEGER NOT NULL DEFAULT 1,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_account_id    TEXT    NOT NULL REFERENCES bank_accounts_reg(id),
  txn_date           TEXT    NOT NULL,
  value_date         TEXT,
  description        TEXT,
  ref_no             TEXT,
  debit_paise        INTEGER NOT NULL DEFAULT 0,
  credit_paise       INTEGER NOT NULL DEFAULT 0,
  running_balance_paise INTEGER NOT NULL DEFAULT 0,
  reconciled         INTEGER NOT NULL DEFAULT 0,
  matched_payment_id TEXT    REFERENCES payments(id),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── POST-DATED CHEQUES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_dated_cheques (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL CHECK(type IN ('received','issued')),
  cheque_no       TEXT NOT NULL,
  bank_name       TEXT NOT NULL,
  branch          TEXT,
  amount_paise    INTEGER NOT NULL,
  cheque_date     TEXT NOT NULL,
  customer_id     TEXT REFERENCES customers(id),
  vendor_id       TEXT REFERENCES vendors(id),
  invoice_id      TEXT REFERENCES invoices(id),
  po_id           TEXT REFERENCES purchase_orders(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending','deposited','cleared','returned','cancelled')),
  deposited_date  TEXT,
  cleared_date    TEXT,
  returned_reason TEXT,
  notes           TEXT,
  created_by      TEXT NOT NULL DEFAULT 'system',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── EMPLOYEES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  designation           TEXT,
  department            TEXT DEFAULT 'General',
  joining_date          TEXT NOT NULL,
  leaving_date          TEXT,
  pan                   TEXT,
  uan                   TEXT,
  esic_no               TEXT,
  bank_account          TEXT,
  bank_ifsc             TEXT,
  salary_type           TEXT NOT NULL DEFAULT 'monthly'
                             CHECK(salary_type IN ('monthly','daily')),
  basic_salary_paise    INTEGER NOT NULL,
  hra_paise             INTEGER NOT NULL DEFAULT 0,
  conveyance_paise      INTEGER NOT NULL DEFAULT 0,
  other_allowance_paise INTEGER NOT NULL DEFAULT 0,
  pf_applicable         INTEGER NOT NULL DEFAULT 1,
  esi_applicable        INTEGER NOT NULL DEFAULT 0,
  pt_applicable         INTEGER NOT NULL DEFAULT 1,
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── PAYROLL ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                        TEXT PRIMARY KEY,
  month                     TEXT NOT NULL UNIQUE,
  status                    TEXT NOT NULL DEFAULT 'draft'
                                 CHECK(status IN ('draft','processed','paid')),
  total_gross_paise         INTEGER NOT NULL DEFAULT 0,
  total_pf_employee_paise   INTEGER NOT NULL DEFAULT 0,
  total_pf_employer_paise   INTEGER NOT NULL DEFAULT 0,
  total_esi_employee_paise  INTEGER NOT NULL DEFAULT 0,
  total_esi_employer_paise  INTEGER NOT NULL DEFAULT 0,
  total_pt_paise            INTEGER NOT NULL DEFAULT 0,
  total_net_paise           INTEGER NOT NULL DEFAULT 0,
  created_at                TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_entries (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id                   TEXT    NOT NULL REFERENCES payroll_runs(id),
  employee_id              TEXT    NOT NULL REFERENCES employees(id),
  days_worked              REAL    NOT NULL DEFAULT 26,
  basic_paise              INTEGER NOT NULL,
  hra_paise                INTEGER NOT NULL DEFAULT 0,
  conveyance_paise         INTEGER NOT NULL DEFAULT 0,
  other_allowance_paise    INTEGER NOT NULL DEFAULT 0,
  gross_paise              INTEGER NOT NULL,
  pf_employee_paise        INTEGER NOT NULL DEFAULT 0,
  pf_employer_paise        INTEGER NOT NULL DEFAULT 0,
  esi_employee_paise       INTEGER NOT NULL DEFAULT 0,
  esi_employer_paise       INTEGER NOT NULL DEFAULT 0,
  pt_paise                 INTEGER NOT NULL DEFAULT 0,
  tds_paise                INTEGER NOT NULL DEFAULT 0,
  total_deductions_paise   INTEGER NOT NULL DEFAULT 0,
  net_paise                INTEGER NOT NULL,
  paid                     INTEGER NOT NULL DEFAULT 0,
  UNIQUE(run_id, employee_id)
);

-- ─── GSTR-2B RECONCILIATION ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gstr2b_imports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period       TEXT    NOT NULL,
  imported_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  record_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gstr2b_records (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id        INTEGER NOT NULL REFERENCES gstr2b_imports(id) ON DELETE CASCADE,
  supplier_gstin   TEXT    NOT NULL,
  supplier_name    TEXT,
  invoice_no       TEXT    NOT NULL,
  invoice_date     TEXT    NOT NULL,
  invoice_type     TEXT    DEFAULT 'B2B',
  taxable_paise    INTEGER NOT NULL DEFAULT 0,
  igst_paise       INTEGER NOT NULL DEFAULT 0,
  cgst_paise       INTEGER NOT NULL DEFAULT 0,
  sgst_paise       INTEGER NOT NULL DEFAULT 0,
  itc_available    TEXT    DEFAULT 'Y',
  reconciled       INTEGER NOT NULL DEFAULT 0,
  matched_po_id    TEXT    REFERENCES purchase_orders(id)
);

-- ─── OVERDUE INTEREST config on customers ──────────────────────────────────
ALTER TABLE customers ADD COLUMN interest_rate_pct REAL NOT NULL DEFAULT 18.0;
ALTER TABLE customers ADD COLUMN credit_days_actual INTEGER NOT NULL DEFAULT 30;

-- ─── VIEWS ─────────────────────────────────────────────────────────────────

-- MSME 45-day overdue tracker
CREATE VIEW IF NOT EXISTS v_msme_overdue AS
SELECT
  po.id                   AS po_id,
  v.id                    AS vendor_id,
  v.name                  AS vendor_name,
  v.msme_number,
  po.date                 AS invoice_date,
  po.total_paise,
  COALESCE((
    SELECT SUM(p.amount_paise) FROM payments p
    WHERE p.vendor_id = v.id
      AND p.category IN ('quarry','general','invoice')
  ), 0)                   AS paid_paise,
  po.total_paise - COALESCE((
    SELECT SUM(p.amount_paise) FROM payments p
    WHERE p.vendor_id = v.id
      AND p.category IN ('quarry','general','invoice')
  ), 0)                   AS outstanding_paise,
  CAST(julianday('now') - julianday(po.date) AS INTEGER) AS days_elapsed,
  CASE WHEN julianday('now') - julianday(po.date) > 45 THEN 1 ELSE 0 END AS is_overdue
FROM purchase_orders po
JOIN vendors v ON po.vendor_id = v.id
WHERE v.msme = 1
  AND po.status NOT IN ('cancelled')
  AND po.total_paise > COALESCE((
    SELECT SUM(p.amount_paise) FROM payments p
    WHERE p.vendor_id = v.id
      AND p.category IN ('quarry','general','invoice')
  ), 0);

-- Trial Balance (from journal_entries + opening balances)
CREATE VIEW IF NOT EXISTS v_trial_balance AS
SELECT
  a.id,
  a.code,
  a.name                              AS account_name,
  ag.name                             AS group_name,
  ag.nature,
  a.opening_balance_paise,
  a.is_debit_balance                  AS opening_is_debit,
  COALESCE(SUM(je.debit_paise),  0)   AS period_debit,
  COALESCE(SUM(je.credit_paise), 0)   AS period_credit,
  CASE WHEN a.is_debit_balance = 1
    THEN a.opening_balance_paise + COALESCE(SUM(je.debit_paise),0) - COALESCE(SUM(je.credit_paise),0)
    ELSE a.opening_balance_paise - COALESCE(SUM(je.debit_paise),0) + COALESCE(SUM(je.credit_paise),0)
  END                                 AS closing_balance,
  a.is_debit_balance                  AS closing_is_debit
FROM accounts a
JOIN account_groups ag ON a.group_id = ag.id
LEFT JOIN journal_entries je ON je.account_id = a.id
WHERE a.active = 1
GROUP BY a.id;
