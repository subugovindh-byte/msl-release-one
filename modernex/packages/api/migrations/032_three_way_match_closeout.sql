-- Migration 032: Three-way match + closeout (spec steps 7 & 8)
--
-- Three-way match reconciles:
--   1. PO          — agreed rate × actual delivered CFT, less commercial allowance
--   2. GRN         — certified weighbridge net weight / CFT received
--   3. Vendor inv. — what the quarry actually billed (final_invoice_paise)
--
-- A PO can only be 'closed' once it is matched AND fully paid.

ALTER TABLE purchase_orders ADD COLUMN final_invoice_no    TEXT;     -- quarry's final invoice reference
ALTER TABLE purchase_orders ADD COLUMN final_invoice_paise INTEGER;  -- amount the quarry actually billed
ALTER TABLE purchase_orders ADD COLUMN matched_at          TEXT;     -- when AP confirmed the three-way match
ALTER TABLE purchase_orders ADD COLUMN matched_by          TEXT;
ALTER TABLE purchase_orders ADD COLUMN closed_at           TEXT;     -- terminal closeout timestamp
