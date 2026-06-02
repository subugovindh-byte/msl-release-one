import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { poCreateSchema, GST_RATE } from '@modernex/shared';
import { NotFoundError, AppError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { nextPOId } from '../services/idGenerator.js';

export const purchaseRouter = Router();

purchaseRouter.use(authenticate);

// FY-format IDs contain / (e.g. PO/26-27/1). Frontend substitutes / with ~ to
// avoid Azure IIS normalising %2F → / before Express sees it. Decode here.
purchaseRouter.param('id', (req, _res, next, id) => {
  req.params.id = id.replace(/~/g, '/');
  next();
});

const PAID_SUBQUERY = `COALESCE((
  SELECT SUM(amount_paise) FROM payments
  WHERE po_id = po.id AND type = 'payment'
), 0)`;

// ─── GET /purchase ───
purchaseRouter.get('/', requireRole('admin', 'accounts', 'yard'), (req, res) => {
  const { vendor_id, status, from, to } = req.query;
  const db = getDb();
  let sql = `
    SELECT po.*,
           v.name AS vendor_name,
           ${PAID_SUBQUERY} AS paid_paise
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE 1=1
  `;
  const params = [];
  if (vendor_id) { sql += ' AND po.vendor_id = ?'; params.push(vendor_id); }
  if (status)    { sql += ' AND po.status = ?';    params.push(status); }
  if (from)      { sql += ' AND po.date >= ?';     params.push(from); }
  if (to)        { sql += ' AND po.date <= ?';     params.push(to); }
  sql += ' ORDER BY po.date DESC, po.id DESC';
  const rows = db.prepare(sql).all(...params).map(r => ({
    ...r,
    balance_paise: r.total_paise - r.paid_paise,
    payment_status: r.paid_paise === 0 ? 'unpaid'
                  : r.paid_paise >= r.total_paise ? 'paid'
                  : 'partial',
  }));
  res.json({ purchase_orders: rows });
});

// ─── GET /purchase/:id ───
purchaseRouter.get('/:id', requireRole('admin', 'accounts', 'yard'), (req, res, next) => {
  try {
    const db = getDb();
    const po = db.prepare(`
      SELECT po.*,
             v.name        AS vendor_name,
             v.gstin       AS vendor_gstin,
             v.state       AS vendor_state,
             v.contact     AS vendor_contact,
             v.type        AS vendor_type,
             v.msme        AS vendor_msme,
             v.msme_number AS vendor_msme_number,
             ${PAID_SUBQUERY} AS paid_paise
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE po.id = ?
    `).get(req.params.id);
    if (!po) throw new NotFoundError('PO not found');

    const payments = db.prepare(
      `SELECT * FROM payments WHERE po_id = ? AND type = 'payment' ORDER BY date DESC, id DESC`
    ).all(req.params.id);

    res.json({
      po: {
        ...po,
        balance_paise: po.total_paise - po.paid_paise,
        payment_status: po.paid_paise === 0 ? 'unpaid'
                      : po.paid_paise >= po.total_paise ? 'paid'
                      : 'partial',
      },
      payments,
    });
  } catch (err) { next(err); }
});

// ─── POST /purchase ───
purchaseRouter.post('/',
  requireRole('admin', 'accounts'),
  validate(poCreateSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const p = req.body;
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(p.vendor_id);
      if (!vendor) throw new NotFoundError('Vendor not found');

      const taxable = Math.round(p.cft * p.rate_per_cft_paise) + (p.transport_paise || 0);
      const gst = Math.round(taxable * GST_RATE);
      const total = taxable + gst;

      const date = new Date().toISOString().slice(0, 10);

      // Prevent exact duplicate PO (same vendor, variety, date, blocks, cft, rate)
      const dupe = db.prepare(`
        SELECT id FROM purchase_orders
        WHERE vendor_id = ? AND variety = ? AND date = ?
          AND blocks = ? AND cft = ? AND rate_per_cft_paise = ?
          AND status != 'cancelled'
        LIMIT 1
      `).get(p.vendor_id, p.variety, date, p.blocks, p.cft, p.rate_per_cft_paise);
      if (dupe) {
        throw new AppError(
          `Duplicate PO: ${dupe.id} already raised for this vendor, variety, quantity and rate today. Cancel it first if you need to re-raise.`,
          409
        );
      }

      const id = nextPOId();

      db.prepare(`
        INSERT INTO purchase_orders (
          id, date, vendor_id, variety, blocks, cft, rate_per_cft_paise,
          transport_paise, taxable_paise, gst_paise, total_paise, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, date, p.vendor_id, p.variety, p.blocks, p.cft, p.rate_per_cft_paise,
        p.transport_paise || 0, taxable, gst, total, p.notes || null, req.user.username
      );

      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
      audit(req, 'PO_CREATE', 'purchase_orders', id, null, po);
      res.status(201).json({ po });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /purchase/:id — edit PO details (only while status = 'new') ───
purchaseRouter.patch('/:id',
  requireRole('admin', 'accounts'),
  validate(poCreateSchema.partial()),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('PO not found');
      if (existing.status !== 'new') {
        throw new AppError(`Cannot edit PO ${req.params.id} — status is '${existing.status}'. Only 'new' POs can be edited.`, 409);
      }
      const p = req.body;
      const editable = ['vendor_id', 'variety', 'blocks', 'cft', 'rate_per_cft_paise', 'transport_paise', 'notes'];
      const updates = [];
      const params = [];
      for (const k of editable) {
        if (p[k] !== undefined) { updates.push(`${k} = ?`); params.push(p[k]); }
      }
      if (updates.length) {
        // Recompute financials if key fields changed
        if (p.cft !== undefined || p.rate_per_cft_paise !== undefined || p.transport_paise !== undefined) {
          const cft = p.cft ?? existing.cft;
          const rate = p.rate_per_cft_paise ?? existing.rate_per_cft_paise;
          const transport = p.transport_paise ?? existing.transport_paise;
          const taxable = Math.round(cft * rate) + (transport || 0);
          const gst = Math.round(taxable * GST_RATE);
          updates.push('taxable_paise = ?', 'gst_paise = ?', 'total_paise = ?');
          params.push(taxable, gst, taxable + gst);
        }
        updates.push('updated_by = ?');
        params.push(req.user.username, req.params.id);
        db.prepare(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
      const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      audit(req, 'PO_UPDATE', 'purchase_orders', req.params.id, existing, updated);
      res.json({ po: updated });
    } catch (err) { next(err); }
  }
);

// ─── DELETE /purchase/:id — only allowed while status = 'new' ───
purchaseRouter.delete('/:id',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('PO not found');
      if (existing.status !== 'new') {
        throw new AppError(`Cannot delete PO ${req.params.id} — status is '${existing.status}'. Cancel it instead.`, 409);
      }
      const hasPayments = db.prepare('SELECT 1 FROM payments WHERE po_id = ? LIMIT 1').get(req.params.id);
      if (hasPayments) throw new AppError(`Cannot delete PO ${req.params.id} — payments have been recorded against it.`, 409);
      db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
      audit(req, 'PO_DELETE', 'purchase_orders', req.params.id, existing, null);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /purchase/:id/status ───
// Enforced flow: new → received (GRN) → approved → [production ready]
// Cancellation is allowed from any non-approved/non-received state.
const ALLOWED_TRANSITIONS = {
  new:      ['received', 'cancelled'],
  received: ['approved', 'cancelled'],
  approved: ['cancelled'],
  cancelled: [],
};

purchaseRouter.patch('/:id/status',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const { status } = req.body;
      if (!['new', 'approved', 'received', 'cancelled'].includes(status)) {
        throw new AppError('Invalid status', 400);
      }
      const db = getDb();
      const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('PO not found');

      const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        throw new AppError(
          `Cannot move PO from '${existing.status}' to '${status}'. ` +
          `Flow: new → received (via GRN) → approved → cancelled.`,
          400
        );
      }

      // To mark 'approved', a QC-passed GRN must exist
      if (status === 'approved') {
        const qcPass = db.prepare(
          `SELECT id FROM purchase_order_receipts WHERE po_id = ? AND qc_pass = 1 LIMIT 1`
        ).get(req.params.id);
        if (!qcPass) {
          throw new AppError(
            `Cannot approve PO ${req.params.id} — no QC-passed goods receipt (GRN) found. ` +
            `Record a GRN with QC pass first.`,
            400
          );
        }
      }

      db.prepare('UPDATE purchase_orders SET status = ?, updated_by = ? WHERE id = ?')
        .run(status, req.user.username, req.params.id);

      const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      audit(req, 'PO_STATUS_CHANGE', 'purchase_orders', req.params.id,
            { status: existing.status }, { status });
      res.json({ po: updated });
    } catch (err) { next(err); }
  }
);
