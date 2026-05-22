-- ════════════════════════════════════════════════════════
-- MIGRATION 005 — polymorphic products + transformation jobs
--
-- Introduces the `products` parent table with 8 typed child tables for
-- kind-specific dimensions. Production jobs become many-input → many-output
-- transformations with cost apportionment. Invoice items become polymorphic.
--
-- Existing data path:
--   1. `slabs` table is renamed to `slabs_legacy` (read-only reference for 1 release)
--   2. Each row migrates into `products` (kind='slab') + `product_slabs` child row
--   3. `invoice_items.slab_id` values are backfilled to `product_id`
--   4. `production_jobs` rows get a new `legacy` flag; new jobs use the new schema
-- ════════════════════════════════════════════════════════

-- ═══ 1. Rename old slabs table (keep for 1 release as read-only reference) ═══
ALTER TABLE slabs RENAME TO slabs_legacy;

-- ═══ 2. Products parent table ═══
CREATE TABLE products (
  id              TEXT PRIMARY KEY,             -- PRD-000001, auto-generated
  kind            TEXT NOT NULL CHECK (kind IN
                    ('block','slab','tile','cts','strip','kerb','chips','dust','monument')),
  variety         TEXT NOT NULL,
  hsn             TEXT NOT NULL,                 -- 2515/2516/2517
  uom             TEXT NOT NULL,                 -- cft/sqft/rft/pc/tonne/bag/kg
  grade           TEXT,                          -- A+/A/B, nullable for chips/dust
  lot_id          TEXT,                          -- traceability
  rate_paise      INTEGER NOT NULL CHECK (rate_paise >= 0),
  stock           REAL NOT NULL DEFAULT 0 CHECK (stock >= 0),  -- REAL to allow fractional tonnes

  -- Photo (from v3)
  photo_url         TEXT,
  photo_uploaded_at TEXT,
  photo_uploaded_by TEXT,
  photo_size_bytes  INTEGER,

  -- Traceability (what job produced this, if any)
  source_job_id   TEXT,
  source_product_id TEXT REFERENCES products(id),    -- parent block → child slabs

  -- Cost tracking
  unit_cost_paise INTEGER,                       -- apportioned COGS per UOM

  -- Lifecycle
  active          INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      TEXT,
  updated_at      TEXT,
  updated_by      TEXT
);

CREATE INDEX idx_products_kind     ON products(kind);
CREATE INDEX idx_products_variety  ON products(variety);
CREATE INDEX idx_products_lot      ON products(lot_id);
CREATE INDEX idx_products_active   ON products(active);
CREATE INDEX idx_products_source   ON products(source_product_id);

-- ═══ 3. Kind-specific dimension tables (1:1 with products) ═══

CREATE TABLE product_blocks (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  length_m        REAL NOT NULL,
  width_m         REAL NOT NULL,
  height_m        REAL NOT NULL,
  cft             REAL NOT NULL,                 -- computed on insert
  source_quarry   TEXT
);

CREATE TABLE product_slabs (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  size_lw         TEXT NOT NULL,                 -- "2600×1600" (mm)
  thickness_mm    INTEGER NOT NULL,
  sqft            REAL NOT NULL
);

CREATE TABLE product_tiles (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  size_lw         TEXT NOT NULL,                 -- "600×600"
  thickness_mm    INTEGER NOT NULL,
  sqft_per_tile   REAL NOT NULL,
  pieces_per_box  INTEGER
);

CREATE TABLE product_cts (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  customer_spec   TEXT,                          -- "Mrs Raj kitchen, Bangalore"
  length_mm       INTEGER NOT NULL,
  width_mm        INTEGER NOT NULL,
  thickness_mm    INTEGER NOT NULL,
  sqft            REAL NOT NULL
);

CREATE TABLE product_strips (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  length_mm       INTEGER NOT NULL,
  width_mm        INTEGER NOT NULL,
  thickness_mm   INTEGER NOT NULL,
  rft_per_piece   REAL NOT NULL
);

