-- Migration 045: correct the TDS section reference data.
--
-- Two thresholds were stored ten times too high (194I ₹24 lakh instead of
-- ₹2.4 lakh, 194Q ₹5 crore instead of ₹50 lakh), 194C's aggregate limit has been
-- ₹1 lakh since FY 2016-17, and the Finance Acts 2024 / 2025 changed 194H
-- (2 % from 1 Oct 2024, ₹20,000) and the 194I / 194J thresholds from 1 Apr 2025.
-- 194I's limit is now ₹50,000 a month; stored here as the annual ₹6 lakh.
UPDATE tds_sections SET threshold_single_paise = 3000000,   threshold_aggregate_paise = 10000000  WHERE code = '194C';
UPDATE tds_sections SET threshold_single_paise = 5000000,   threshold_aggregate_paise = 5000000   WHERE code = '194J';
UPDATE tds_sections SET threshold_single_paise = 5000000,   threshold_aggregate_paise = 60000000  WHERE code = '194I';
UPDATE tds_sections SET threshold_single_paise = 500000000, threshold_aggregate_paise = 500000000 WHERE code = '194Q';
UPDATE tds_sections SET rate_individual_pct = 2.0, rate_company_pct = 2.0,
                        threshold_single_paise = 2000000, threshold_aggregate_paise = 2000000     WHERE code = '194H';
