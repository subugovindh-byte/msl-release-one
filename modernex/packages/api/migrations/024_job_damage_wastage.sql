-- ════════════════════════════════════════════════════════
-- MIGRATION 024 — damage_count + wastage_count on production_jobs
--
-- Adds two integer counters to every production job:
--   damage_count  — pieces physically broken/cracked/rejected during the job
--   wastage_count — pieces discarded as planned offcut/trim/unusable yield
-- Both default to 0 so all existing rows remain valid.
-- ════════════════════════════════════════════════════════

ALTER TABLE production_jobs ADD COLUMN damage_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_jobs ADD COLUMN wastage_count INTEGER NOT NULL DEFAULT 0;
