-- Migration 036: finished-goods QA gate (Gate 3)
--
-- Polished slabs/tiles must pass a QA check before they can move to a sellable
-- location (showroom/sales) or be invoiced. qa_status semantics:
--   NULL     -> not QA-tracked (blocks, chips, legacy stock) — flows freely
--   pending  -> produced by a polish job, awaiting QA — blocked from sale
--   passed   -> cleared QA — may move to Sales Yard / be sold
--   failed   -> QA rejected — blocked from sale until reworked & re-QA'd
--
-- Only items a polish job stamps 'pending' are gated, so existing finished
-- stock (qa_status NULL) is unaffected, mirroring the PO-less block rule.

ALTER TABLE products ADD COLUMN qa_status TEXT;   -- NULL | pending | passed | failed
ALTER TABLE products ADD COLUMN qa_by     TEXT;
ALTER TABLE products ADD COLUMN qa_at     TEXT;
ALTER TABLE products ADD COLUMN qa_notes  TEXT;

CREATE INDEX IF NOT EXISTS idx_products_qa ON products(qa_status);
