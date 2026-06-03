-- Migration 033: record how much vendor advance a payment consumed
--
-- Needed so a payment reversal can restore the exact advance back to the
-- vendor. Defaults to 0 for all existing rows (no advance applied).

ALTER TABLE payments ADD COLUMN advance_applied_paise INTEGER NOT NULL DEFAULT 0;
