-- ════════════════════════════════════════════════════════════════
-- Migration 011: Config-driven variety master + company extensions
-- ════════════════════════════════════════════════════════════════

-- ─── 1. Extend company_details with operational config ───
ALTER TABLE company_details ADD COLUMN home_state        TEXT NOT NULL DEFAULT 'Tamil Nadu';
ALTER TABLE company_details ADD COLUMN eway_threshold_paise  INTEGER NOT NULL DEFAULT 5000000;  -- ₹50,000
ALTER TABLE company_details ADD COLUMN einvoice_threshold_paise INTEGER NOT NULL DEFAULT 0;    -- all invoices
ALTER TABLE company_details ADD COLUMN fy_start_month    INTEGER NOT NULL DEFAULT 4;            -- April
ALTER TABLE company_details ADD COLUMN credit_limit_default_paise INTEGER NOT NULL DEFAULT 0;  -- 0 = unlimited
ALTER TABLE company_details ADD COLUMN invoice_prefix    TEXT NOT NULL DEFAULT 'INV';
ALTER TABLE company_details ADD COLUMN po_prefix         TEXT NOT NULL DEFAULT 'PO';
ALTER TABLE company_details ADD COLUMN bank_name         TEXT;
ALTER TABLE company_details ADD COLUMN bank_account_no   TEXT;
ALTER TABLE company_details ADD COLUMN bank_ifsc         TEXT;
ALTER TABLE company_details ADD COLUMN bank_branch       TEXT;
ALTER TABLE company_details ADD COLUMN upi_id            TEXT;
ALTER TABLE company_details ADD COLUMN logo_url          TEXT;
ALTER TABLE company_details ADD COLUMN website           TEXT;

UPDATE company_details SET home_state = 'Tamil Nadu' WHERE id = 1;

