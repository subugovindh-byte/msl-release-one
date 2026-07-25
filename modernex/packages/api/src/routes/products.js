import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { productCreateSchema, productUpdateSchema,
         PRODUCT_KINDS, hsnForKind } from '@modernex/shared';
import { NotFoundError, AppError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { loadProductTrace, recordInventoryMove } from '../services/inventoryMoves.js';
import {
  insertDimensions, updateDimensions, deleteDimensions,
  loadProduct, nextProductId, uomForProduct,
} from '../services/products.js';

export const productsRouter = Router();
productsRouter.use(authenticate);

const productMoveSchema = z.object({
  to_location_id: z.string().min(1).max(30),
  qty: z.number().nonnegative().optional(),
  move_type: z.enum(['receive', 'move', 'consume', 'produce', 'reserve', 'dispatch', 'adjust']).optional(),
  stage: z.string().max(30).optional().nullable(),
  job_id: z.string().max(30).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  scan_out_at: z.string().optional().nullable(),
  scan_in_at: z.string().optional().nullable(),
});

function defaultLocationForKind(kind) {
  if (kind === 'block') return 'RAW_YARD';
  if (['slab', 'tile', 'cts', 'strip', 'kerb', 'cobble', 'monument'].includes(kind)) return 'FINISHED_YARD';
  return 'RAW_YARD';
}

// ─── GET /products ───
productsRouter.get('/', (req, res) => {
  const { q, kind, variety, grade, lot, location, active = 'true', minStock } = req.query;
  const db = getDb();

  let sql = `
    SELECT p.*,
           l.name AS current_location_name,
           l.location_type AS current_location_type,
           COALESCE(p.photo_url, vp.photo_url) AS effective_photo_url,
           CASE WHEN p.photo_url IS NOT NULL THEN 'custom'
                WHEN vp.photo_url IS NOT NULL THEN 'variety'
                ELSE NULL END AS photo_source
    FROM products p
    LEFT JOIN locations l ON l.id = p.current_location_id
    LEFT JOIN variety_photos vp ON vp.variety = p.variety
    WHERE 1=1`;
  const params = [];

  if (active === 'true') sql += ' AND p.active = 1';
  else if (active === 'false') sql += ' AND p.active = 0';

  if (q) {
    sql += ' AND (p.variety LIKE ? OR p.id LIKE ? OR p.lot_id LIKE ?)';
    const pat = `%${q}%`;
    params.push(pat, pat, pat);
  }
  if (kind && kind !== 'All') { sql += ' AND p.kind = ?'; params.push(kind); }
  if (variety && variety !== 'All') { sql += ' AND p.variety = ?'; params.push(variety); }
  if (grade && grade !== 'All') { sql += ' AND p.grade = ?'; params.push(grade); }
  if (lot) { sql += ' AND p.lot_id = ?'; params.push(lot); }
  if (location && location !== 'All') { sql += ' AND p.current_location_id = ?'; params.push(location); }
  if (minStock !== undefined) { sql += ' AND p.stock >= ?'; params.push(Number(minStock)); }

  sql += ' ORDER BY p.kind, p.variety, p.grade DESC';

  const products = db.prepare(sql).all(...params);

  // Load dimensions in bulk per kind (N+1 prevention)
  const byKind = {};
  for (const p of products) {
    (byKind[p.kind] ||= []).push(p.id);
  }
  const dimsMap = new Map();
  for (const [kindName, ids] of Object.entries(byKind)) {
    const cfg = {
      block: 'product_blocks', slab: 'product_slabs', tile: 'product_tiles',
      cts: 'product_cts', strip: 'product_strips', kerb: 'product_kerbs',
      cobble: 'product_cobbles',
      chips: 'product_chips', monument: 'product_monuments',
    }[kindName];
    if (!cfg) continue;
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM ${cfg} WHERE product_id IN (${placeholders})`).all(...ids);
    for (const r of rows) {
      const { product_id, ...dims } = r;
      dimsMap.set(product_id, dims);
    }
  }
  for (const p of products) {
    p.dimensions = dimsMap.get(p.id) || {};
  }

  res.json({ products });
});

// ─── GET /products/:id ───
productsRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const product = loadProduct(db, req.params.id);
    if (!product) throw new NotFoundError('Product not found');
    res.json({ product });
  } catch (err) { next(err); }
});

// ─── GET /products/:id/trace ───
productsRouter.get('/:id/trace', (req, res, next) => {
  try {
    const db = getDb();
    const trace = loadProductTrace(db, req.params.id);
    if (!trace) throw new NotFoundError('Product not found');

    const product = loadProduct(db, req.params.id);
    res.json({
      product: { ...product, current_location_name: trace.product.current_location_name, current_location_type: trace.product.current_location_type },
      moves: trace.moves,
    });
  } catch (err) { next(err); }
});

// ─── POST /products ───
productsRouter.post('/',
  requireRole('admin', 'yard'),
  validate(productCreateSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const b = req.body;
      const id = nextProductId(db);
      const kindDef = PRODUCT_KINDS[b.kind];
      const uom = b.uom || kindDef?.uom || 'pc';
      const hsn = b.hsn || kindDef?.hsn || '2516';

      // Approved-PO gate: blocks can only enter Raw Yard from an approved PO
      if (b.kind === 'block') {
        if (!b.po_id) {
          throw new AppError(
            'Block registration requires an approved Purchase Order. ' +
            'Create and approve a PO in the Purchase module first.',
            400
          );
        }
        const po = db.prepare('SELECT id, status, variety FROM purchase_orders WHERE id = ?').get(b.po_id);
        if (!po) throw new AppError(`Purchase Order ${b.po_id} not found.`, 404);
        if (!['approved', 'closed'].includes(po.status)) {
          throw new AppError(
            `Block cannot be registered — PO ${po.id} is '${po.status}'. ` +
            `Only 'approved' or 'closed' POs allow block receipt. ` +
            `Approve the PO in Purchase first.`,
            409
          );
        }
      }

      // Duplicate block guard: same lot + variety + dimensions already registered
      if (b.kind === 'block' && b.lot_id && b.dimensions) {
        const dims = b.dimensions;
        const dupeBlock = db.prepare(`
          SELECT p.id FROM products p
          JOIN product_blocks pb ON pb.product_id = p.id
          WHERE p.kind = 'block' AND p.lot_id = ? AND p.variety = ?
            AND p.active = 1 AND p.source_job_id IS NULL
            AND ABS(pb.length_m - ?) < 0.001
            AND ABS(pb.width_m  - ?) < 0.001
            AND ABS(pb.height_m - ?) < 0.001
          LIMIT 1
        `).get(b.lot_id, b.variety, dims.length_m, dims.width_m, dims.height_m);
        if (dupeBlock) {
          throw new AppError(
            `Duplicate block: ${dupeBlock.id} is already registered with lot ${b.lot_id}, variety "${b.variety}" and the same dimensions. ` +
            `If this is a different physical block from the same lot, change the lot ID (e.g. ${b.lot_id}-B).`,
            409
          );
        }
      }

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO products (id, kind, variety, hsn, uom, grade, lot_id, po_id, current_location_id,
                                rate_paise, stock, notes, active, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(
          id, b.kind, b.variety, hsn, uom,
          b.grade || null, b.lot_id || null, b.po_id || null,
          b.current_location_id || defaultLocationForKind(b.kind),
          b.rate_paise, b.stock ?? 0, b.notes || null, req.user.username
        );
        insertDimensions(db, id, b.kind, b.dimensions);
        recordInventoryMove(db, {
          productId: id,
          qty: b.stock ?? 0,
          fromLocationId: null,
          toLocationId: b.current_location_id || defaultLocationForKind(b.kind),
          moveType: 'receive',
          notes: 'Initial product creation',
          createdBy: req.user.username,
          scanInAt: new Date().toISOString(),
        });
      });
      tx();

      const product = loadProduct(db, id);
      audit(req, 'PRODUCT_CREATE', 'products', id, null, product);
      res.status(201).json({ product });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /products/:id ───
productsRouter.patch('/:id',
  requireRole('admin', 'yard'),
  validate(productUpdateSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = loadProduct(db, req.params.id);
      if (!existing) throw new NotFoundError('Product not found');

      // Kind is immutable — that's a different product
      if (req.body.kind && req.body.kind !== existing.kind) {
        throw new AppError('Cannot change product kind; create a new product instead', 400);
      }

      const fields = ['variety', 'hsn', 'uom', 'grade', 'lot_id', 'rate_paise', 'stock', 'notes'];
      const updates = [];
      const params = [];
      for (const k of fields) {
        if (req.body[k] !== undefined) {
          updates.push(`${k} = ?`);
          params.push(req.body[k]);
        }
      }

      const tx = db.transaction(() => {
        if (updates.length) {
          updates.push('updated_at = datetime(\'now\')', 'updated_by = ?');
          params.push(req.user.username, req.params.id);
          db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
        if (req.body.dimensions) {
          updateDimensions(db, req.params.id, existing.kind, req.body.dimensions);
        }
      });
      tx();

      const updated = loadProduct(db, req.params.id);
      audit(req, 'PRODUCT_UPDATE', 'products', req.params.id, existing, updated);
      res.json({ product: updated });
    } catch (err) { next(err); }
  }
);

// ─── POST /products/:id/move ───
productsRouter.post('/:id/move',
  requireRole('admin', 'yard', 'sales'),
  validate(productMoveSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = loadProduct(db, req.params.id);
      if (!existing) throw new NotFoundError('Product not found');

      const destination = db.prepare('SELECT * FROM locations WHERE id = ? AND is_active = 1').get(req.body.to_location_id);
      if (!destination) throw new NotFoundError('Location not found');

      // Gate 3: a QA-tracked item (polished good) can't reach a sellable
      // location until it has passed QA. Non-QA items (qa_status NULL) pass.
      if (['showroom', 'sales'].includes(destination.location_type)
          && ['pending', 'failed'].includes(existing.qa_status)) {
        throw new AppError(
          `${existing.id} cannot move to ${destination.name} — QA is '${existing.qa_status}'. ` +
          `It must pass QA before reaching the sales yard.`,
          409
        );
      }

      const qty = req.body.qty ?? existing.stock ?? 0;
      if (qty < 0) throw new AppError('Quantity must be non-negative', 400);

      const tx = db.transaction(() => {
        db.prepare(`
          UPDATE products
          SET current_location_id = ?, updated_at = datetime('now'), updated_by = ?
          WHERE id = ?
        `).run(req.body.to_location_id, req.user.username, req.params.id);

        recordInventoryMove(db, {
          productId: req.params.id,
          qty,
          fromLocationId: existing.current_location_id || null,
          toLocationId: req.body.to_location_id,
          moveType: req.body.move_type || 'move',
          stage: req.body.stage || null,
          jobId: req.body.job_id || null,
          notes: req.body.notes || null,
          createdBy: req.user.username,
          scanOutAt: req.body.scan_out_at || new Date().toISOString(),
          scanInAt: req.body.scan_in_at || new Date().toISOString(),
        });
      });
      tx();

      const updated = loadProduct(db, req.params.id);
      audit(req, 'PRODUCT_MOVE', 'products', req.params.id, existing, updated);
      res.json({ product: updated });
    } catch (err) { next(err); }
  }
);

// ─── POST /products/:id/qa ─── finished-goods QA check (Gate 3)
// pass -> product may move to the sales yard / be invoiced.
// fail -> stays blocked from sale until reworked and re-QA'd.
productsRouter.post('/:id/qa',
  requireRole('admin', 'yard'),
  validate(z.object({
    result: z.enum(['pass', 'fail']),
    notes: z.string().max(500).nullable().optional(),
    rate_paise: z.number().int().nonnegative().optional(),   // confirm sale rate on pass
  })),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = loadProduct(db, req.params.id);
      if (!existing) throw new NotFoundError('Product not found');
      if (!existing.qa_status) {
        throw new AppError(`${req.params.id} is not a QA-tracked item (only polished goods enter QA).`, 400);
      }
      if (existing.qa_status === 'passed') {
        throw new AppError(`${req.params.id} has already passed QA.`, 409);
      }
      const status = req.body.result === 'pass' ? 'passed' : 'failed';
      // On a pass, optionally confirm the selling rate as the item clears for sale.
      const setRate = status === 'passed' && req.body.rate_paise != null;
      db.prepare(`
        UPDATE products
        SET qa_status = ?, qa_by = ?, qa_at = datetime('now'), qa_notes = ?,
            ${setRate ? 'rate_paise = ?,' : ''}
            updated_at = datetime('now'), updated_by = ?
        WHERE id = ?
      `).run(status, req.user.username, req.body.notes || null,
             ...(setRate ? [req.body.rate_paise] : []),
             req.user.username, req.params.id);
      const updated = loadProduct(db, req.params.id);
      audit(req, 'PRODUCT_QA', 'products', req.params.id, existing, updated);
      res.json({ product: updated });
    } catch (err) { next(err); }
  }
);

// ─── POST /products/:id/rework ─── audited one-step-back correction
// Rework re-runs a finishing operation on the SAME physical piece (it does not
// reverse a transformation). Each step moves the item to the prior stage's
// location, clears QA if it drops out of Finished Yard, and logs the reason.
const REWORK_BACK = {
  SHOWROOM:      { to: 'FINISHED_YARD', label: 'pull back from sale', stage: 'done'   },
  FINISHED_YARD: { to: 'GANGSAW_OUT',   label: 're-polish',          stage: 'polish', clearQa: true },
  GANGSAW_OUT:   { to: 'GANGSAW_IN',    label: 're-cut / dress',     stage: 'cut'    },
  GANGSAW_IN:    { to: 'RAW_YARD',      label: 'back to raw yard',   stage: 'split'  },
};
productsRouter.post('/:id/rework',
  requireRole('admin', 'yard'),
  validate(z.object({
    reason: z.string().trim().min(3).max(500),
  })),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = loadProduct(db, req.params.id);
      if (!existing) throw new NotFoundError('Product not found');
      const step = REWORK_BACK[existing.current_location_id];
      if (!step) {
        throw new AppError(`No rework step available from ${existing.current_location_id || 'this location'}.`, 400);
      }
      const tx = db.transaction(() => {
        db.prepare(`
          UPDATE products
          SET current_location_id = ?,
              qa_status = ${step.clearQa ? 'NULL' : 'qa_status'},
              updated_at = datetime('now'), updated_by = ?
          WHERE id = ?
        `).run(step.to, req.user.username, req.params.id);
        recordInventoryMove(db, {
          productId: req.params.id,
          qty: existing.stock ?? 0,
          fromLocationId: existing.current_location_id || null,
          toLocationId: step.to,
          moveType: 'adjust',
          stage: step.stage,
          notes: `REWORK (${step.label}): ${req.body.reason}`,
          createdBy: req.user.username,
          scanOutAt: new Date().toISOString(),
          scanInAt: new Date().toISOString(),
        });
      });
      tx();
      const updated = loadProduct(db, req.params.id);
      audit(req, 'PRODUCT_REWORK', 'products', req.params.id, existing, updated);
      res.json({ product: updated, rework: { to: step.to, stage: step.stage, label: step.label } });
    } catch (err) { next(err); }
  }
);

// ─── POST /products/bulk-rate — admin bulk rate update ───
// ─── POST /products/:id/damage ─── record ad-hoc damage or wastage at any stage
productsRouter.post('/:id/damage',
  requireRole('admin', 'yard'),
  validate(z.object({
    qty: z.number().positive(),
    reason: z.enum(['damage', 'wastage']),
    notes: z.string().max(500).nullable().optional(),
  })),
  (req, res, next) => {
    try {
      const db = getDb();
      const product = loadProduct(db, req.params.id);
      if (!product) throw new NotFoundError('Product not found');
      const { qty, reason, notes } = req.body;
      if (product.stock < qty) {
        throw new AppError(
          `Cannot record ${reason} of ${qty} — only ${product.stock} in stock`,
          400
        );
      }
      db.transaction(() => {
        db.prepare('UPDATE products SET stock = stock - ?, updated_at = datetime(\'now\'), updated_by = ? WHERE id = ?')
          .run(qty, req.user.username, req.params.id);
        recordInventoryMove(db, {
          productId: req.params.id,
          qty,
          fromLocationId: product.current_location_id,
          toLocationId: null,
          moveType: 'adjust',
          stage: null,
          notes: `${reason === 'damage' ? 'Damage' : 'Wastage'} write-off: ${notes || ''}`.trim(),
          createdBy: req.user.username,
        });
      })();
      audit(req, reason === 'damage' ? 'DAMAGE_WRITEOFF' : 'WASTAGE_WRITEOFF', 'products', req.params.id, null, { qty, notes });
      res.json({ ok: true, new_stock: product.stock - qty });
    } catch (err) { next(err); }
  }
);

const bulkRateSchema = z.object({
  filter: z.object({
    kind: z.string().optional(),
    variety: z.string().optional(),
    grade: z.string().optional(),
  }).default({}),
  action: z.enum(['set', 'add', 'multiply']),   // set new rate | add ₹ | multiply by factor
  value: z.number(),
});

productsRouter.post('/bulk-rate',
  requireRole('admin'),
  validate(bulkRateSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const { filter, action, value } = req.body;

      // Build WHERE
      const conds = ['active = 1'];
      const params = [];
      if (filter.kind)    { conds.push('kind = ?');    params.push(filter.kind); }
      if (filter.variety) { conds.push('variety = ?'); params.push(filter.variety); }
      if (filter.grade)   { conds.push('grade = ?');   params.push(filter.grade); }
      const where = conds.join(' AND ');

      // Preview what will change
      const affected = db.prepare(
        `SELECT id, rate_paise FROM products WHERE ${where}`
      ).all(...params);
      if (!affected.length) {
        return res.json({ updated: 0, items: [] });
      }

      // Compute new rates
      const changes = affected.map(p => {
        let newRate;
        if (action === 'set')      newRate = Math.round(value * 100);        // value in rupees
        else if (action === 'add') newRate = p.rate_paise + Math.round(value * 100);
        else                       newRate = Math.round(p.rate_paise * value);
        return { id: p.id, old: p.rate_paise, new: Math.max(0, newRate) };
      });

      // Apply as one transaction
      const tx = db.transaction(() => {
        const stmt = db.prepare(
          `UPDATE products SET rate_paise = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?`
        );
        for (const c of changes) stmt.run(c.new, req.user.username, c.id);
      });
      tx();

      audit(req, 'PRODUCT_BULK_RATE', 'products', '(bulk)', null,
            { filter, action, value, count: changes.length });

      res.json({ updated: changes.length, items: changes });
    } catch (err) { next(err); }
  }
);

// ─── DELETE /products/:id — soft delete ───
// Hard block: sold on invoice (can never delete a sold product).
// Soft block: consumed in an active job — blocked unless ?force=true (admin override).
productsRouter.delete('/:id', requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    const existing = loadProduct(db, req.params.id);
    if (!existing) throw new NotFoundError('Product not found');
    const force = req.query.force === 'true';

    // Hard block: product has been invoiced/sold
    const soldItem = db.prepare(
      `SELECT invoice_id FROM invoice_items WHERE product_id = ? LIMIT 1`
    ).get(req.params.id);
    if (soldItem) {
      throw new AppError(
        `Cannot delete ${req.params.id} — it has been sold on invoice ${soldItem.invoice_id}.`,
        409
      );
    }

    // Soft block: product is an input to a job that still exists (not cleared)
    if (!force) {
      const jobInput = db.prepare(
        `SELECT ji.job_id FROM production_job_inputs ji
         JOIN production_jobs j ON j.id = ji.job_id
         WHERE ji.product_id = ? LIMIT 1`
      ).get(req.params.id);
      if (jobInput) {
        throw new AppError(
          `Cannot delete ${req.params.id} — consumed in job ${jobInput.job_id}. ` +
          `Clear that job first, or use force-delete if this is test data.`,
          409
        );
      }
    }

    db.prepare(
      `UPDATE products SET active = 0, updated_at = datetime('now'), updated_by = ? WHERE id = ?`
    ).run(req.user.username, req.params.id);
    audit(req, 'PRODUCT_SOFT_DELETE', 'products', req.params.id, existing, { force });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── GET /products/stats/summary ───
productsRouter.get('/stats/summary', (req, res) => {
  const db = getDb();

  const byKind = db.prepare(`
    SELECT kind, COUNT(*) AS products, SUM(stock) AS total_stock,
           SUM(rate_paise * stock) AS value_paise
    FROM products WHERE active = 1
    GROUP BY kind
  `).all();

  const overall = db.prepare(`
    SELECT COUNT(*) AS products, SUM(stock) AS total_stock,
           SUM(rate_paise * stock) AS value_paise,
           SUM(CASE WHEN stock <= 2 THEN 1 ELSE 0 END) AS low_stock_count
    FROM products WHERE active = 1
  `).get();

  res.json({ overall, byKind });
});
