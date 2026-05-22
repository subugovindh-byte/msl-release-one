import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { jobCreateSchema, PRODUCT_KINDS, hsnForKind } from '@modernex/shared';
import { AppError, NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { recordInventoryMove } from '../services/inventoryMoves.js';
import {
  insertDimensions, computeDerivedDims, loadProduct, nextProductId,
} from '../services/products.js';

export const productionRouter = Router();
productionRouter.use(authenticate);

function outputLocationForStage(stage, kind) {
  if (stage === 'polish' || stage === 'done') return kind === 'block' ? 'RAW_YARD' : 'FINISHED_YARD';
  if (stage === 'cut') return kind === 'block' ? 'GANGSAW_IN' : 'GANGSAW_OUT';
  return kind === 'block' ? 'RAW_YARD' : 'GANGSAW_OUT';
}

function nextJobId(db) {
  const row = db.prepare(
    `SELECT id FROM production_jobs WHERE id LIKE 'JOB-%' ORDER BY id DESC LIMIT 1`
  ).get();
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(4), 10) + 1;
  return 'JOB-' + String(seq).padStart(6, '0');
}

const jobUpdateSchema = z.object({
  lot_id: z.string().max(30).optional(),
  stage: z.enum(['split', 'cut', 'polish', 'done']).optional(),
  status: z.enum(['In Progress', 'Complete', 'Cancelled']).optional(),
  labour_paise: z.number().int().nonnegative().optional(),
  power_paise: z.number().int().nonnegative().optional(),
  consumables_paise: z.number().int().nonnegative().optional(),
  yield_pct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

// ─── GET /production ───
productionRouter.get('/', (req, res) => {
  const db = getDb();
  const { status, from, to, limit = 100 } = req.query;
  let sql = 'SELECT * FROM production_jobs WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (from)   { sql += ' AND date >= ?'; params.push(from); }
  if (to)     { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY date DESC, id DESC LIMIT ?';
  params.push(Number(limit));

  const jobs = db.prepare(sql).all(...params);

  // Augment each with input/output summary
  for (const job of jobs) {
    const inputs = db.prepare(`
      SELECT ji.*, p.variety, p.kind, p.uom
      FROM production_job_inputs ji
      JOIN products p ON p.id = ji.product_id
      WHERE ji.job_id = ?
    `).all(job.id);
    const outputs = db.prepare(`
      SELECT jo.*, p.variety, p.kind, p.uom
      FROM production_job_outputs jo
      JOIN products p ON p.id = jo.product_id
      WHERE jo.job_id = ?
    `).all(job.id);
    job.inputs = inputs;
    job.outputs = outputs;
  }

  res.json({ jobs });
});

// ─── GET /production/:id ───
productionRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const job = db.prepare('SELECT * FROM production_jobs WHERE id = ?').get(req.params.id);
    if (!job) throw new NotFoundError('Job not found');

    job.inputs = db.prepare(`
      SELECT ji.*, p.variety, p.kind, p.uom
      FROM production_job_inputs ji
      JOIN products p ON p.id = ji.product_id
      WHERE ji.job_id = ?
    `).all(job.id);

    job.outputs = db.prepare(`
      SELECT jo.*, p.variety, p.kind, p.uom
      FROM production_job_outputs jo
      JOIN products p ON p.id = jo.product_id
      WHERE jo.job_id = ?
    `).all(job.id);

    res.json({ job });
  } catch (err) { next(err); }
});