CREATE TABLE product_kerbs (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  profile         TEXT NOT NULL,                 -- "CC-Type-1", "Half-batter", etc
  length_mm       INTEGER NOT NULL,
  height_mm       INTEGER NOT NULL,
  width_mm        INTEGER NOT NULL
);

CREATE TABLE product_chips (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  mesh_size_mm    REAL NOT NULL,
  bulk_density    REAL                            -- kg/m³
);

CREATE TABLE product_monuments (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  spec_json       TEXT                            -- freeform JSON — widely variable
);

-- Note: `dust` products have no dimensions table — they use only the parent row

-- ═══ 4. New transformation-based production_jobs ═══
-- Drop old single-row jobs table, rebuild with in/out graph

ALTER TABLE production_jobs RENAME TO production_jobs_legacy;

CREATE TABLE production_jobs (
  id                 TEXT PRIMARY KEY,           -- JOB-000001
  lot_id             TEXT,
  stage              TEXT NOT NULL CHECK (stage IN ('split','cut','polish','done')),
  status             TEXT NOT NULL DEFAULT 'In Progress'
                       CHECK (status IN ('New','In Progress','Complete','Cancelled')),
  date               TEXT NOT NULL DEFAULT (date('now')),
  labour_paise       INTEGER NOT NULL DEFAULT 0,
  power_paise        INTEGER NOT NULL DEFAULT 0,
  consumables_paise  INTEGER NOT NULL DEFAULT 0,
  yield_pct          REAL,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_by         TEXT,
  updated_at         TEXT,
  updated_by         TEXT
);

CREATE TABLE production_job_inputs (
  job_id          TEXT NOT NULL REFERENCES production_jobs(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id),
  qty_consumed    REAL NOT NULL CHECK (qty_consumed > 0),
  unit_cost_paise INTEGER,                       -- snapshot at time of consumption
  PRIMARY KEY (job_id, product_id)
);

CREATE INDEX idx_job_inputs_product ON production_job_inputs(product_id);

CREATE TABLE production_job_outputs (
  job_id          TEXT NOT NULL REFERENCES production_jobs(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id),  -- the new product created
  qty_produced    REAL NOT NULL CHECK (qty_produced > 0),
  unit_cost_paise INTEGER,                       -- apportioned COGS
  PRIMARY KEY (job_id, product_id)
);

CREATE INDEX idx_job_outputs_product ON production_job_outputs(product_id);

-- ═══ 5. Polymorphic invoice items ═══
-- Keep old invoice_items table for reference, create a new one

ALTER TABLE invoice_items RENAME TO invoice_items_legacy;

CREATE TABLE invoice_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id          TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_no             INTEGER NOT NULL,
  product_id          TEXT REFERENCES products(id),
  product_kind        TEXT,                      -- snapshot at sale time
  variety             TEXT NOT NULL,
  hsn                 TEXT NOT NULL,
  uom                 TEXT NOT NULL,
  uom_qty             REAL NOT NULL,             -- sqft/rft/cft per piece, or tonnes
  qty                 REAL NOT NULL,             -- pieces (fractional OK for tonnes)
  rate_paise          INTEGER NOT NULL,
  line_total_paise    INTEGER NOT NULL,
  dimension_snapshot  TEXT,                      -- JSON — {"size":"2600×1600","thickness_mm":18}
  grade               TEXT
);

CREATE INDEX idx_inv_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_inv_items_product ON invoice_items(product_id);
CREATE INDEX idx_inv_items_hsn     ON invoice_items(hsn);

-- ═══ 6. Data migration: slabs_legacy → products + product_slabs ═══
-- Each slab row becomes one product row (kind='slab') + one product_slabs row.
-- IDs change from "S001" to "PRD-000001" etc., tracked in a temp mapping.

