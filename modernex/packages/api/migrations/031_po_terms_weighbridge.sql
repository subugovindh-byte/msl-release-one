-- Migration 031: Variable-weight procurement — PO special terms + weighbridge ticket
--
-- Implements the granite procurement spec where final price depends on the
-- actual scaled weight at delivery (not the quarry's volume estimate).
--
--   PO (contract)        → block #, Incoterm, defect clause, commercial allowance
--   GRN (scale ticket)   → certified weighbridge net weight + ticket number
--
-- The three-way match (PO rate × scaled weight vs quarry invoice) reads these.

-- ── Purchase Order: special contract terms (spec step 3) ──
ALTER TABLE purchase_orders ADD COLUMN block_number   TEXT;                    -- unique quarry block ID
ALTER TABLE purchase_orders ADD COLUMN incoterm        TEXT;                   -- FOB / DAP / EXW / CIF …
ALTER TABLE purchase_orders ADD COLUMN defect_clause   TEXT;                   -- rejection rights for hidden cracks
ALTER TABLE purchase_orders ADD COLUMN allowance_pct   REAL NOT NULL DEFAULT 0; -- commercial allowance (deductible rough-edge %)

-- ── Goods Receipt: certified weighbridge scale ticket (spec step 6) ──
ALTER TABLE purchase_order_receipts ADD COLUMN net_weight_kg  REAL;            -- exact net weight on certified scale
ALTER TABLE purchase_order_receipts ADD COLUMN scale_ticket_no TEXT;          -- weighbridge ticket reference
