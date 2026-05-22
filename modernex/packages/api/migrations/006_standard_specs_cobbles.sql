-- ════════════════════════════════════════════════════════
-- MIGRATION 006 — industry-standard product specs
--
-- Adds:
--   1. `cobble` kind (10th type) with its own typed dimension table
--   2. Expanded monument table with structured fields (type/L/W/thickness + notes)
--      replacing the old freeform spec_json-only approach
--   3. Expanded seed data reflecting real-world granite specifications:
--        - Slabs in 18/20/30mm thicknesses
--        - Tiles in 300×300, 400×400, 600×600, 800×800
--        - Cobblestones (5 standard types)
--        - Monuments (flat/bevel/slant/upright/ledger/columbarium)
-- ════════════════════════════════════════════════════════

-- ═══ 1. Extend kind CHECK constraint to include 'cobble' ═══
-- SQLite doesn't support ALTER TABLE ... CHECK; we rebuild the table.
-- Safe approach: rename, create new with expanded CHECK, copy data, drop old.

CREATE TABLE products_new (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN
                    ('block','slab','tile','cts','strip','kerb','cobble','chips','dust','monument')),
  variety         TEXT NOT NULL,
  hsn             TEXT NOT NULL,
  uom             TEXT NOT NULL,
  grade           TEXT,
  lot_id          TEXT,
  rate_paise      INTEGER NOT NULL CHECK (rate_paise >= 0),
  stock           REAL NOT NULL DEFAULT 0 CHECK (stock >= 0),
  photo_url         TEXT,
  photo_uploaded_at TEXT,
  photo_uploaded_by TEXT,
  photo_size_bytes  INTEGER,
  source_job_id   TEXT,
  source_product_id TEXT REFERENCES products_new(id),
  unit_cost_paise INTEGER,
  active          INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      TEXT,
  updated_at      TEXT,
  updated_by      TEXT
);

INSERT INTO products_new SELECT * FROM products;
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

CREATE INDEX idx_products_kind     ON products(kind);
CREATE INDEX idx_products_variety  ON products(variety);
CREATE INDEX idx_products_lot      ON products(lot_id);
CREATE INDEX idx_products_active   ON products(active);
CREATE INDEX idx_products_source   ON products(source_product_id);

-- ═══ 2. Cobblestone dimension table ═══
CREATE TABLE product_cobbles (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  cobble_type     TEXT NOT NULL,                 -- small/cube/standard/paving/random
  length_mm       INTEGER,
  width_mm        INTEGER,
  height_mm       INTEGER
);

-- ═══ 3. Rebuild product_monuments with structured spec fields ═══
-- Old table had just spec_json. New one has standard-type + dimensions.
ALTER TABLE product_monuments RENAME TO product_monuments_legacy;

CREATE TABLE product_monuments (
  product_id      TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  monument_type   TEXT NOT NULL,                 -- flat_marker_24x12, slant_24x20, ...
  length_mm       INTEGER NOT NULL,
  width_mm        INTEGER NOT NULL,
  thickness_mm   INTEGER NOT NULL,
  spec_notes      TEXT
);

-- Migrate any legacy monument rows (if present)
INSERT INTO product_monuments (product_id, monument_type, length_mm, width_mm, thickness_mm, spec_notes)
SELECT product_id, 'custom', 0, 0, 0, spec_json
FROM product_monuments_legacy;

-- ═══ 4. Industry-standard seed data ═══
-- Only seed if we already ran migration 005 successfully (admin user exists)

-- ── Expand slabs to include 20mm and 30mm thicknesses across varieties ──
INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200001', 'slab', 'Paradiso Classic', '2516', 'sqft', 'A+', 'LOT-032', 52000, 6, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_slabs (product_id, size_lw, thickness_mm, sqft)
SELECT 'PRD-200001', '2700×1800', 20, 52.30 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200001');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200002', 'slab', 'Paradiso Classic', '2516', 'sqft', 'A+', 'LOT-032', 68000, 3, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_slabs (product_id, size_lw, thickness_mm, sqft)
SELECT 'PRD-200002', '2700×1800', 30, 52.30 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200002');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200003', 'slab', 'Black Galaxy', '2516', 'sqft', 'A+', 'LOT-027', 82000, 4, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_slabs (product_id, size_lw, thickness_mm, sqft)
SELECT 'PRD-200003', '3000×2000', 20, 64.58 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200003');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200004', 'slab', 'Black Galaxy', '2516', 'sqft', 'A+', 'LOT-027', 96000, 2, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_slabs (product_id, size_lw, thickness_mm, sqft)
SELECT 'PRD-200004', '3000×2000', 30, 64.58 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200004');

