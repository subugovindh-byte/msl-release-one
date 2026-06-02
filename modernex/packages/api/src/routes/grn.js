import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { grnSchema, transportUpdateSchema } from '@modernex/shared';
import { NotFoundError, AppError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { nextGRNId } from '../services/idGenerator.js';

export const grnRouter = Router();
grnRouter.use(authenticate);

// ─── GET /grn ───
grnRouter.get('/', (req, res) => {
  const { po_id, from, to } = req.query;
  const db = getDb();
  let sql = `
    SELECT g.*, po.variety, po.vendor_id, v.name AS vendor_name
    FROM purchase_order_receipts g
    JOIN purchase_orders po ON po.id = g.po_id
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE 1=1
  `;
  const params = [];
  if (po_id) { sql += ' AND g.po_id = ?'; params.push(po_id); }
  if (from)  { sql += ' AND g.date >= ?'; params.push(from); }
  if (to)    { sql += ' AND g.date <= ?'; params.push(to); }
  sql += ' ORDER BY g.date DESC, g.id DESC';
  res.json({ receipts: db.prepare(sql).all(...params) });
});

// ─── POST /grn ───
grnRouter.post('/',
  requireRole('admin', 'accounts'),
  validate(grnSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const g = req.body;
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(g.po_id);
      if (!po) throw new NotFoundError('Purchase order not found');
      if (po.status === 'cancelled') throw new AppError('Cannot create GRN for a cancelled PO', 400);

      // Only one QC-passed receipt per PO
      if (g.qc_pass) {
        const existingPass = db.prepare(
          `SELECT id FROM purchase_order_receipts WHERE po_id = ? AND qc_pass = 1 LIMIT 1`
        ).get(g.po_id);
        if (existingPass) {
          throw new AppError(
            `GRN ${existingPass.id} already recorded a QC-pass for PO ${g.po_id}. Only one accepted receipt is allowed per purchase order.`,
            409
          );
        }
      }

      const id = nextGRNId();
      const date = g.date || new Date().toISOString().slice(0, 10);

      db.transaction(() => {
        db.prepare(`
          INSERT INTO purchase_order_receipts
            (id, po_id, date, received_by, blocks_received, cft_received,
             condition_note, qc_pass, qc_notes, vehicle_no, lr_no, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, g.po_id, date, req.user.username,
               g.blocks_received, g.cft_received,
               g.condition_note || null, g.qc_pass ? 1 : 0,
               g.qc_notes || null, g.vehicle_no || null,
               g.lr_no || null, req.user.username);

        // Advance PO to 'received' on QC pass (awaits manual 'approved' step before production)
        if (g.qc_pass && po.status === 'new') {
          db.prepare("UPDATE purchase_orders SET status='received', updated_by=? WHERE id=?")
            .run(req.user.username, g.po_id);
        }
      })();

      const grn = db.prepare('SELECT * FROM purchase_order_receipts WHERE id = ?').get(id);
      audit(req, 'GRN_CREATE', 'purchase_order_receipts', id, null, grn);
      res.status(201).json({ receipt: grn });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /purchase/:id/transport (update transport details on a PO) ───
// Exported separately so PurchaseRouter can mount it
export function mountTransportUpdate(purchaseRouter) {
  purchaseRouter.patch('/:id/transport',
    requireRole('admin', 'accounts'),
    validate(transportUpdateSchema),
    (req, res, next) => {
      try {
        const db = getDb();
        const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
        if (!existing) throw new NotFoundError('PO not found');

        const allowed = ['transport_vendor_id','transport_bill_no','transport_bill_date',
                         'transport_paise','vehicle_no','lr_no','delivered_at_site','delivered_date'];
        const updates = [];
        const params = [];
        for (const k of allowed) {
          if (req.body[k] !== undefined) {
            updates.push(`${k} = ?`);
            params.push(k === 'delivered_at_site' ? (req.body[k] ? 1 : 0) : req.body[k]);
          }
        }
        if (updates.length === 0) return res.json({ po: existing });
        updates.push('updated_by = ?');
        params.push(req.user.username, req.params.id);
        db.prepare(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);

        const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
        audit(req, 'PO_TRANSPORT_UPDATE', 'purchase_orders', req.params.id, existing, updated);
        res.json({ po: updated });
      } catch (err) { next(err); }
    }
  );
}
