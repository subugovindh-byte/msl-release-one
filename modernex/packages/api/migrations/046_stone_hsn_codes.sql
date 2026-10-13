-- Migration 046: stone HSN codes per Notification 9/2025-Central Tax (Rate), 22-09-2025.
--
-- Blocks were coded 2515 (marble) and worked goods 2516 (granite blocks / rough stone),
-- both at 18%. Granite blocks are 2516 at 5%; polished slabs, tiles, cut-to-size and
-- monuments are 6802 and setts / kerbs 6801, both 18%. The rate follows the HSN, so
-- these codes decide what each line is taxed at. Existing invoices and POs keep the
-- amounts they were issued with.
UPDATE products SET hsn = '2516' WHERE kind = 'block' AND hsn IN ('2515', '2516');
UPDATE products SET hsn = '6801' WHERE kind IN ('kerb', 'cobble') AND hsn = '2516';
UPDATE products SET hsn = '6802' WHERE kind NOT IN ('block', 'chips', 'dust', 'kerb', 'cobble') AND hsn = '2516';

UPDATE invoice_items SET hsn = '2516' WHERE product_kind = 'block' AND hsn = '2515';
UPDATE invoice_items SET hsn = '6802' WHERE product_kind NOT IN ('block', 'chips', 'dust', 'kerb', 'cobble') AND hsn = '2516';

UPDATE variety_master SET hsn_default = '6802' WHERE hsn_default = '2516' AND kind_default <> 'block';
UPDATE company_details SET hsn = '6802' WHERE hsn = '2516';
