-- Vendor advance balance: tracks amounts pre-paid to a vendor that need to
-- be adjusted against future purchase orders or consumable purchases.
-- Credited when a partially-paid PO/CP is cancelled and the user chooses
-- "adjust against future purchase". Debited when a payment is recorded with
-- apply_advance > 0.
ALTER TABLE vendors ADD COLUMN advance_paise INTEGER NOT NULL DEFAULT 0;
