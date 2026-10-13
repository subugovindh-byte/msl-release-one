-- Migration 043: each tax declaration says which regime the employee chose.
--
-- The new regime is the default under s.115BAC; an employee may opt for the old
-- one (with HRA, 80C, 80D …) by telling the employer at the start of the year.
-- Without this column payroll mixed old-regime deductions into new-regime slabs.
ALTER TABLE employee_tax_declarations
  ADD COLUMN tax_regime TEXT NOT NULL DEFAULT 'new' CHECK (tax_regime IN ('new', 'old'));
