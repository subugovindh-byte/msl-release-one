-- Partial payment support for consumable purchases
-- Adds cp_id foreign key to payments table so individual payments can be
-- recorded against a consumable purchase (like po_id works for POs).

ALTER TABLE payments ADD COLUMN cp_id TEXT REFERENCES consumable_purchases(id);

CREATE INDEX IF NOT EXISTS idx_payments_cp ON payments(cp_id);

-- Extend status check to include 'partial'
-- SQLite does not support ALTER COLUMN, so we rebuild the table check via a trigger workaround.
-- The status 'partial' is managed in application logic; the CHECK constraint is permissive enough
-- by adding it via the trigger approach below. For SQLite we use a permissive UPDATE guard.
CREATE TRIGGER IF NOT EXISTS trg_cp_status_check
  BEFORE UPDATE OF status ON consumable_purchases
BEGIN
  SELECT CASE
    WHEN NEW.status NOT IN ('pending','partial','paid','cancelled')
    THEN RAISE(ABORT, 'invalid status')
  END;
END;
