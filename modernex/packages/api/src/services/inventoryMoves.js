export function recordInventoryMove(db, {
  productId,
  qty,
  fromLocationId = null,
  toLocationId = null,
  moveType = 'move',
  stage = null,
  jobId = null,
  notes = null,
  createdBy = 'system',
  scanOutAt = null,
  scanInAt = null,
}) {
  return db.prepare(`
    INSERT INTO inventory_moves (
      product_id, qty, from_location_id, to_location_id,
      move_type, stage, job_id, notes,
      scan_out_at, scan_in_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    productId,
    qty ?? 0,
    fromLocationId,
    toLocationId,
    moveType,
    stage,
    jobId,
    notes,
    scanOutAt,
    scanInAt,
    createdBy,
  );
}

export function loadProductTrace(db, productId) {
  const product = db.prepare(`
    SELECT p.*, l.name AS current_location_name, l.location_type AS current_location_type
    FROM products p
    LEFT JOIN locations l ON l.id = p.current_location_id
    WHERE p.id = ?
  `).get(productId);
  if (!product) return null;

  const moves = db.prepare(`
    SELECT m.*, fl.name AS from_location_name, tl.name AS to_location_name
    FROM inventory_moves m
    LEFT JOIN locations fl ON fl.id = m.from_location_id
    LEFT JOIN locations tl ON tl.id = m.to_location_id
    WHERE m.product_id = ?
    ORDER BY m.created_at DESC, m.id DESC
  `).all(productId);

  return { product, moves };
}