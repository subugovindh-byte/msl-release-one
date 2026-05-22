-- ════════════════════════════════════════════════════════════════
-- Migration 013: GST compliance — filing periods, ITC ledger, reconciliation
-- ════════════════════════════════════════════════════════════════

-- ─── 1. GST Filing Periods tracker ───
CREATE TABLE IF NOT EXISTS gst_filing_periods (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  fy           TEXT NOT NULL,             -- e.g. '2025-26'
  period       TEXT NOT NULL,             -- 'Apr-2025', 'May-2025', ...
  return_type  TEXT NOT NULL,             -- 'GSTR1', 'GSTR3B', 'GSTR9'
  due_date     TEXT NOT NULL,
  filed_date   TEXT,
  filed_by     TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK(status IN ('pending','filed','revised','nil')),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE UNIQUE INDEX idx_gst_period_unique ON gst_filing_periods(fy, period, return_type);


-- ─── 2. ITC (Input Tax Credit) Ledger ───
-- Tracks every claim and utilisation of ITC for reconciliation
CREATE TABLE IF NOT EXISTS itc_ledger (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT NOT NULL,
  entry_type      TEXT NOT NULL CHECK(entry_type IN ('claim','utilise','reverse','lapse')),
  source          TEXT NOT NULL CHECK(source IN ('purchase_order','manual','gst_portal')),
  source_id       TEXT,                      -- po_id or manual ref
  igst_paise      INTEGER NOT NULL DEFAULT 0,
  cgst_paise      INTEGER NOT NULL DEFAULT 0,
  sgst_paise      INTEGER NOT NULL DEFAULT 0,
  total_paise     INTEGER NOT NULL DEFAULT 0,
  fy              TEXT NOT NULL,
  period          TEXT NOT NULL,             -- 'Apr-2025'
  notes           TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_itc_date   ON itc_ledger(date);
CREATE INDEX idx_itc_period ON itc_ledger(fy, period);

-- ─── 3. Document sequence counters (one row per document type per FY) ───
-- Ensures sequential, gap-free numbering required for GST
CREATE TABLE IF NOT EXISTS doc_sequences (
  doc_type  TEXT NOT NULL,    -- 'invoice', 'credit_note', 'debit_note', 'challan', 'grn', 'po'
  fy        TEXT NOT NULL,    -- '2025-26'
  last_seq  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, fy)
);

-- Seed current FY sequences
INSERT OR IGNORE INTO doc_sequences (doc_type, fy, last_seq) VALUES
  ('invoice',     '2025-26', 0),
  ('credit_note', '2025-26', 0),
  ('debit_note',  '2025-26', 0),
  ('challan',     '2025-26', 0),
  ('grn',         '2025-26', 0),
  ('po',          '2025-26', 0);

-- ─── 4. Views for easy report queries ───

-- Day book view: chronological all-transactions log for auditors
CREATE VIEW IF NOT EXISTS v_day_book AS
SELECT
  date,
  'Invoice'   AS doc_type,
  id          AS doc_no,
  customer_name AS party,
  NULL        AS dr_paise,
  total_paise AS cr_paise,
  'Sales'     AS ledger_head,
  notes
FROM invoices
UNION ALL
SELECT
  date,
  'Payment Received' AS doc_type,
  id,
  party,
  NULL,
  amount_paise,
  'Collections',
  notes
FROM payments WHERE type = 'receipt'
UNION ALL
SELECT
  date,
  'Purchase Order' AS doc_type,
  id,
  (SELECT name FROM vendors WHERE id = vendor_id),
  total_paise,
  NULL,
  'Purchases',
  notes
FROM purchase_orders
UNION ALL
SELECT
  date,
  'Vendor Payment' AS doc_type,
  id,
  party,
  amount_paise,
  NULL,
  'Payments',
  notes
FROM payments WHERE type = 'payment'
ORDER BY date DESC, doc_type;

-- GSTR-1 B2B invoice view
CREATE VIEW IF NOT EXISTS v_gstr1_b2b AS
SELECT
  i.id          AS invoice_no,
  i.date,
  i.customer_name,
  i.customer_gstin,
  i.customer_state,
  CASE WHEN i.customer_state = (SELECT home_state FROM company_details WHERE id=1)
       THEN 'Intrastate' ELSE 'Interstate' END AS supply_type,
  i.taxable_paise,
  i.cgst_paise,
  i.sgst_paise,
  i.igst_paise,
  i.total_paise
FROM invoices i
WHERE i.customer_gstin IS NOT NULL AND i.customer_gstin != ''
  AND (i.status IS NULL OR i.status != 'cancelled');

-- GSTR-1 B2C view (unregistered customers)
CREATE VIEW IF NOT EXISTS v_gstr1_b2c AS
SELECT
  i.id          AS invoice_no,
  i.date,
  i.customer_name,
  i.customer_state,
  i.taxable_paise,
  i.cgst_paise,
  i.sgst_paise,
  i.igst_paise,
  i.total_paise
FROM invoices i
WHERE (i.customer_gstin IS NULL OR i.customer_gstin = '')
  AND (i.status IS NULL OR i.status != 'cancelled');

-- HSN summary view for GSTR-1 Table 12
CREATE VIEW IF NOT EXISTS v_hsn_summary AS
SELECT
  ii.hsn,
  ii.uom,
  SUM(ii.qty)               AS total_qty,
  SUM(ii.line_total_paise)  AS taxable_paise,
  SUM(CASE WHEN i.customer_state = (SELECT home_state FROM company_details WHERE id=1)
           THEN ROUND(ii.line_total_paise * CASE WHEN ii.hsn='2517' THEN 0.025 ELSE 0.09 END)
           ELSE 0 END)      AS cgst_paise,
  SUM(CASE WHEN i.customer_state = (SELECT home_state FROM company_details WHERE id=1)
           THEN ROUND(ii.line_total_paise * CASE WHEN ii.hsn='2517' THEN 0.025 ELSE 0.09 END)
           ELSE 0 END)      AS sgst_paise,
  SUM(CASE WHEN i.customer_state != (SELECT home_state FROM company_details WHERE id=1)
           THEN ROUND(ii.line_total_paise * CASE WHEN ii.hsn='2517' THEN 0.05 ELSE 0.18 END)
           ELSE 0 END)      AS igst_paise
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
WHERE (i.status IS NULL OR i.status != 'cancelled')
GROUP BY ii.hsn, ii.uom;

-- Purchase register view (for ITC and auditor)
CREATE VIEW IF NOT EXISTS v_purchase_register AS
SELECT
  po.id         AS po_no,
  po.date,
  v.name        AS vendor_name,
  v.gstin       AS vendor_gstin,
  v.state       AS vendor_state,
  po.variety,
  po.blocks,
  po.cft,
  po.taxable_paise,
  po.gst_paise,
  po.total_paise,
  ROUND(po.gst_paise / 2.0) AS cgst_paise,
  ROUND(po.gst_paise / 2.0) AS sgst_paise,
  po.status
FROM purchase_orders po
JOIN vendors v ON v.id = po.vendor_id;

-- Sales register view (for auditor)
CREATE VIEW IF NOT EXISTS v_sales_register AS
SELECT
  i.id          AS invoice_no,
  i.date,
  i.customer_name,
  i.customer_gstin,
  i.customer_state,
  i.taxable_paise,
  i.cgst_paise,
  i.sgst_paise,
  i.igst_paise,
  i.total_paise,
  CASE WHEN i.paid = 1 THEN 'Paid' ELSE 'Outstanding' END AS payment_status
FROM invoices i
WHERE (i.status IS NULL OR i.status != 'cancelled')
ORDER BY i.date;
