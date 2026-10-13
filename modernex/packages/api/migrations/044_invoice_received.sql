-- Migration 044: invoices know how much has been received against them.
--
-- `paid` used to flip to 1 on any receipt, even a part-payment, and receipts
-- entered on the Payments screen never touched the invoice at all. Receivables
-- now come from total − received. Historical paid flags are left as they are:
-- those invoices were treated as settled at the time.
ALTER TABLE invoices ADD COLUMN received_paise INTEGER NOT NULL DEFAULT 0;

UPDATE invoices SET received_paise = COALESCE(
  (SELECT SUM(p.amount_paise) FROM payments p WHERE p.invoice_id = invoices.id AND p.type = 'receipt'), 0);
UPDATE invoices SET paid = 1,
       paid_date = COALESCE(paid_date, (SELECT MAX(p.date) FROM payments p
                                         WHERE p.invoice_id = invoices.id AND p.type = 'receipt'))
 WHERE paid = 0 AND received_paise >= total_paise AND total_paise > 0;

DROP VIEW IF EXISTS v_ar_aging;
CREATE VIEW v_ar_aging AS
SELECT
  i.id, i.date, i.customer_id, i.customer_name, i.customer_gstin,
  i.total_paise, i.taxable_paise, i.received_paise,
  i.total_paise - i.received_paise AS balance_paise,
  CAST(julianday('now', 'localtime') - julianday(i.date) AS INTEGER) AS age_days,
  CASE
    WHEN julianday('now', 'localtime') - julianday(i.date) <= 30 THEN '0-30'
    WHEN julianday('now', 'localtime') - julianday(i.date) <= 60 THEN '31-60'
    WHEN julianday('now', 'localtime') - julianday(i.date) <= 90 THEN '61-90'
    WHEN julianday('now', 'localtime') - julianday(i.date) <= 120 THEN '91-120'
    ELSE '120+'
  END AS aging_bucket,
  c.credit_limit_paise, c.interest_rate_pct
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.paid = 0;
