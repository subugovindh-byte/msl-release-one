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

      // PO date defaults to today; an admin may set/backdate it explicitly.
      const isAdmin = (req.user.roles ?? [req.user.role]).includes('admin');
      const date = (isAdmin && p.date) ? p.date : new Date().toISOString().slice(0, 10);

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
          transport_paise, taxable_paise, gst_paise, total_paise, notes,
          block_number, incoterm, defect_clause, allowance_pct, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, date, p.vendor_id, p.variety, p.blocks, p.cft, p.rate_per_cft_paise,
        p.transport_paise || 0, taxable, gst, total, p.notes || null,
        p.block_number || null, p.incoterm || null, p.defect_clause || null, p.allowance_pct || 0,
        req.user.username
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
      const editable = ['vendor_id', 'variety', 'blocks', 'cft', 'rate_per_cft_paise', 'transport_paise', 'notes', 'block_number', 'incoterm', 'defect_clause', 'allowance_pct'];
      // Only an admin may change the PO date (backdating/corrections).
      if ((req.user.roles ?? [req.user.role]).includes('admin')) editable.push('date');
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

// ─── DELETE /purchase/:id — allowed for 'new' and 'cancelled' POs with no payments/GRN ───
purchaseRouter.delete('/:id',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('PO not found');

      // Only new or cancelled POs can be deleted
      if (!['new', 'cancelled'].includes(existing.status)) {
        throw new AppError(
          `Cannot delete PO ${req.params.id} — status is '${existing.status}'. Cancel it first, then delete.`,
          409
        );
      }
      // Block if payments have been made
      const hasPayments = db.prepare('SELECT 1 FROM payments WHERE po_id = ? LIMIT 1').get(req.params.id);
      if (hasPayments) {
        throw new AppError(`Cannot delete PO ${req.params.id} — payments have been recorded against it.`, 409);
      }
      // Block if blocks have already been received (GRN exists)
      const hasGRN = db.prepare('SELECT 1 FROM purchase_order_receipts WHERE po_id = ? LIMIT 1').get(req.params.id);
      if (hasGRN) {
        throw new AppError(`Cannot delete PO ${req.params.id} — a goods receipt (GRN) has been recorded. Remove the GRN first.`, 409);
      }

      db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
      audit(req, 'PO_DELETE', 'purchase_orders', req.params.id, existing, null);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /purchase/:id/status ───
// Enforced flow: new → received (GRN) → approved → [production ready]
// Cancellation is allowed from any non-cancelled state.
// Unapprove: approved → new (rolls back approval, clears approved_at)
// Flow A (simple): new → approved → cancelled
// Flow B (with GRN): new → received → approved → cancelled
const ALLOWED_TRANSITIONS = {
  new:      ['received', 'approved', 'cancelled'],
  received: ['approved', 'cancelled'],
  approved: ['new', 'closed', 'cancelled'],
  closed:   [],
  cancelled: [],
};

// Three-way match tolerance: invoice may differ from expected by up to the
// larger of 1% or ₹100 before it's flagged as a mismatch.
function matchTolerance(expectedPaise) {
  return Math.max(10000, Math.round(expectedPaise * 0.01));
}

// Compute the expected payable from ACTUAL delivered quantity (spec step 7):
//   rate × CFT received, less commercial allowance, plus transport, plus GST.
function computeExpectedFromReceipts(db, po) {
  const grn = db.prepare(
    `SELECT COALESCE(SUM(cft_received),0) AS cft, COALESCE(SUM(blocks_received),0) AS blocks,
            COALESCE(SUM(net_weight_kg),0) AS kg
     FROM purchase_order_receipts WHERE po_id = ? AND qc_pass = 1`
  ).get(po.id);
  const cftReceived = grn.cft || 0;
  // Fall back to ordered CFT if nothing received yet
  const cftBasis = cftReceived > 0 ? cftReceived : po.cft;
  const allowancePct = po.allowance_pct || 0;
  const billableCft = cftBasis * (1 - allowancePct / 100);
  const material = Math.round(billableCft * po.rate_per_cft_paise);
  const taxable = material + (po.transport_paise || 0);
  const gst = Math.round(taxable * GST_RATE);
  return {
    cft_received: cftReceived,
    blocks_received: grn.blocks || 0,
    net_weight_kg: grn.kg || 0,
    billable_cft: Math.round(billableCft * 100) / 100,
    allowance_pct: allowancePct,
    material_paise: material,
    transport_paise: po.transport_paise || 0,
    gst_paise: gst,
    expected_paise: taxable + gst,
  };
}

// ─── GET /purchase/:id/match — three-way match breakdown ───
purchaseRouter.get('/:id/match',
  requireRole('admin', 'accounts', 'yard'),
  (req, res, next) => {
    try {
      const db = getDb();
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      if (!po) throw new NotFoundError('PO not found');
      const paidRow = db.prepare(
        `SELECT COALESCE(SUM(amount_paise),0) AS v FROM payments WHERE po_id = ? AND type = 'payment'`
      ).get(req.params.id);
      const expected = computeExpectedFromReceipts(db, po);
      const invoiced = po.final_invoice_paise ?? null;
      const variance = invoiced != null ? invoiced - expected.expected_paise : null;
      const tol = matchTolerance(expected.expected_paise);
      res.json({
        po_id: po.id,
        ordered: { cft: po.cft, blocks: po.blocks, total_paise: po.total_paise },
        received: expected,
        invoiced: { final_invoice_no: po.final_invoice_no, final_invoice_paise: invoiced },
        variance_paise: variance,
        within_tolerance: variance != null ? Math.abs(variance) <= tol : null,
        tolerance_paise: tol,
        matched_at: po.matched_at,
        paid_paise: paidRow?.v ?? 0,
      });
    } catch (err) { next(err); }
  }
);

// ─── POST /purchase/:id/match — record quarry's final invoice + confirm match ───
purchaseRouter.post('/:id/match',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      if (!po) throw new NotFoundError('PO not found');
      if (po.status === 'cancelled') throw new AppError('Cannot match a cancelled PO', 400);

      const finalNo = (req.body.final_invoice_no || '').toString().slice(0, 50) || null;
      const finalPaise = Number(req.body.final_invoice_paise);
      if (!Number.isFinite(finalPaise) || finalPaise <= 0) {
        throw new AppError('final_invoice_paise must be a positive number', 400);
      }
      const force = req.body.force === true;

      const expected = computeExpectedFromReceipts(db, po);
      const variance = finalPaise - expected.expected_paise;
      const tol = matchTolerance(expected.expected_paise);
      const withinTol = Math.abs(variance) <= tol;

      // Store the invoice regardless; only set matched_at if reconciled (or forced)
      const matched = withinTol || force;
      const nowISO = new Date().toISOString();
      db.prepare(
        `UPDATE purchase_orders
         SET final_invoice_no = ?, final_invoice_paise = ?,
             matched_at = ?, matched_by = ?, updated_by = ?
         WHERE id = ?`
      ).run(finalNo, finalPaise, matched ? nowISO : null, matched ? req.user.username : null,
            req.user.username, req.params.id);

      audit(req, 'PO_MATCH', 'purchase_orders', req.params.id, null,
            { final_invoice_no: finalNo, final_invoice_paise: finalPaise, variance, matched, force });

      const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      res.json({
        po: updated,
        match: {
          expected_paise: expected.expected_paise,
          invoiced_paise: finalPaise,
          variance_paise: variance,
          within_tolerance: withinTol,
          tolerance_paise: tol,
          matched,
          breakdown: expected,
        },
      });
    } catch (err) { next(err); }
  }
);

