import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { vendorSchema } from '@modernex/shared';
import { NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { nextVendorId } from '../services/idGenerator.js';

export const vendorsRouter = Router();

vendorsRouter.use(authenticate);

vendorsRouter.get('/', (req, res) => {
  const { q, type, msme } = req.query;
  const db = getDb();
  let sql = `
    SELECT v.*,
      COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE vendor_id = v.id), 0) AS po_count,
      COALESCE((SELECT SUM(total_paise) FROM purchase_orders WHERE vendor_id = v.id AND status != 'cancelled'), 0) AS total_po_paise,
      COALESCE((SELECT SUM(p.amount_paise) FROM payments p
                JOIN purchase_orders po ON po.id = p.po_id
                WHERE po.vendor_id = v.id AND p.type = 'payment'), 0) AS total_paid_paise
    FROM vendors v
    WHERE 1=1
  `;
  const params = [];
  if (q) {
    sql += ' AND (v.name LIKE ? OR v.gstin LIKE ? OR v.id LIKE ? OR v.email LIKE ? OR v.contact_person LIKE ?)';
    const p = `%${q}%`;
    params.push(p, p, p, p, p);
  }
  if (type) { sql += ' AND v.type = ?'; params.push(type); }
  if (msme !== undefined) { sql += ' AND v.msme = ?'; params.push(msme === 'true' ? 1 : 0); }
  sql += ' ORDER BY v.name';
  const rows = db.prepare(sql).all(...params).map(r => ({
    ...r,
    outstanding_paise: r.total_po_paise - r.total_paid_paise,
  }));
  res.json({ vendors: rows });
});

vendorsRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    if (!vendor) throw new NotFoundError('Vendor not found');
    res.json({ vendor });
  } catch (err) { next(err); }
});

vendorsRouter.post('/',
  requireRole('admin', 'accounts'),
  validate(vendorSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const id = nextVendorId();
      const v = req.body;
      db.prepare(
        `INSERT INTO vendors (id, name, gstin, state, contact, type, msme, msme_number,
                              contact_person, address, pincode, email, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, v.name, v.gstin || null, v.state, v.contact || null, v.type,
            v.msme ? 1 : 0, v.msme_number || null,
            v.contact_person || null, v.address || null,
            v.pincode || null, v.email || null,
            req.user.username);
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id);
      audit(req, 'VENDOR_CREATE', 'vendors', id, null, vendor);
      res.status(201).json({ vendor });
    } catch (err) { next(err); }
  }
);

vendorsRouter.patch('/:id',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Vendor not found');

      const allowed = ['name', 'gstin', 'state', 'contact', 'type', 'msme', 'msme_number', 'contact_person', 'address', 'pincode', 'email'];
      const updates = [];
      const params = [];
      for (const k of allowed) {
        if (req.body[k] !== undefined) {
          updates.push(`${k} = ?`);
          params.push(k === 'msme' ? (req.body[k] ? 1 : 0) : req.body[k]);
        }
      }
      if (updates.length === 0) return res.json({ vendor: existing });

      updates.push('updated_by = ?');
      params.push(req.user.username);
      params.push(req.params.id);
      db.prepare(`UPDATE vendors SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      const updated = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
      audit(req, 'VENDOR_UPDATE', 'vendors', req.params.id, existing, updated);
      res.json({ vendor: updated });
    } catch (err) { next(err); }
  }
);

vendorsRouter.delete('/:id', requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('Vendor not found');

    const hasPOs = db.prepare(
      'SELECT COUNT(*) as n FROM purchase_orders WHERE vendor_id = ?'
    ).get(req.params.id);
    if (hasPOs.n > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${hasPOs.n} PO(s) reference this vendor`,
      });
    }

    db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
    audit(req, 'VENDOR_DELETE', 'vendors', req.params.id, existing, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