// ─── PATCH /production/:id ───
productionRouter.patch('/:id',
  requireRole('admin', 'yard'),
  validate(jobUpdateSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM production_jobs WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Job not found');

      const fields = ['lot_id', 'stage', 'status', 'labour_paise', 'power_paise', 'consumables_paise', 'yield_pct', 'notes'];
      const updates = [];
      const params = [];

      for (const field of fields) {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          params.push(req.body[field]);
        }
      }

      if (!updates.length) {
        throw new AppError('No editable fields provided', 400);
      }

      updates.push('updated_at = datetime(\'now\')', 'updated_by = ?');
      params.push(req.user.username, req.params.id);

      db.prepare(`UPDATE production_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      const job = db.prepare('SELECT * FROM production_jobs WHERE id = ?').get(req.params.id);
      job.inputs = db.prepare(`
        SELECT ji.*, p.variety, p.kind, p.uom
        FROM production_job_inputs ji
        JOIN products p ON p.id = ji.product_id
        WHERE ji.job_id = ?
      `).all(job.id);
      job.outputs = db.prepare(`
        SELECT jo.*, p.variety, p.kind, p.uom
        FROM production_job_outputs jo
        JOIN products p ON p.id = jo.product_id
        WHERE jo.job_id = ?
      `).all(job.id);

      audit(req, 'JOB_UPDATE', 'production_jobs', req.params.id, existing, job);
      res.json({ job });
    } catch (err) { next(err); }
  }
);

/**
 * POST /production
 *
 * Create a transformation job. Inputs (existing products) are consumed,
 * outputs (new products) are created. Cost is apportioned proportionally
 * by output value (rate × quantity) per the v5 spec.
 *
 * Transaction guarantees: all stocks decrement, all new products created,
 * all child dimension rows inserted, or nothing at all.
 */
productionRouter.post('/',
  requireRole('admin', 'yard'),
  validate(jobCreateSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const b = req.body;

      // ─── 1. Load all inputs and verify stock ───
      const inputs = b.inputs.map(i => {
        const p = loadProduct(db, i.product_id);
        if (!p) throw new AppError(`Input product ${i.product_id} not found`, 400);
        if (!p.active) throw new AppError(`Product ${i.product_id} is inactive`, 400);
        if (p.stock < i.qty_consumed) {
          throw new AppError(
            `Insufficient stock for ${p.id}: have ${p.stock}, need ${i.qty_consumed}`,
            400
          );
        }
        return { product: p, qty_consumed: i.qty_consumed };
      });

      // ─── 2. Compute total input cost (existing unit_cost or rate fallback) ───
      const inputCost = inputs.reduce((sum, i) => {
        const unitCost = i.product.unit_cost_paise ?? i.product.rate_paise;
        return sum + Math.round(unitCost * i.qty_consumed);
      }, 0);
      const conversionCost =
        (b.labour_paise || 0) + (b.power_paise || 0) + (b.consumables_paise || 0);
      const totalCost = inputCost + conversionCost;

      // ─── 3. Compute output values for proportional apportionment ───
      const outputsWithValue = (b.outputs || []).map(o => ({
        ...o,
        value_paise: Math.round(o.rate_paise * o.qty),
      }));
      const totalOutputValue = outputsWithValue.reduce((s, o) => s + o.value_paise, 0);

      const jobId = nextJobId(db);
      const createdOutputIds = [];

      const tx = db.transaction(() => {
        // ─── 4. Create job header ───
        db.prepare(`
          INSERT INTO production_jobs (
            id, lot_id, stage, status, date,
            labour_paise, power_paise, consumables_paise, yield_pct, notes,
            created_by
          ) VALUES (?, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?)
        `).run(
          jobId, b.lot_id, b.stage,
          (b.outputs && b.outputs.length > 0) ? 'Complete' : 'In Progress',
          b.labour_paise || 0, b.power_paise || 0, b.consumables_paise || 0,
          b.yield_pct ?? null, b.notes || null, req.user.username
        );

        // ─── 5. Record inputs + decrement stock ───
        const insertInput = db.prepare(`
          INSERT INTO production_job_inputs (job_id, product_id, qty_consumed, unit_cost_paise)
          VALUES (?, ?, ?, ?)
        `);
        const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
        for (const i of inputs) {
          const unitCost = i.product.unit_cost_paise ?? i.product.rate_paise;
          insertInput.run(jobId, i.product.id, i.qty_consumed, unitCost);
          decStock.run(i.qty_consumed, i.product.id);
          recordInventoryMove(db, {
            productId: i.product.id,
            qty: i.qty_consumed,
            fromLocationId: i.product.current_location_id || null,
            toLocationId: null,
            moveType: 'consume',
            stage: b.stage,
            jobId,
            notes: `Consumed in production job ${jobId}`,
            createdBy: req.user.username,
            scanOutAt: new Date().toISOString(),
          });
        }

        // ─── 6. Create output products + dimension rows + job link ───
        const insertOutput = db.prepare(`
          INSERT INTO production_job_outputs (job_id, product_id, qty_produced, unit_cost_paise)
          VALUES (?, ?, ?, ?)
        `);
        for (const o of outputsWithValue) {
          const productId = nextProductId(db);
          const kindDef = PRODUCT_KINDS[o.kind];
          const uom = o.uom || kindDef?.uom || 'pc';
          const hsn = o.hsn || kindDef?.hsn || hsnForKind(o.kind);

          // Apportioned unit cost (COGS) = (total_cost × output.value / total_value) / qty_produced
          let unitCost = 0;
          if (totalOutputValue > 0 && o.qty > 0) {
            const share = o.value_paise / totalOutputValue;
            unitCost = Math.round((totalCost * share) / o.qty);
          }

          // Parent block reference: if exactly 1 input and it's a block, link as source
          const parentId = (inputs.length === 1 && inputs[0].product.kind === 'block')
            ? inputs[0].product.id : null;
          const currentLocationId = outputLocationForStage(b.stage, o.kind);

          db.prepare(`
            INSERT INTO products (
              id, kind, variety, hsn, uom, grade, lot_id, current_location_id, rate_paise, stock,
              source_job_id, source_product_id, unit_cost_paise,
              active, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
          `).run(
            productId, o.kind, o.variety, hsn, uom,
            o.grade || null, b.lot_id, currentLocationId, o.rate_paise, o.qty,
            jobId, parentId, unitCost,
            req.user.username
          );

          // Insert dimension child row
          insertDimensions(db, productId, o.kind, o.dimensions || {});

          recordInventoryMove(db, {
            productId,
            qty: o.qty,
            fromLocationId: null,
            toLocationId: currentLocationId,
            moveType: 'produce',
            stage: b.stage,
            jobId,
            notes: `Produced from job ${jobId}`,
            createdBy: req.user.username,
            scanInAt: new Date().toISOString(),
          });

          insertOutput.run(jobId, productId, o.qty, unitCost);
          createdOutputIds.push(productId);
        }
      });
      tx();

      // ─── 7. Reload full job for response ───
      const job = db.prepare('SELECT * FROM production_jobs WHERE id = ?').get(jobId);
      job.inputs = db.prepare(`
        SELECT ji.*, p.variety, p.kind, p.uom
        FROM production_job_inputs ji JOIN products p ON p.id = ji.product_id
        WHERE ji.job_id = ?`).all(jobId);
      job.outputs = db.prepare(`
        SELECT jo.*, p.variety, p.kind, p.uom
        FROM production_job_outputs jo JOIN products p ON p.id = jo.product_id
        WHERE jo.job_id = ?`).all(jobId);

      audit(req, 'JOB_CREATE', 'production_jobs', jobId, null, job);
      res.status(201).json({ job, created_products: createdOutputIds });
    } catch (err) { next(err); }
  }
);

// ─── POST /production/:id/complete (if created as In Progress, add outputs later) ───
productionRouter.post('/:id/complete',
  requireRole('admin', 'yard'),
  (req, res, next) => {
    try {
      const db = getDb();
      const job = db.prepare('SELECT * FROM production_jobs WHERE id = ?').get(req.params.id);
      if (!job) throw new NotFoundError('Job not found');
      if (job.status === 'Complete') throw new AppError('Job already complete', 400);

      db.prepare(
        'UPDATE production_jobs SET status = \'Complete\', updated_at = datetime(\'now\'), updated_by = ? WHERE id = ?'
      ).run(req.user.username, req.params.id);

      audit(req, 'JOB_COMPLETE', 'production_jobs', req.params.id, null, null);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ─── GET /production/stats/summary ───
productionRouter.get('/stats/summary', (req, res) => {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_jobs,
      SUM(CASE WHEN status = 'Complete' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
      AVG(yield_pct) AS avg_yield_pct,
      SUM(labour_paise + power_paise + consumables_paise) AS total_conversion_cost
    FROM production_jobs
    WHERE date >= date('now', '-30 days')
  `).get();
  res.json({ stats });
});
