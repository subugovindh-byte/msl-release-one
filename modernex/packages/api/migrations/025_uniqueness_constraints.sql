-- ════════════════════════════════════════════════════════
-- MIGRATION 025 — uniqueness constraints across pipeline
--
-- Adds DB-level guards to prevent duplicate entries at key
-- stages. Application-level guards for richer checks are
-- in the route handlers.
-- ════════════════════════════════════════════════════════

-- Only one QC-passed receipt is allowed per purchase order.
-- Multiple QC-holds (qc_pass = 0) are allowed while a supplier
-- resolves delivery issues, but only one pass is meaningful.
CREATE UNIQUE INDEX IF NOT EXISTS idx_grn_po_qcpass
  ON purchase_order_receipts(po_id)
  WHERE qc_pass = 1;
