-- Migration 034: structured PO link on products (blocks)
--
-- Until now a block registered from a purchase order only recorded the PO as a
-- free-text note ("From PO PO-2025-001"), so downstream job work had no reliable
-- way to check whether that block's PO was approved. This adds a real FK so the
-- production layer can enforce: only blocks from an APPROVED PO may be consumed
-- into job work (split/cut/polish). PO-less (ad-hoc yard) blocks are unaffected.

ALTER TABLE products ADD COLUMN po_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_po ON products(po_id);

-- Best-effort backfill for existing blocks whose note follows the "From PO <id>"
-- convention. Only sets po_id when the extracted id matches a real PO row.
UPDATE products
SET po_id = substr(notes, 9)
WHERE kind = 'block'
  AND po_id IS NULL
  AND notes LIKE 'From PO %'
  AND substr(notes, 9) IN (SELECT id FROM purchase_orders);