CREATE TEMP TABLE slab_product_map (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL
);

INSERT INTO slab_product_map (old_id, new_id)
SELECT id, 'PRD-' || printf('%06d', ROW_NUMBER() OVER (ORDER BY id))
FROM slabs_legacy;

INSERT INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock,
                      photo_url, photo_uploaded_at, photo_uploaded_by, photo_size_bytes,
                      active, created_at, created_by)
SELECT
  m.new_id, 'slab', s.variety, '2516', 'sqft', s.grade, s.lot_id,
  s.rate_paise, s.stock,
  s.photo_url, s.photo_uploaded_at, s.photo_uploaded_by, s.photo_size_bytes,
  1, COALESCE(s.created_at, datetime('now')), 'migration-005'
FROM slabs_legacy s
JOIN slab_product_map m ON m.old_id = s.id;

INSERT INTO product_slabs (product_id, size_lw, thickness_mm, sqft)
SELECT m.new_id, s.size, s.thickness_mm, s.sqft
FROM slabs_legacy s
JOIN slab_product_map m ON m.old_id = s.id;

-- ═══ 7. Backfill invoice_items from legacy rows ═══
INSERT INTO invoice_items (invoice_id, line_no, product_id, product_kind,
                           variety, hsn, uom, uom_qty, qty, rate_paise, line_total_paise,
                           dimension_snapshot, grade)
SELECT
  il.invoice_id,
  il.id,                                           -- line_no = old PK for stable ordering
  m.new_id,
  'slab',
  il.variety,
  '2516',
  'sqft',
  il.sqft,
  il.qty,
  il.rate_paise,
  il.line_total_paise,
  json_object('size', il.size, 'thickness_mm', il.thickness_mm, 'grade', il.grade),
  il.grade
FROM invoice_items_legacy il
LEFT JOIN slab_product_map m ON m.old_id = il.slab_id;

-- ═══ 8. Seed a few demo products of other kinds (so POS shows variety) ═══
-- Only if we're in a dev database (detected by presence of seed users)

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-100001', 'block', 'Paradiso Classic', '2515', 'cft', NULL, 'LOT-030', 90000, 180, 'migration-005'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');

INSERT OR IGNORE INTO product_blocks (product_id, length_m, width_m, height_m, cft, source_quarry)
SELECT 'PRD-100001', 2.4, 1.8, 1.2, 180, 'Chendarapalli Quarry — Lot 30'
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-100001');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-100002', 'tile', 'Steel Grey', '2516', 'pc', 'A', 'LOT-028', 3500, 450, 'migration-005'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');

INSERT OR IGNORE INTO product_tiles (product_id, size_lw, thickness_mm, sqft_per_tile, pieces_per_box)
SELECT 'PRD-100002', '600×600', 18, 3.87, 4
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-100002');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-100003', 'tile', 'Tan Brown', '2516', 'pc', 'A', 'LOT-026', 2400, 320, 'migration-005'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');

INSERT OR IGNORE INTO product_tiles (product_id, size_lw, thickness_mm, sqft_per_tile, pieces_per_box)
SELECT 'PRD-100003', '300×600', 18, 1.94, 8
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-100003');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-100004', 'cts', 'Black Galaxy', '2516', 'sqft', 'A+', NULL, 95000, 42, 'migration-005'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');

INSERT OR IGNORE INTO product_cts (product_id, customer_spec, length_mm, width_mm, thickness_mm, sqft)
SELECT 'PRD-100004', 'Kitchen countertop — 8ft × 2ft — Mrs Menon, Coimbatore', 2438, 610, 20, 16.00
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-100004');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-100005', 'chips', 'Multicolour Red', '2517', 'tonne', NULL, NULL, 180000, 12.5, 'migration-005'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');

INSERT OR IGNORE INTO product_chips (product_id, mesh_size_mm, bulk_density)
SELECT 'PRD-100005', 10, 1680
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-100005');