-- ── Tiles in standard sizes ──
INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200010', 'tile', 'Tan Brown', '2516', 'pc', 'A', 'LOT-026', 1200, 600, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_tiles (product_id, size_lw, thickness_mm, sqft_per_tile, pieces_per_box)
SELECT 'PRD-200010', '300×300', 10, 0.97, 10 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200010');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200011', 'tile', 'Steel Grey', '2516', 'pc', 'A', 'LOT-028', 1900, 480, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_tiles (product_id, size_lw, thickness_mm, sqft_per_tile, pieces_per_box)
SELECT 'PRD-200011', '400×400', 12, 1.72, 8 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200011');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200012', 'tile', 'Kashmir White', '2516', 'pc', 'A+', 'LOT-033', 5800, 180, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_tiles (product_id, size_lw, thickness_mm, sqft_per_tile, pieces_per_box)
SELECT 'PRD-200012', '800×800', 20, 6.89, 2 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200012');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200013', 'tile', 'Paradiso Classic', '2516', 'pc', 'A', 'LOT-024', 1400, 720, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_tiles (product_id, size_lw, thickness_mm, sqft_per_tile, pieces_per_box)
SELECT 'PRD-200013', '305×305', 10, 1.00, 10 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200013');

-- ── Cobblestones ──
INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200020', 'cobble', 'Steel Grey', '2516', 'pc', NULL, NULL, 4800, 2400, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_cobbles (product_id, cobble_type, length_mm, width_mm, height_mm)
SELECT 'PRD-200020', 'cube', 100, 100, 100 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200020');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200021', 'cobble', 'Tan Brown', '2516', 'pc', NULL, NULL, 7500, 1800, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_cobbles (product_id, cobble_type, length_mm, width_mm, height_mm)
SELECT 'PRD-200021', 'standard', 200, 100, 100 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200021');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200022', 'cobble', 'Multicolour Red', '2516', 'pc', NULL, NULL, 2200, 3600, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_cobbles (product_id, cobble_type, length_mm, width_mm, height_mm)
SELECT 'PRD-200022', 'small', 100, 100, 50 WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200022');

-- ── Monuments ──
INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200030', 'monument', 'Absolute Black', '2516', 'pc', NULL, NULL, 950000, 4, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_monuments (product_id, monument_type, length_mm, width_mm, thickness_mm, spec_notes)
SELECT 'PRD-200030', 'ledger_110', 1830, 760, 110, 'Polished top face, rough sides, export to UK'
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200030');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200031', 'monument', 'Absolute Black', '2516', 'pc', NULL, NULL, 320000, 8, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_monuments (product_id, monument_type, length_mm, width_mm, thickness_mm, spec_notes)
SELECT 'PRD-200031', 'flat_marker_24x12', 610, 305, 100, 'Polished top, sandblast sides'
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200031');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200032', 'monument', 'Paradiso Classic', '2516', 'pc', NULL, NULL, 520000, 5, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_monuments (product_id, monument_type, length_mm, width_mm, thickness_mm, spec_notes)
SELECT 'PRD-200032', 'upright_24x24', 610, 610, 150, 'All-polished, export to US'
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200032');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200033', 'monument', 'Kashmir White', '2516', 'pc', NULL, NULL, 680000, 3, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_monuments (product_id, monument_type, length_mm, width_mm, thickness_mm, spec_notes)
SELECT 'PRD-200033', 'slant_24x20', 610, 510, 200, 'Polished face, rough back'
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200033');

INSERT OR IGNORE INTO products (id, kind, variety, hsn, uom, grade, lot_id, rate_paise, stock, created_by)
SELECT 'PRD-200034', 'monument', 'Imperial Red', '2516', 'pc', NULL, NULL, 180000, 12, 'migration-006'
WHERE EXISTS (SELECT 1 FROM users WHERE username = 'admin');
INSERT OR IGNORE INTO product_monuments (product_id, monument_type, length_mm, width_mm, thickness_mm, spec_notes)
SELECT 'PRD-200034', 'columbarium_12x24', 610, 305, 25, 'Polished, for columbarium niches'
WHERE EXISTS (SELECT 1 FROM products WHERE id = 'PRD-200034');
