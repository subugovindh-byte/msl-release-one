-- Migration 040: generalise the price master to all finished-goods kinds
--
-- Part A — fix latent-broken GST views. Four views (created in 013) filter on
-- invoices.status, a column that never existed, so they only error when the
-- schema changes (e.g. a table rebuild). Recreate them without that phantom
-- filter — invoices have no status column (a deleted invoice simply isn't in the
-- table), so the intent ("exclude cancelled") is a no-op here.

DROP VIEW IF EXISTS v_gstr1_b2b;
CREATE VIEW v_gstr1_b2b AS
SELECT i.id AS invoice_no, i.date, i.customer_name, i.customer_gstin, i.customer_state,
  CASE WHEN i.customer_state = (SELECT home_state FROM company_details WHERE id=1)
       THEN 'Intrastate' ELSE 'Interstate' END AS supply_type,
  i.taxable_paise, i.cgst_paise, i.sgst_paise, i.igst_paise, i.total_paise
FROM invoices i
WHERE i.customer_gstin IS NOT NULL AND i.customer_gstin != '';

DROP VIEW IF EXISTS v_gstr1_b2c;
CREATE VIEW v_gstr1_b2c AS
SELECT i.id AS invoice_no, i.date, i.customer_name, i.customer_state,
  i.taxable_paise, i.cgst_paise, i.sgst_paise, i.igst_paise, i.total_paise
FROM invoices i
WHERE (i.customer_gstin IS NULL OR i.customer_gstin = '');

DROP VIEW IF EXISTS v_hsn_summary;
CREATE VIEW v_hsn_summary AS
SELECT ii.hsn, ii.uom,
  SUM(ii.qty) AS total_qty,
  SUM(ii.line_total_paise) AS taxable_paise,
  SUM(CASE WHEN i.customer_state = (SELECT home_state FROM company_details WHERE id=1)
           THEN ROUND(ii.line_total_paise * CASE WHEN ii.hsn='2517' THEN 0.025 ELSE 0.09 END) ELSE 0 END) AS cgst_paise,
  SUM(CASE WHEN i.customer_state = (SELECT home_state FROM company_details WHERE id=1)
           THEN ROUND(ii.line_total_paise * CASE WHEN ii.hsn='2517' THEN 0.025 ELSE 0.09 END) ELSE 0 END) AS sgst_paise,
  SUM(CASE WHEN i.customer_state != (SELECT home_state FROM company_details WHERE id=1)
           THEN ROUND(ii.line_total_paise * CASE WHEN ii.hsn='2517' THEN 0.05 ELSE 0.18 END) ELSE 0 END) AS igst_paise
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
GROUP BY ii.hsn, ii.uom;

DROP VIEW IF EXISTS v_sales_register;
CREATE VIEW v_sales_register AS
SELECT i.id AS invoice_no, i.date, i.customer_name, i.customer_gstin, i.customer_state,
  i.taxable_paise, i.cgst_paise, i.sgst_paise, i.igst_paise, i.total_paise,
  CASE WHEN i.paid = 1 THEN 'Paid' ELSE 'Outstanding' END AS payment_status
FROM invoices i
ORDER BY i.date;

-- v_ar_aging also referenced the phantom invoices.status.
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
WHERE i.paid = 0;

-- v_msme_overdue matched payments by a non-existent payments.vendor_id; payments
-- link to a vendor through their PO (payments.po_id → purchase_orders.vendor_id).
DROP VIEW IF EXISTS v_msme_overdue;
CREATE VIEW v_msme_overdue AS
SELECT
  po.id AS po_id, v.id AS vendor_id, v.name AS vendor_name, v.msme_number,
  po.date AS invoice_date, po.total_paise,
  COALESCE((SELECT SUM(p.amount_paise) FROM payments p
            WHERE p.po_id IN (SELECT id FROM purchase_orders WHERE vendor_id = v.id)
              AND p.category IN ('quarry','general','invoice')), 0) AS paid_paise,
  po.total_paise - COALESCE((SELECT SUM(p.amount_paise) FROM payments p
            WHERE p.po_id IN (SELECT id FROM purchase_orders WHERE vendor_id = v.id)
              AND p.category IN ('quarry','general','invoice')), 0) AS outstanding_paise,
  CAST(julianday('now') - julianday(po.date) AS INTEGER) AS days_elapsed,
  CASE WHEN julianday('now') - julianday(po.date) > 45 THEN 1 ELSE 0 END AS is_overdue
FROM purchase_orders po
JOIN vendors v ON po.vendor_id = v.id
WHERE v.msme = 1
  AND po.status NOT IN ('cancelled')
  AND po.total_paise > COALESCE((SELECT SUM(p.amount_paise) FROM payments p
            WHERE p.po_id IN (SELECT id FROM purchase_orders WHERE vendor_id = v.id)
              AND p.category IN ('quarry','general','invoice')), 0);

-- Part B — add a `kind` dimension to the price master (slab/cts → ₹/sqft,
-- tile/monument/kerb/cobble → ₹/pc, strip → ₹/rft) and rename the rate column to
-- a generic rate_paise (per the kind's selling unit). Rebuild is needed to change
-- the UNIQUE key; existing rows are preserved as kind='slab'.

CREATE TABLE slab_price_master_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL DEFAULT 'slab',
  variety      TEXT NOT NULL,
  grade        TEXT NOT NULL CHECK(grade IN ('A+','A','B')),
  thickness_mm INTEGER NOT NULL DEFAULT 0,
  rate_paise   INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, variety, grade, thickness_mm)
);

INSERT INTO slab_price_master_new (kind, variety, grade, thickness_mm, rate_paise, notes, updated_at)
  SELECT 'slab', variety, grade, thickness_mm, rate_per_sqft_paise, notes, updated_at FROM slab_price_master;

DROP TABLE slab_price_master;
ALTER TABLE slab_price_master_new RENAME TO slab_price_master;

CREATE INDEX IF NOT EXISTS idx_spm_variety ON slab_price_master(variety);
CREATE INDEX IF NOT EXISTS idx_spm_kind    ON slab_price_master(kind);
