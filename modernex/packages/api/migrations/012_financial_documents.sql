-- ════════════════════════════════════════════════════════════════
-- Migration 012: Financial documents — DN/CN, transport bills, GRN, delivery challans
-- ════════════════════════════════════════════════════════════════

-- ─── 1. Debit / Credit Notes (corrections to invoices) ───
CREATE TABLE IF NOT EXISTS debit_credit_notes (
  id              TEXT PRIMARY KEY,           -- DCN-2025-0001
  type            TEXT NOT NULL CHECK(type IN ('debit','credit')),
  ref_invoice_id  TEXT REFERENCES invoices(id) ON DELETE RESTRICT,
  customer_id     TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name   TEXT NOT NULL,
  customer_gstin  TEXT,
  customer_state  TEXT NOT NULL,
  date            TEXT NOT NULL DEFAULT (date('now')),
  reason          TEXT NOT NULL,             -- short reason code or free text
  taxable_paise   INTEGER NOT NULL DEFAULT 0,
  cgst_paise      INTEGER NOT NULL DEFAULT 0,
  sgst_paise      INTEGER NOT NULL DEFAULT 0,
  igst_paise      INTEGER NOT NULL DEFAULT 0,
  total_paise     INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','cancelled')),
  created_by      TEXT NOT NULL,
  updated_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_dcn_customer   ON debit_credit_notes(customer_id);
CREATE INDEX idx_dcn_invoice    ON debit_credit_notes(ref_invoice_id);
CREATE INDEX idx_dcn_date       ON debit_credit_notes(date);

CREATE TRIGGER dcn_updated_at
  AFTER UPDATE ON debit_credit_notes FOR EACH ROW BEGIN
    UPDATE debit_credit_notes SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id;
  END;

-- ─── 2. Transport Bills (separate from PO — own vendor + payment tracking) ───
ALTER TABLE purchase_orders ADD COLUMN transport_vendor_id   TEXT REFERENCES vendors(id);
ALTER TABLE purchase_orders ADD COLUMN transport_bill_no     TEXT;
ALTER TABLE purchase_orders ADD COLUMN transport_bill_date   TEXT;
ALTER TABLE purchase_orders ADD COLUMN delivered_at_site     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN delivered_date        TEXT;
ALTER TABLE purchase_orders ADD COLUMN vehicle_no            TEXT;
ALTER TABLE purchase_orders ADD COLUMN lr_no                 TEXT;  -- Lorry Receipt number

-- ─── 3. Add category to payments (distinguishes quarry vs transport payments) ───
ALTER TABLE payments ADD COLUMN category TEXT NOT NULL DEFAULT 'general'
  CHECK(category IN ('general','quarry','transport','invoice','refund','advance'));

-- ─── 4. Goods Receipt Notes (GRN) — formal receipt on PO "received" status ───
CREATE TABLE IF NOT EXISTS purchase_order_receipts (
  id              TEXT PRIMARY KEY,          -- GRN-2025-0001
  po_id           TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  date            TEXT NOT NULL DEFAULT (date('now')),
  received_by     TEXT NOT NULL,
  blocks_received INTEGER NOT NULL,
  cft_received    REAL NOT NULL,
  condition_note  TEXT,                      -- any damage / short delivery note
  qc_pass         INTEGER NOT NULL DEFAULT 1,-- 1=pass, 0=hold/fail
  qc_notes        TEXT,
  vehicle_no      TEXT,
  lr_no           TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_grn_po ON purchase_order_receipts(po_id);
CREATE INDEX idx_grn_date ON purchase_order_receipts(date);

-- ─── 5. Delivery Challans ───
CREATE TABLE IF NOT EXISTS delivery_challans (
  id                TEXT PRIMARY KEY,       -- DC-2025-0001
  invoice_id        TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id       TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name     TEXT NOT NULL,
  delivery_address  TEXT,
  date              TEXT NOT NULL DEFAULT (date('now')),
  vehicle_no        TEXT,
  driver_name       TEXT,
  driver_phone      TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','dispatched','delivered','returned')),
  dispatched_at     TEXT,
  delivered_at      TEXT,
  notes             TEXT,
  created_by        TEXT NOT NULL,
  updated_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS delivery_challan_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  challan_id      TEXT NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  product_id      TEXT REFERENCES products(id) ON DELETE SET NULL,
  description     TEXT NOT NULL,
  qty             REAL NOT NULL,
  uom             TEXT NOT NULL DEFAULT 'sqft',
  notes           TEXT
);

CREATE INDEX idx_dc_invoice  ON delivery_challans(invoice_id);
CREATE INDEX idx_dc_customer ON delivery_challans(customer_id);
CREATE INDEX idx_dc_date     ON delivery_challans(date);

CREATE TRIGGER dc_updated_at
  AFTER UPDATE ON delivery_challans FOR EACH ROW BEGIN
    UPDATE delivery_challans SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id;
  END;

-- ─── 6. Credit limits on customers ───
ALTER TABLE customers ADD COLUMN credit_limit_paise INTEGER NOT NULL DEFAULT 0;  -- 0 = unlimited
ALTER TABLE customers ADD COLUMN payment_terms TEXT NOT NULL DEFAULT 'credit';    -- cash/credit/advance
