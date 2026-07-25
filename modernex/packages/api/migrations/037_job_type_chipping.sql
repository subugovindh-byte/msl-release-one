-- Migration 037: job_type discriminator on production jobs (enables chipping)
--
-- production_jobs.stage has a hard CHECK ('split','cut','polish','done') and the
-- table is referenced by child FKs, so adding a 'chipping' stage would require a
-- risky full-table rebuild. Instead we tag jobs with a job_type: NULL = a normal
-- transform job (block→slab etc.), 'chipping' = a side-branch that recovers waste
-- into a chips/aggregate product. Per-stage reporting groups by
-- COALESCE(job_type, stage) so chipping reads as its own stage without the rebuild.

ALTER TABLE production_jobs ADD COLUMN job_type TEXT;   -- NULL = transform | 'chipping'
