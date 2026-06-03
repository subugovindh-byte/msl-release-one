-- Migration 028: Add per-status timestamps to purchase_orders
-- Tracks when a PO moved to each status for audit trail display
ALTER TABLE purchase_orders ADD COLUMN received_at TEXT;
ALTER TABLE purchase_orders ADD COLUMN approved_at TEXT;
ALTER TABLE purchase_orders ADD COLUMN cancelled_at TEXT;