-- ─── 2. Variety master — replaces hardcoded VARIETIES constant ───
CREATE TABLE IF NOT EXISTS variety_master (
  id            TEXT PRIMARY KEY,             -- e.g. VM-001
  variety_name  TEXT NOT NULL UNIQUE,
  region        TEXT NOT NULL DEFAULT 'Other',-- Andhra / Telangana / Tamil Nadu / Karnataka / Other
  hsn_default   TEXT NOT NULL DEFAULT '2516',
  uom_default   TEXT NOT NULL DEFAULT 'sqft',
  kind_default  TEXT NOT NULL DEFAULT 'slab', -- most varieties are slabs
  typical_grades TEXT NOT NULL DEFAULT 'A,A+',-- comma-separated
  photo_url     TEXT,
  notes         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TRIGGER variety_master_updated_at
  AFTER UPDATE ON variety_master
  FOR EACH ROW BEGIN
    UPDATE variety_master SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id;
  END;

-- Seed from existing variety_defaults + hardcoded VARIETIES constant
INSERT OR IGNORE INTO variety_master (id, variety_name, region, photo_url, sort_order) VALUES
  -- Tamil Nadu
  ('VM-001', 'Mapple Red',        'Tamil Nadu', NULL, 10),
  ('VM-002', 'Warangal Black',    'Tamil Nadu', NULL, 11),
  ('VM-003', 'Sapphire Brown',    'Tamil Nadu', NULL, 12),
  ('VM-004', 'Kunnam Black',      'Tamil Nadu', NULL, 13),
  -- Andhra Pradesh
  ('VM-010', 'Viscont White',     'Andhra Pradesh', NULL, 20),
  ('VM-011', 'S-K Blue',         'Andhra Pradesh', NULL, 21),
  ('VM-012', 'Safari Green',      'Andhra Pradesh', NULL, 22),
  ('VM-013', 'Indian Mahogany',   'Andhra Pradesh', NULL, 23),
  -- Telangana
  ('VM-020', 'Jet Black',        'Telangana', NULL, 30),
  ('VM-021', 'Green Galaxy',      'Telangana', NULL, 31),
  ('VM-022', 'English Oak',       'Telangana', NULL, 32),
  ('VM-023', 'Indian Brown',      'Telangana', NULL, 33),
  ('VM-024', 'Colombo Blue',      'Telangana', NULL, 34),
  ('VM-025', 'Colombo Juparana',  'Telangana', NULL, 35),
  ('VM-026', 'Classic Yellowstone','Telangana', NULL, 36),
  -- Legacy / Other
  ('VM-030', 'Paradiso Classic',  'Other', NULL, 40),
  ('VM-031', 'Paradiso Extra',    'Other', NULL, 41),
  ('VM-032', 'Multicolour Red',   'Other', NULL, 42),
  ('VM-033', 'Tan Brown',         'Other', NULL, 43),
  ('VM-034', 'Black Galaxy',      'Other', NULL, 44),
  ('VM-035', 'Vizag Blue',        'Andhra Pradesh', NULL, 45),
  ('VM-036', 'Steel Grey',        'Other', NULL, 46),
  ('VM-037', 'Absolute Black',    'Other', NULL, 47),
  ('VM-038', 'Kashmir White',     'Other', NULL, 48);

-- ─── 3. Product spec templates — replaces hardcoded STANDARD_SPECS ───
CREATE TABLE IF NOT EXISTS product_spec_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,                  -- block / slab / tile / kerb / cobble …
  label       TEXT NOT NULL,                  -- human-readable description
  spec_json   TEXT NOT NULL DEFAULT '{}',     -- JSON with dimension fields
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Slab thickness standards
INSERT INTO product_spec_templates (kind, label, spec_json, sort_order) VALUES
  ('slab', '18mm Polished',  '{"thickness_mm":18}', 1),
  ('slab', '20mm Polished',  '{"thickness_mm":20}', 2),
  ('slab', '30mm Polished',  '{"thickness_mm":30}', 3),
  ('slab', '40mm Cobble Cut','{"thickness_mm":40}', 4);

-- Tile size standards
INSERT INTO product_spec_templates (kind, label, spec_json, sort_order) VALUES
  ('tile', '300×300×10mm', '{"size_lw":"300×300","thickness_mm":10,"sqft_per_tile":0.97}', 10),
  ('tile', '600×600×20mm', '{"size_lw":"600×600","thickness_mm":20,"sqft_per_tile":3.88}', 11),
  ('tile', '800×400×20mm', '{"size_lw":"800×400","thickness_mm":20,"sqft_per_tile":3.44}', 12);

-- Kerb standards
INSERT INTO product_spec_templates (kind, label, spec_json, sort_order) VALUES
  ('kerb', 'CC-Type-1 (900×200×150)', '{"profile":"CC-Type-1","length_mm":900,"height_mm":200,"width_mm":150}', 20),
  ('kerb', 'CC-Type-2 (900×250×200)', '{"profile":"CC-Type-2","length_mm":900,"height_mm":250,"width_mm":200}', 21),
  ('kerb', 'HB-450 (900×450×300)',    '{"profile":"HB-450","length_mm":900,"height_mm":450,"width_mm":300}',   22),
  ('kerb', 'BullNose (900×200×150)',  '{"profile":"BullNose","length_mm":900,"height_mm":200,"width_mm":150}', 23);

-- Cobble standards
INSERT INTO product_spec_templates (kind, label, spec_json, sort_order) VALUES
  ('cobble', 'Small (100×100×50)',    '{"cobble_type":"small","length_mm":100,"width_mm":100,"height_mm":50}',  30),
  ('cobble', 'Cube (100×100×100)',    '{"cobble_type":"cube","length_mm":100,"width_mm":100,"height_mm":100}',  31),
  ('cobble', 'Standard (200×100×80)','{"cobble_type":"standard","length_mm":200,"width_mm":100,"height_mm":80}',32),
  ('cobble', 'Paving (200×100×60)',   '{"cobble_type":"paving","length_mm":200,"width_mm":100,"height_mm":60}', 33);
