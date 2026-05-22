CREATE TABLE IF NOT EXISTS locations (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  location_type     TEXT NOT NULL CHECK (location_type IN ('quarry','yard','machine','showroom','sales','dispatch','virtual')),
  stage_hint        TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO locations (id, name, location_type, stage_hint, sort_order) VALUES
  ('QUARRY', 'Quarry', 'quarry', NULL, 10),
  ('RAW_YARD', 'Raw Yard', 'yard', 'split', 20),
  ('GANGSAW_IN', 'Gangsaw In', 'machine', 'cut', 30),
  ('GANGSAW_OUT', 'Gangsaw Out', 'machine', 'cut', 40),
  ('POLISH_LINE', 'Polish Line', 'machine', 'polish', 50),
  ('FINISHED_YARD', 'Finished Yard', 'yard', 'done', 60),
  ('SHOWROOM', 'Showroom', 'showroom', NULL, 70),
  ('SALES_HOLD', 'Sales Hold', 'sales', NULL, 80),
  ('DISPATCH_AREA', 'Dispatch Area', 'dispatch', NULL, 90),
  ('DISPATCHED', 'Dispatched', 'virtual', NULL, 100);

ALTER TABLE products ADD COLUMN current_location_id TEXT REFERENCES locations(id);

UPDATE products
SET current_location_id = CASE
  WHEN kind = 'block' THEN 'RAW_YARD'
  WHEN kind IN ('slab', 'tile', 'cts', 'strip', 'kerb', 'cobble', 'monument') THEN 'FINISHED_YARD'
  WHEN kind IN ('chips', 'dust') THEN 'RAW_YARD'
  ELSE 'RAW_YARD'
END
WHERE current_location_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_current_location ON products(current_location_id);

CREATE TABLE IF NOT EXISTS inventory_moves (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty               REAL NOT NULL CHECK (qty >= 0),
  from_location_id  TEXT REFERENCES locations(id),
  to_location_id    TEXT REFERENCES locations(id),
  move_type         TEXT NOT NULL DEFAULT 'move' CHECK (move_type IN ('receive','move','consume','produce','reserve','dispatch','adjust')),
  stage             TEXT,
  job_id            TEXT REFERENCES production_jobs(id),
  notes             TEXT,
  scan_out_at       TEXT,
  scan_in_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_moves_product ON inventory_moves(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_moves_to_location ON inventory_moves(to_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_moves_job ON inventory_moves(job_id);

INSERT INTO inventory_moves (
  product_id, qty, from_location_id, to_location_id, move_type, notes, created_by, scan_in_at, created_at
)
SELECT
  p.id,
  COALESCE(p.stock, 0),
  NULL,
  p.current_location_id,
  'receive',
  'Backfilled initial location during inventory location migration',
  'migration-008',
  datetime('now'),
  COALESCE(p.created_at, datetime('now'))
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_moves m WHERE m.product_id = p.id
);