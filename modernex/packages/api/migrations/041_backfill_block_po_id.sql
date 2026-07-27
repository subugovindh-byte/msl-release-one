-- Migration 041: re-backfill products.po_id for legacy blocks linked only by note.
--
-- Migration 034 added products.po_id and backfilled it once from the "From PO <id>"
-- note convention. But that ran a single time: any block registered AFTER 034 by an
-- app build that wrote the note yet didn't set po_id (the po_id-on-receive code
-- shipped later) is left with po_id NULL. Those blocks then:
--   • escape the receipt-quota count (a fully-processed PO looks unreceived, so it
--     can be received again), and
--   • skip the approved-PO gate for job work (that gate keys on po_id).
--
-- This re-runs the exact-match backfill idempotently. The app writes the note as
-- exactly "From PO <id>" (substr from char 9 is the id), so an exact match against
-- a real PO recovers every app-written link. Blocks with hand-edited notes that
-- don't match a real PO id are left untouched (there's nothing reliable to link to).

UPDATE products
SET po_id = substr(notes, 9)
WHERE kind = 'block'
  AND po_id IS NULL
  AND notes LIKE 'From PO %'
  AND substr(notes, 9) IN (SELECT id FROM purchase_orders);
