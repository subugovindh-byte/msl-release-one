import { PRODUCT_KINDS, hsnForKind } from '@modernex/shared';

/**
 * Map from product kind → (dimension table name, field list).
 * Used to generate INSERT/UPDATE SQL for the right child table.
 */
const DIM_TABLES = {
  block:    { table: 'product_blocks',    fields: ['length_m', 'width_m', 'height_m', 'cft', 'source_quarry'] },
  slab:     { table: 'product_slabs',     fields: ['size_lw', 'thickness_mm', 'sqft'] },
  tile:     { table: 'product_tiles',     fields: ['size_lw', 'thickness_mm', 'sqft_per_tile', 'pieces_per_box'] },
  cts:      { table: 'product_cts',       fields: ['customer_spec', 'length_mm', 'width_mm', 'thickness_mm', 'sqft'] },
  strip:    { table: 'product_strips',    fields: ['length_mm', 'width_mm', 'thickness_mm', 'rft_per_piece'] },
  kerb:     { table: 'product_kerbs',     fields: ['profile', 'length_mm', 'height_mm', 'width_mm'] },
  cobble:   { table: 'product_cobbles',   fields: ['cobble_type', 'length_mm', 'width_mm', 'height_mm'] },
  chips:    { table: 'product_chips',     fields: ['mesh_size_mm', 'bulk_density'] },
  monument: { table: 'product_monuments', fields: ['monument_type', 'length_mm', 'width_mm', 'thickness_mm', 'spec_notes'] },
  // dust has no dimension table
};

/**
 * Compute derived dimension values (e.g. CFT from L×W×H, sqft from mm dimensions).
 */
export function computeDerivedDims(kind, dims) {
  if (!dims) return {};
  const d = { ...dims };

  if (kind === 'block') {
    // Blocks are measured/priced in CBM (cubic metres). Dimensions are stored in
    // metres, so volume in m³ = L×W×H directly. (The column is named `cft` for
    // legacy reasons but now holds CBM.)
    if (d.length_m && d.width_m && d.height_m && d.cft == null) {
      d.cft = +(d.length_m * d.width_m * d.height_m).toFixed(3);
    }
  }

  if (kind === 'cts') {
    // mm → sqft: 1 sqft = 92903.04 mm²
    if (d.length_mm && d.width_mm && d.sqft == null) {
      d.sqft = +((d.length_mm * d.width_mm) / 92903.04).toFixed(4);
    }
  }

  if (kind === 'strip') {
    // mm → running feet: 1 rft = 304.8 mm
    if (d.length_mm && d.rft_per_piece == null) {
      d.rft_per_piece = +(d.length_mm / 304.8).toFixed(3);
    }
  }

  if (kind === 'slab') {
    // Parse "2600×1600" → sqft if missing
    if (d.size_lw && d.sqft == null) {
      const m = String(d.size_lw).match(/(\d+)\D+(\d+)/);
      if (m) {
        d.sqft = +(((+m[1]) * (+m[2])) / 92903.04).toFixed(4);
      }
    }
  }

  if (kind === 'tile') {
    if (d.size_lw && d.sqft_per_tile == null) {
      const m = String(d.size_lw).match(/(\d+)\D+(\d+)/);
      if (m) {
        d.sqft_per_tile = +(((+m[1]) * (+m[2])) / 92903.04).toFixed(4);
      }
    }
  }

  return d;
}

/**
 * Insert dimension row for a product.
 */
export function insertDimensions(db, productId, kind, dims) {
  const cfg = DIM_TABLES[kind];
  if (!cfg) return;  // dust or unknown kind — skip

  const computed = computeDerivedDims(kind, dims);
  const cols = ['product_id', ...cfg.fields];
  const values = [productId, ...cfg.fields.map(f => computed[f] ?? null)];
  const placeholders = values.map(() => '?').join(', ');
  db.prepare(
    `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders})`
  ).run(...values);
}

export function updateDimensions(db, productId, kind, dims) {
  const cfg = DIM_TABLES[kind];
  if (!cfg) return;
  const computed = computeDerivedDims(kind, dims);
  const sets = cfg.fields.filter(f => computed[f] !== undefined);
  if (sets.length === 0) return;
  const clause = sets.map(f => `${f} = ?`).join(', ');
  const values = sets.map(f => computed[f]);
  values.push(productId);
  db.prepare(
    `UPDATE ${cfg.table} SET ${clause} WHERE product_id = ?`
  ).run(...values);
}

export function deleteDimensions(db, productId, kind) {
  const cfg = DIM_TABLES[kind];
  if (!cfg) return;
  db.prepare(`DELETE FROM ${cfg.table} WHERE product_id = ?`).run(productId);
}

/**
 * Load a product with its dimensions joined in.
 */
export function loadProduct(db, productId) {
  const p = db.prepare(`
    SELECT p.*, l.name AS current_location_name, l.location_type AS current_location_type
    FROM products p
    LEFT JOIN locations l ON l.id = p.current_location_id
    WHERE p.id = ?
  `).get(productId);
  if (!p) return null;
  const cfg = DIM_TABLES[p.kind];
  if (cfg) {
    const dims = db.prepare(`SELECT * FROM ${cfg.table} WHERE product_id = ?`).get(productId);
    if (dims) {
      // Strip product_id (already known), keep the rest as `dimensions`
      const { product_id: _, ...rest } = dims;
      p.dimensions = rest;
    }
  }
  return p;
}

/**
 * Generate next product ID: PRD-000123
 */
export function nextProductId(db) {
  const row = db.prepare(
    `SELECT id FROM products WHERE id LIKE 'PRD-%' ORDER BY id DESC LIMIT 1`
  ).get();
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(4), 10) + 1;
  return 'PRD-' + String(seq).padStart(6, '0');
}

/**
 * Compute the "sellable quantity" representation for an item.
 * Returns { uom_qty, qty, displayLabel } — how this product should appear on an invoice line.
 *
 * For a slab: uom_qty = sqft per piece; qty = number of pieces
 * For a block: uom_qty = cft per piece; qty = 1 (blocks are unique)
 * For tiles: uom_qty = 1 (priced per piece); qty = pieces sold
 * For chips: uom_qty = 1; qty = tonnes
 */
export function defaultLineShape(product) {
  const dims = product.dimensions || {};
  switch (product.kind) {
    case 'slab':
      return { uom_qty: dims.sqft || 1, qty: 1 };
    case 'block':
      return { uom_qty: dims.cft || 1, qty: 1 };
    case 'cts':
      return { uom_qty: dims.sqft || 1, qty: 1 };
    case 'tile':
      return { uom_qty: 1, qty: 1 };  // rate is per-piece; multiply by quantity
    case 'strip':
      return { uom_qty: dims.rft_per_piece || 1, qty: 1 };
    case 'kerb':
    case 'monument':
      return { uom_qty: 1, qty: 1 };
    case 'chips':
    case 'dust':
      return { uom_qty: 1, qty: 1 };  // rate is per tonne; qty = tonnes
    default:
      return { uom_qty: 1, qty: 1 };
  }
}

/**
 * Get the UOM for a product (stored on row, falls back to kind default).
 */
export function uomForProduct(product) {
  return product.uom || PRODUCT_KINDS[product.kind]?.uom || 'pc';
}

/**
 * Get HSN for a product (stored on row, falls back to kind default).
 */
export function hsnForProduct(product) {
  return product.hsn || hsnForKind(product.kind) || '2516';
}
