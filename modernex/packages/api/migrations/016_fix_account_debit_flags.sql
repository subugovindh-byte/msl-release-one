-- ── Fix is_debit_balance flags ────────────────────────────────────────────────
-- Migration 014 inserted all accounts without specifying is_debit_balance, so
-- every account defaulted to 1 (debit-balance). Correct accounting convention:
--   is_debit_balance = 1  → Assets, Expenses  (normal debit balance)
--   is_debit_balance = 0  → Liabilities, Capital, Income, Contra-assets
--               (normal credit balance)

UPDATE accounts SET is_debit_balance = 0 WHERE id IN (
  -- Contra-assets (accumulated depreciation — credit reduces the asset)
  'ACC-PLANTDEP',
  'ACC-VEHDEP',
  -- Liabilities
  'ACC-CRED',
  'ACC-ADVRCV',
  'ACC-CGST',
  'ACC-SGST',
  'ACC-IGST',
  'ACC-TDSP',
  'ACC-SALP',
  'ACC-PFP',
  'ACC-ESIP',
  'ACC-PTP',
  -- Capital
  'ACC-CAP',
  'ACC-RET',
  -- Income
  'ACC-SALES',
  'ACC-OTHERINC'
);
