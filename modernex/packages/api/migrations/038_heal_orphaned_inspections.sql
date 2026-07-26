-- Migration 038: heal inspections orphaned by a deleted PO
--
-- When a PO raised from a block inspection is deleted, the FK nulls
-- block_inspections.po_id (ON DELETE SET NULL) but leaves status = 'po_raised',
-- which the Raise-PO screen treats as terminal — so the inspection can never
-- raise a replacement PO. Revert any such orphan back to 'approved' so a new PO
-- can be raised. (The DELETE /purchase route now does this going forward.)

UPDATE block_inspections
SET status = 'approved', updated_at = datetime('now')
WHERE status = 'po_raised' AND po_id IS NULL;
