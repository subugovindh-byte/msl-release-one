-- ─── Add address/contact details to vendors ───
ALTER TABLE vendors ADD COLUMN contact_person TEXT;
ALTER TABLE vendors ADD COLUMN address        TEXT;
ALTER TABLE vendors ADD COLUMN pincode        TEXT;
ALTER TABLE vendors ADD COLUMN email          TEXT;
