-- Migration 035: explicit approval step for block inspections
--
-- Previously an inspection went pending -> po_raised directly, so any pending
-- inspection could raise a PO regardless of quality. We add an explicit
-- 'approved' state (recorded here) that a PO can only be raised from. The
-- status column has no CHECK constraint, so 'approved' is accepted as-is;
-- these columns capture who approved it and when for the audit trail.
--
--   Flow:  pending --approve--> approved --raise-po--> po_raised
--                 \--reject--> rejected      (from pending or approved)

ALTER TABLE block_inspections ADD COLUMN approved_at TEXT;
ALTER TABLE block_inspections ADD COLUMN approved_by TEXT;