purchaseRouter.patch('/:id/status',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const { status } = req.body;
      if (!['new', 'approved', 'received', 'closed', 'cancelled'].includes(status)) {
        throw new AppError('Invalid status', 400);
      }
      const db = getDb();
      const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('PO not found');

      const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        throw new AppError(
          `Cannot move PO from '${existing.status}' to '${status}'. ` +
          `Allowed: ${allowed.join(', ') || 'none'}.`,
          400
        );
      }

      // Closeout (spec step 8) requires a confirmed three-way match AND full payment
      if (status === 'closed') {
        if (!existing.matched_at) {
          throw new AppError(`Cannot close PO ${req.params.id} — three-way match not confirmed yet.`, 400);
        }
        const paidRow = db.prepare(
          `SELECT COALESCE(SUM(amount_paise),0) AS v FROM payments WHERE po_id = ? AND type = 'payment'`
        ).get(req.params.id);
        const paid = paidRow?.v ?? 0;
        if (paid < existing.total_paise) {
          throw new AppError(
            `Cannot close PO ${req.params.id} — outstanding balance ${((existing.total_paise - paid) / 100).toFixed(2)}. Pay in full first.`,
            400
          );
        }
      }

      // If approving from 'received', a QC-passed GRN must exist
      // Direct new → approved (no GRN) is allowed for admin fast-track
      if (status === 'approved' && existing.status === 'received') {
        const qcPass = db.prepare(
          `SELECT id FROM purchase_order_receipts WHERE po_id = ? AND qc_pass = 1 LIMIT 1`
        ).get(req.params.id);
        if (!qcPass) {
          throw new AppError(
            `Cannot approve PO ${req.params.id} from 'received' — no QC-passed GRN found.`,
            400
          );
        }
      }

      const tx = db.transaction(() => {
        // Set status, recording or clearing the relevant timestamp
        const tsCol = status === 'received' ? 'received_at'
                    : status === 'approved'  ? 'approved_at'
                    : status === 'closed'    ? 'closed_at'
                    : status === 'cancelled' ? 'cancelled_at' : null;
        // Unapprove (approved → new): clear approved_at
        const clearCol = status === 'new' && existing.status === 'approved' ? 'approved_at' : null;
        const nowISO = new Date().toISOString();
        if (tsCol) {
          db.prepare(`UPDATE purchase_orders SET status = ?, ${tsCol} = ?, updated_by = ? WHERE id = ?`)
            .run(status, nowISO, req.user.username, req.params.id);
        } else if (clearCol) {
          db.prepare(`UPDATE purchase_orders SET status = ?, ${clearCol} = NULL, updated_by = ? WHERE id = ?`)
            .run(status, req.user.username, req.params.id);
        } else {
          db.prepare('UPDATE purchase_orders SET status = ?, updated_by = ? WHERE id = ?')
            .run(status, req.user.username, req.params.id);
        }

        // When cancelling a partially-paid PO, optionally credit the paid
        // amount as a vendor advance for adjustment against future purchases.
        if (status === 'cancelled' && req.body.advance_paid) {
          const paidRow = db.prepare(
            `SELECT COALESCE(SUM(amount_paise),0) AS v FROM payments WHERE po_id = ? AND type = 'payment'`
          ).get(req.params.id);
          const paid = paidRow?.v ?? 0;
          if (paid > 0) {
            db.prepare('UPDATE vendors SET advance_paise = advance_paise + ? WHERE id = ?')
              .run(paid, existing.vendor_id);
          }
        }
      });
      tx();

      const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
      audit(req, 'PO_STATUS_CHANGE', 'purchase_orders', req.params.id,
            { status: existing.status }, { status, advance_paid: req.body.advance_paid ?? false });
      res.json({ po: updated });
    } catch (err) { next(err); }
  }
);
