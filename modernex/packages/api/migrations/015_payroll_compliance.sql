-- ============================================================
-- Migration 015: Complete Payroll Compliance + MSME + Reports
-- Indian labour law: Gratuity, Bonus, LWF (TN), Leave Mgmt,
-- TDS Sec 192 declarations, EPF/ESI challan tracking, MSME register
-- ============================================================

-- ── Leave Management ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leave_types (
  id        INTEGER PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,          -- CL, EL, SL, LOP, ML, PL
  name      TEXT NOT NULL,
  annual_quota   INTEGER NOT NULL DEFAULT 0,   -- days per year
  carry_forward  INTEGER NOT NULL DEFAULT 0,   -- days allowed to carry forward
  encashable     INTEGER NOT NULL DEFAULT 0,   -- 0/1 (EL encashable)
  paid           INTEGER NOT NULL DEFAULT 1,   -- 0=unpaid (LOP)
  active         INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO leave_types (code, name, annual_quota, carry_forward, encashable, paid) VALUES
  ('CL',  'Casual Leave',       12, 0,  0, 1),
  ('EL',  'Earned Leave',       15, 30, 1, 1),  -- carry forward up to 30 days
  ('SL',  'Sick Leave',         12, 0,  0, 1),
  ('ML',  'Maternity Leave',    182, 0, 0, 1),  -- Maternity Benefit Act 2017
  ('PL',  'Privilege Leave',    18, 45, 1, 1),  -- for factories (Factories Act)
  ('LOP', 'Loss of Pay',        0,  0,  0, 0);  -- unpaid

CREATE TABLE IF NOT EXISTS leave_balances (
  id          INTEGER PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_code  TEXT NOT NULL,
  year        INTEGER NOT NULL,            -- calendar year
  opening     REAL NOT NULL DEFAULT 0,
  accrued     REAL NOT NULL DEFAULT 0,
  taken       REAL NOT NULL DEFAULT 0,
  encashed    REAL NOT NULL DEFAULT 0,
  closing     REAL GENERATED ALWAYS AS (opening + accrued - taken - encashed) STORED,
  UNIQUE(employee_id, leave_code, year)
);

CREATE TABLE IF NOT EXISTS leave_applications (
  id            INTEGER PRIMARY KEY,
  employee_id   TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_code    TEXT NOT NULL,
  from_date     TEXT NOT NULL,
  to_date       TEXT NOT NULL,
  days          REAL NOT NULL,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  approved_by   TEXT,
  approved_at   TEXT,
  reject_reason TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leave_app_emp ON leave_applications(employee_id, from_date);

-- ── Gratuity (Payment of Gratuity Act 1972) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS gratuity_records (
  id              INTEGER PRIMARY KEY,
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  calc_date       TEXT NOT NULL,           -- date of calculation (resignation/retirement)
  joining_date    TEXT NOT NULL,
  leaving_date    TEXT,
  years_service   REAL NOT NULL,           -- incl. fraction
  basic_at_exit   INTEGER NOT NULL,        -- paise
  rate_per_year   INTEGER NOT NULL DEFAULT 1500, -- 15/26 × 26 = 15 weeks, standard = 15 days
  gratuity_paise  INTEGER NOT NULL,        -- 15/26 × basic × years (max ₹20L)
  taxable_paise   INTEGER NOT NULL DEFAULT 0,  -- amount over exemption
  status          TEXT NOT NULL DEFAULT 'computed' CHECK(status IN ('computed','approved','paid')),
  paid_date       TEXT,
  notes           TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Bonus (Payment of Bonus Act 1965) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bonus_runs (
  id              INTEGER PRIMARY KEY,
  fy              TEXT NOT NULL UNIQUE,    -- e.g. '2025-26'
  bonus_rate_pct  REAL NOT NULL DEFAULT 8.33,  -- 8.33% min, 20% max
  calc_basis      TEXT NOT NULL DEFAULT 'basic',  -- 'basic' or 'gross'
  status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','processed','paid')),
  total_paise     INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bonus_entries (
  id              INTEGER PRIMARY KEY,
  run_id          INTEGER NOT NULL REFERENCES bonus_runs(id) ON DELETE CASCADE,
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  monthly_basic   INTEGER NOT NULL,        -- paise (monthly)
  annual_basic    INTEGER NOT NULL,        -- paise (annual = monthly × months_worked)
  months_worked   INTEGER NOT NULL DEFAULT 12,
  bonus_paise     INTEGER NOT NULL,
  eligible        INTEGER NOT NULL DEFAULT 1,  -- 0 if basic > ₹21,000 threshold
  paid            INTEGER NOT NULL DEFAULT 0,
  UNIQUE(run_id, employee_id)
);

-- ── Labour Welfare Fund — Tamil Nadu ─────────────────────────────────────────
-- TN LWF Act 1982: ₹20 employee + ₹40 employer deducted in June & December

CREATE TABLE IF NOT EXISTS lwf_contributions (
  id              INTEGER PRIMARY KEY,
  half_year       TEXT NOT NULL,           -- e.g. '2025-H1' (Jan-Jun) or '2025-H2' (Jul-Dec)
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  employee_paise  INTEGER NOT NULL DEFAULT 2000,   -- ₹20
  employer_paise  INTEGER NOT NULL DEFAULT 4000,   -- ₹40
  challan_no      TEXT,
  paid            INTEGER NOT NULL DEFAULT 0,
  paid_date       TEXT,
  UNIQUE(half_year, employee_id)
);

CREATE TABLE IF NOT EXISTS lwf_challan_batches (
  id              INTEGER PRIMARY KEY,
  half_year       TEXT NOT NULL UNIQUE,
  challan_no      TEXT,
  challan_date    TEXT,
  total_employee_paise  INTEGER NOT NULL DEFAULT 0,
  total_employer_paise  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','paid')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── TDS on Salary — Section 192 Investment Declarations ──────────────────────

CREATE TABLE IF NOT EXISTS employee_tax_declarations (
  id                        INTEGER PRIMARY KEY,
  employee_id               TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fy                        TEXT NOT NULL,             -- '2025-26'
  -- Exempt components
  hra_city_type             TEXT DEFAULT 'non-metro',  -- metro/non-metro (for HRA 50%/40% calc)
  hra_rent_paid_annual      INTEGER NOT NULL DEFAULT 0, -- paise
  -- Chapter VI-A deductions
  sec_80c_paise             INTEGER NOT NULL DEFAULT 0, -- EPF + LIC + ELSS + PPF (max ₹1,50,000)
  sec_80ccd1b_paise         INTEGER NOT NULL DEFAULT 0, -- NPS self (max ₹50,000)
  sec_80d_self_paise        INTEGER NOT NULL DEFAULT 0, -- Medical insurance self+family (max ₹25,000)
  sec_80d_parents_paise     INTEGER NOT NULL DEFAULT 0, -- Parents insurance (max ₹25,000; ₹50,000 if senior)
  sec_80e_paise             INTEGER NOT NULL DEFAULT 0, -- Education loan interest
  sec_80g_paise             INTEGER NOT NULL DEFAULT 0, -- Donations (50%/100% qualifying)
  sec_80tta_paise           INTEGER NOT NULL DEFAULT 0, -- Savings account interest (max ₹10,000)
  -- Income from house property
  housing_loan_interest_paise INTEGER NOT NULL DEFAULT 0, -- Sec 24b (max ₹2,00,000 self-occupied)
  -- Other income to be added
  other_income_paise        INTEGER NOT NULL DEFAULT 0,
  -- Computed at declaration time
  standard_deduction_paise  INTEGER NOT NULL DEFAULT 5000000, -- Sec 16 ₹50,000 (fixed)
  total_declared_at         TEXT,
  updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(employee_id, fy)
);

-- ── EPF / ESI Challan Tracking ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS epf_challans (
  id              INTEGER PRIMARY KEY,
  month           TEXT NOT NULL,           -- YYYY-MM
  trrn            TEXT,                    -- Transaction Reference Number
  challan_date    TEXT,
  total_wages_paise     INTEGER NOT NULL DEFAULT 0,
  employee_pf_paise     INTEGER NOT NULL DEFAULT 0,   -- 12%
  employer_epf_paise    INTEGER NOT NULL DEFAULT 0,   -- 3.67% (net after EPS)
  eps_paise             INTEGER NOT NULL DEFAULT 0,   -- 8.33% (employer EPS)
  edli_paise            INTEGER NOT NULL DEFAULT 0,   -- 0.5% EDLI
  admin_charge_paise    INTEGER NOT NULL DEFAULT 0,   -- 0.5% admin
  total_paise           INTEGER NOT NULL DEFAULT 0,
  ecr_file_path         TEXT,                         -- path to ECR file
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','paid')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month)
);

CREATE TABLE IF NOT EXISTS esi_challans (
  id              INTEGER PRIMARY KEY,
  month           TEXT NOT NULL,
  challan_no      TEXT,
  challan_date    TEXT,
  total_wages_paise     INTEGER NOT NULL DEFAULT 0,
  employee_esi_paise    INTEGER NOT NULL DEFAULT 0,   -- 0.75%
  employer_esi_paise    INTEGER NOT NULL DEFAULT 0,   -- 3.25%
  total_paise           INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','paid')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month)
);

CREATE TABLE IF NOT EXISTS pt_challans_tn (
  id              INTEGER PRIMARY KEY,
  month           TEXT NOT NULL,
  challan_no      TEXT,
  challan_date    TEXT,
  employee_count  INTEGER NOT NULL DEFAULT 0,
  total_pt_paise  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','paid')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(month)
);

-- ── MSME Payment Register ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS msme_interest_log (
  id              INTEGER PRIMARY KEY,
  vendor_id       TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  po_id           TEXT,
  invoice_ref     TEXT,
  invoice_date    TEXT NOT NULL,
  due_date        TEXT NOT NULL,           -- invoice_date + 45 days
  payment_date    TEXT,                    -- NULL if still outstanding
  amount_paise    INTEGER NOT NULL,
  overdue_days    INTEGER,                 -- computed at record time
  interest_rate_pct REAL NOT NULL DEFAULT 27.0, -- 3× RBI bank rate (9% × 3 = 27% per MSMED Act Sec 16)
  interest_paise  INTEGER NOT NULL DEFAULT 0,
  settled         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msme_int_vendor ON msme_interest_log(vendor_id, invoice_date);

-- ── Budget Management (Tally-like) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS budgets (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  fy              TEXT NOT NULL,
  account_id      INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  account_group_id INTEGER REFERENCES account_groups(id) ON DELETE CASCADE,
  period_type     TEXT NOT NULL DEFAULT 'monthly' CHECK(period_type IN ('monthly','quarterly','annual')),
  budget_paise    INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fy, account_id, period_type)
);

-- ── Cost Centre / Profit Centre ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_centres (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL DEFAULT 'cost' CHECK(type IN ('cost','profit','investment')),
  parent_id       INTEGER REFERENCES cost_centres(id),
  active          INTEGER NOT NULL DEFAULT 1,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS journal_entry_cc (
  entry_id        INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  cost_centre_id  INTEGER NOT NULL REFERENCES cost_centres(id) ON DELETE RESTRICT,
  amount_paise    INTEGER NOT NULL,
  PRIMARY KEY(entry_id, cost_centre_id)
);

-- Seed default cost centres
INSERT OR IGNORE INTO cost_centres (name, type) VALUES
  ('Quarry Operations', 'cost'),
  ('Cutting & Polishing', 'cost'),
  ('Sales', 'profit'),
  ('Transport', 'cost'),
  ('Administration', 'cost'),
  ('Head Office', 'cost');

-- ── Recurring Vouchers (Standing Instructions) ───────────────────────────────

CREATE TABLE IF NOT EXISTS recurring_vouchers (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  voucher_type    TEXT NOT NULL,
  narration       TEXT,
  frequency       TEXT NOT NULL CHECK(frequency IN ('monthly','quarterly','annual')),
  next_due        TEXT NOT NULL,
  last_posted     TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_voucher_lines (
  id              INTEGER PRIMARY KEY,
  rv_id           INTEGER NOT NULL REFERENCES recurring_vouchers(id) ON DELETE CASCADE,
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  debit_paise     INTEGER NOT NULL DEFAULT 0,
  credit_paise    INTEGER NOT NULL DEFAULT 0,
  narration       TEXT
);

-- ── Interest Calculation on Outstanding ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS interest_calc_log (
  id              INTEGER PRIMARY KEY,
  party_type      TEXT NOT NULL CHECK(party_type IN ('customer','vendor')),
  party_id        TEXT NOT NULL,
  invoice_id      TEXT,
  calc_date       TEXT NOT NULL,
  outstanding_paise INTEGER NOT NULL,
  overdue_days    INTEGER NOT NULL,
  rate_pct        REAL NOT NULL,
  interest_paise  INTEGER NOT NULL,
  journal_voucher_id INTEGER,             -- if posted to ledger
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Views for Compliance Reports ─────────────────────────────────────────────

-- Cash Book view (all cash transactions from journal_entries)
DROP VIEW IF EXISTS v_cash_book;
CREATE VIEW v_cash_book AS
SELECT
  jv.date,
  jv.id AS voucher_id,
  jv.voucher_type,
  jv.narration,
  CASE WHEN je.debit_paise > 0 THEN 'Receipt' ELSE 'Payment' END AS direction,
  je.debit_paise  AS inflow_paise,
  je.credit_paise AS outflow_paise,
  a.name AS account_name
FROM journal_vouchers jv
JOIN journal_entries je ON je.voucher_id = jv.id
JOIN accounts a ON a.id = je.account_id
JOIN account_groups ag ON ag.id = a.group_id
WHERE ag.nature = 'asset' AND a.name LIKE '%Cash%'
ORDER BY jv.date, jv.id;

-- Bank Book view (all bank transactions)
DROP VIEW IF EXISTS v_bank_book;
CREATE VIEW v_bank_book AS
SELECT
  jv.date,
  jv.id AS voucher_id,
  jv.voucher_type,
  jv.narration,
  CASE WHEN je.debit_paise > 0 THEN 'Receipt' ELSE 'Payment' END AS direction,
  je.debit_paise  AS inflow_paise,
  je.credit_paise AS outflow_paise,
  a.name AS account_name
FROM journal_vouchers jv
JOIN journal_entries je ON je.voucher_id = jv.id
JOIN accounts a ON a.id = je.account_id
JOIN account_groups ag ON ag.id = a.group_id
WHERE ag.name IN ('Bank Accounts', 'Bank OD Accounts')
ORDER BY jv.date, jv.id;

-- AR Aging view
DROP VIEW IF EXISTS v_ar_aging;
CREATE VIEW v_ar_aging AS
SELECT
  i.id, i.date, i.customer_id, i.customer_name, i.customer_gstin,
  i.total_paise, i.taxable_paise,
  CAST(julianday('now') - julianday(i.date) AS INTEGER) AS age_days,
  CASE
    WHEN julianday('now') - julianday(i.date) <= 30 THEN '0-30'
    WHEN julianday('now') - julianday(i.date) <= 60 THEN '31-60'
    WHEN julianday('now') - julianday(i.date) <= 90 THEN '61-90'
    WHEN julianday('now') - julianday(i.date) <= 120 THEN '91-120'
    ELSE '120+'
  END AS aging_bucket,
  c.credit_limit_paise, c.interest_rate_pct
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.paid = 0 AND i.status != 'cancelled';

-- AP Aging view
DROP VIEW IF EXISTS v_ap_aging;
CREATE VIEW v_ap_aging AS
SELECT
  po.id, po.date, po.vendor_id,
  v.name AS vendor_name, v.gstin AS vendor_gstin,
  v.msme AS msme_registered, v.msme_number,
  po.total_paise,
  CAST(julianday('now') - julianday(po.date) AS INTEGER) AS age_days,
  CASE
    WHEN julianday('now') - julianday(po.date) <= 30 THEN '0-30'
    WHEN julianday('now') - julianday(po.date) <= 60 THEN '31-60'
    WHEN julianday('now') - julianday(po.date) <= 90 THEN '61-90'
    WHEN julianday('now') - julianday(po.date) <= 120 THEN '91-120'
    ELSE '120+'
  END AS aging_bucket,
  CASE WHEN v.msme = 1
    THEN CAST(julianday('now') - julianday(po.date) AS INTEGER) - 45
    ELSE NULL
  END AS msme_overdue_days
FROM purchase_orders po
JOIN vendors v ON v.id = po.vendor_id
WHERE po.status NOT IN ('cancelled','received');
