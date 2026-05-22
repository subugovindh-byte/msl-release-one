-- ════════════════════════════════════════════════════════
-- MODERNEX STONES — Database Schema v1
-- SQLite with WAL · all monetary values in PAISE (integer)
-- ════════════════════════════════════════════════════════

-- ─── USERS ───
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin','accounts','yard','sales')),
  active          INTEGER NOT NULL DEFAULT 1,
  last_login      TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ─── CUSTOMERS ───
CREATE TABLE IF NOT EXISTS customers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  gstin           TEXT,
  state           TEXT NOT NULL,
  address         TEXT,
  contact         TEXT,
  email           TEXT,
  credit_days     INTEGER NOT NULL DEFAULT 0,
  outstanding_paise INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      TEXT,
  updated_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_gstin ON customers(gstin);

-- ─── VENDORS ───
CREATE TABLE IF NOT EXISTS vendors (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  gstin           TEXT,
  state           TEXT NOT NULL,
  contact         TEXT,
  type            TEXT NOT NULL CHECK (type IN ('Quarry','Broker','Transporter','Other')),
  msme            INTEGER NOT NULL DEFAULT 0,
  msme_number     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      TEXT,
  updated_by      TEXT
);

-- ─── SLABS (inventory) ───
CREATE TABLE IF NOT EXISTS slabs (
  id              TEXT PRIMARY KEY,
  lot_id          TEXT NOT NULL,
  variety         TEXT NOT NULL,
  size            TEXT NOT NULL,       -- e.g. "260×160"
  thickness_mm    INTEGER NOT NULL,
  grade           TEXT NOT NULL CHECK (grade IN ('A+','A','B')),
  sqft            REAL NOT NULL,
  rate_paise      INTEGER NOT NULL,
  stock           INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_slabs_variety ON slabs(variety);
CREATE INDEX IF NOT EXISTS idx_slabs_lot ON slabs(lot_id);

-- ─── PURCHASE ORDERS ───
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                 TEXT PRIMARY KEY,
  date               TEXT NOT NULL DEFAULT (date('now')),
  vendor_id          TEXT NOT NULL REFERENCES vendors(id),
  variety            TEXT NOT NULL,
  blocks             INTEGER NOT NULL,
  cft                REAL NOT NULL,
  rate_per_cft_paise INTEGER NOT NULL,
  transport_paise    INTEGER NOT NULL DEFAULT 0,
  taxable_paise      INTEGER NOT NULL,
  gst_paise          INTEGER NOT NULL,
  total_paise        INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','approved','received','cancelled')),
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_by         TEXT,
  updated_by         TEXT
);

CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(date);

-- ─── PRODUCTION JOBS ───
CREATE TABLE IF NOT EXISTS production_jobs (
  id                 TEXT PRIMARY KEY,
  lot_id             TEXT NOT NULL,
  variety            TEXT NOT NULL,
  stage              TEXT NOT NULL CHECK (stage IN ('split','cut','polish','done')),
  date               TEXT NOT NULL DEFAULT (date('now')),
  labour_paise       INTEGER NOT NULL,
  power_paise        INTEGER NOT NULL DEFAULT 0,
  consumables_paise  INTEGER NOT NULL DEFAULT 0,
  yield_pct          REAL,
  status             TEXT NOT NULL DEFAULT 'In Progress',
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_by         TEXT,
  updated_by         TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_lot ON production_jobs(lot_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON production_jobs(status);

-- ─── INVOICES ───
CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  date            TEXT NOT NULL DEFAULT (date('now')),
  customer_id     TEXT NOT NULL REFERENCES customers(id),
  customer_name   TEXT NOT NULL,      -- denormalised for historical accuracy
  customer_state  TEXT NOT NULL,
  customer_gstin  TEXT,
  discount_pct    REAL NOT NULL DEFAULT 0,
  gross_paise     INTEGER NOT NULL,
  discount_paise  INTEGER NOT NULL DEFAULT 0,
  taxable_paise   INTEGER NOT NULL,
  cgst_paise      INTEGER NOT NULL DEFAULT 0,
  sgst_paise      INTEGER NOT NULL DEFAULT 0,
  igst_paise      INTEGER NOT NULL DEFAULT 0,
  total_paise     INTEGER NOT NULL,
  paid            INTEGER NOT NULL DEFAULT 0,
  paid_date       TEXT,
  due_date        TEXT,
  irn             TEXT,
  eway_bill       TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      TEXT,
  updated_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoices_paid ON invoices(paid);

-- ─── INVOICE ITEMS ───
CREATE TABLE IF NOT EXISTS invoice_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id      TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  slab_id         TEXT,
  variety         TEXT NOT NULL,
  size            TEXT,
  thickness_mm    INTEGER,
  grade           TEXT,
  sqft            REAL NOT NULL,
  rate_paise      INTEGER NOT NULL,
  qty             INTEGER NOT NULL,
  line_total_paise INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_invoice ON invoice_items(invoice_id);

-- ─── PAYMENTS ───
CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  date            TEXT NOT NULL DEFAULT (date('now')),
  type            TEXT NOT NULL CHECK (type IN ('receipt','payment')),
  invoice_id      TEXT REFERENCES invoices(id),
  po_id           TEXT REFERENCES purchase_orders(id),
  party           TEXT NOT NULL,
  amount_paise    INTEGER NOT NULL,
  mode            TEXT NOT NULL,
  utr             TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- ─── BACKUPS REGISTRY ───
CREATE TABLE IF NOT EXISTS backups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              TEXT NOT NULL DEFAULT (datetime('now')),
  trigger         TEXT NOT NULL CHECK (trigger IN ('scheduled','event','manual','migration')),
  blob_path       TEXT NOT NULL,
  size_bytes      INTEGER,
  sha256          TEXT,
  ok              INTEGER NOT NULL DEFAULT 1,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_backups_ts ON backups(ts);

-- ─── AUDIT LOG (append-only, IT Act 2000) ───
CREATE TABLE IF NOT EXISTS audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              TEXT NOT NULL DEFAULT (datetime('now')),
  user_id         INTEGER,
  username        TEXT,
  action          TEXT NOT NULL,    -- e.g. "INVOICE_CREATE"
  table_name      TEXT,
  record_id       TEXT,
  before_json     TEXT,
  after_json      TEXT,
  ip_address      TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(table_name, record_id);

-- ─── REFRESH TOKENS (for JWT rotation) ───
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at       TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT NOT NULL,
  revoked         INTEGER NOT NULL DEFAULT 0,
  ip_address      TEXT
);

CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);

-- ─── UPDATE TRIGGERS (auto-set updated_at) ───
CREATE TRIGGER IF NOT EXISTS trg_users_updated AFTER UPDATE ON users
BEGIN UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_customers_updated AFTER UPDATE ON customers
BEGIN UPDATE customers SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_vendors_updated AFTER UPDATE ON vendors
BEGIN UPDATE vendors SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_slabs_updated AFTER UPDATE ON slabs
BEGIN UPDATE slabs SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_po_updated AFTER UPDATE ON purchase_orders
BEGIN UPDATE purchase_orders SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_jobs_updated AFTER UPDATE ON production_jobs
BEGIN UPDATE production_jobs SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_invoices_updated AFTER UPDATE ON invoices
BEGIN UPDATE invoices SET updated_at = datetime('now') WHERE id = NEW.id; END;

-- ─── MIGRATIONS TRACKING ───
CREATE TABLE IF NOT EXISTS schema_migrations (
  version         INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  applied_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
