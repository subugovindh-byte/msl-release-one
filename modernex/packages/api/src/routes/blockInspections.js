import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  blockInspectionCreateSchema, blockInspectionPhotoSchema,
  poCreateSchema, GST_RATE,
} from '@modernex/shared';
import { NotFoundError, AppError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { nextInspectionId, nextPOId } from '../services/idGenerator.js';

export const blockInspectionsRouter = Router();
blockInspectionsRouter.use(authenticate);

// Decode ~ → / in :id (FY-style IDs contain slashes)
blockInspectionsRouter.param('id', (req, _res, next, id) => {
  req.params.id = id.replace(/~/g, '/');
  next();
});

// ─── GET /block-inspections ───
blockInspectionsRouter.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { status, vendor_id, from, to } = req.query;
    let sql = `
      SELECT bi.*, v.name AS vendor_name,
        (SELECT COUNT(*) FROM block_inspection_photos p WHERE p.inspection_id = bi.id) AS photo_count
      FROM block_inspections bi
      LEFT JOIN vendors v ON v.id = bi.vendor_id
      WHERE 1=1
    `;
    const params = [];
    if (status)    { sql += ' AND bi.status = ?';      params.push(status); }
    if (vendor_id) { sql += ' AND bi.vendor_id = ?';   params.push(vendor_id); }
    if (from)      { sql += ' AND bi.date >= ?';        params.push(from); }
    if (to)        { sql += ' AND bi.date <= ?';        params.push(to); }
    sql += ' ORDER BY bi.date DESC, bi.id DESC';
    res.json({ inspections: db.prepare(sql).all(...params) });
  } catch (err) { next(err); }
});

// ─── GET /block-inspections/:id ───
blockInspectionsRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const insp = db.prepare(`
      SELECT bi.*, v.name AS vendor_name
      FROM block_inspections bi
      LEFT JOIN vendors v ON v.id = bi.vendor_id
      WHERE bi.id = ?
    `).get(req.params.id);
    if (!insp) throw new NotFoundError('Inspection not found');
    const photos = db.prepare(
      `SELECT id, caption, uploaded_at, uploaded_by FROM block_inspection_photos WHERE inspection_id = ? ORDER BY id`
    ).all(req.params.id);
    res.json({ inspection: insp, photos });
  } catch (err) { next(err); }
});

// ─── GET /block-inspections/:id/photos/:photoId ─── (returns data_url)
blockInspectionsRouter.get('/:id/photos/:photoId', (req, res, next) => {
  try {
    const db = getDb();
    const photo = db.prepare(
      `SELECT * FROM block_inspection_photos WHERE id = ? AND inspection_id = ?`
    ).get(req.params.photoId, req.params.id);
    if (!photo) throw new NotFoundError('Photo not found');
    res.json({ photo });
  } catch (err) { next(err); }
});

// ─── POST /block-inspections ───
blockInspectionsRouter.post('/',
  requireRole('admin', 'accounts', 'yard'),
  validate(blockInspectionCreateSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const b = req.body;
      if (b.vendor_id) {
        const v = db.prepare('SELECT id FROM vendors WHERE id = ?').get(b.vendor_id);
        if (!v) throw new NotFoundError('Vendor not found');
      }
      const id = nextInspectionId();
      const date = b.date || new Date().toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO block_inspections
          (id, date, vendor_id, quarry_location, variety, block_count, est_cft,
           grade, defect_note, notes, status, inspected_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(id, date, b.vendor_id || null, b.quarry_location || null,
             b.variety, b.block_count, b.est_cft,
             b.grade, b.defect_note || null, b.notes || null,
             req.user.username);
      const insp = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(id);
      audit(req, 'INSPECTION_CREATE', 'block_inspections', id, null, insp);
      res.status(201).json({ inspection: insp });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /block-inspections/:id ─── (update fields, only while pending)
blockInspectionsRouter.patch('/:id',
  requireRole('admin', 'accounts', 'yard'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Inspection not found');
      // Once a PO is raised the inspection is locked for normal users; an admin
      // retains full access (e.g. to correct a detail).
      const isAdmin = (req.user.roles ?? [req.user.role]).includes('admin');
      if (existing.status === 'po_raised' && !isAdmin) {
        throw new AppError('Cannot edit an inspection after PO has been raised.', 409);
      }
      const editable = ['variety','block_count','est_cft','grade','defect_note','notes','quarry_location','vendor_id','date'];
      const updates = [], params = [];
      for (const k of editable) {
        if (req.body[k] !== undefined) { updates.push(`${k} = ?`); params.push(req.body[k]); }
      }
      if (updates.length) {
        updates.push("updated_at = datetime('now')");
        params.push(req.params.id);
        db.prepare(`UPDATE block_inspections SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
      const updated = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(req.params.id);
      res.json({ inspection: updated });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /block-inspections/:id/approve ───
// Quality gate: an inspection must be explicitly approved before a PO can be
// raised from it (pending -> approved). This is the criteria checkpoint at the
// top of the chain: only approved inspections -> PO -> (approve) -> job work.
blockInspectionsRouter.patch('/:id/approve',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Inspection not found');
      if (existing.status !== 'pending') {
        throw new AppError(`Cannot approve — status is '${existing.status}'. Only 'pending' inspections can be approved.`, 409);
      }
      db.prepare(`
        UPDATE block_inspections
        SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(req.user?.username || null, req.params.id);
      const updated = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(req.params.id);
      audit(req, 'INSPECTION_APPROVE', 'block_inspections', req.params.id, existing, updated);
      res.json({ inspection: updated });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /block-inspections/:id/reject ───
blockInspectionsRouter.patch('/:id/reject',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Inspection not found');
      if (!['pending', 'approved'].includes(existing.status)) {
        throw new AppError(`Cannot reject — status is '${existing.status}'.`, 409);
      }
      db.prepare(`UPDATE block_inspections SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`)
        .run(req.params.id);
      const updated = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(req.params.id);
      audit(req, 'INSPECTION_REJECT', 'block_inspections', req.params.id, existing, updated);
      res.json({ inspection: updated });
    } catch (err) { next(err); }
  }
);

// ─── POST /block-inspections/:id/raise-po ───
// Creates a PO from this inspection and marks inspection as po_raised.
blockInspectionsRouter.post('/:id/raise-po',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const insp = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(req.params.id);
      if (!insp) throw new NotFoundError('Inspection not found');
      if (insp.status === 'po_raised') {
        // Genuinely already raised only if that PO still exists. If it was deleted,
        // revert to 'approved' and fall through so a replacement PO can be raised.
        const existingPo = insp.po_id ? db.prepare('SELECT id FROM purchase_orders WHERE id = ?').get(insp.po_id) : null;
        if (existingPo) {
          throw new AppError(`PO already raised for inspection ${req.params.id} — see ${insp.po_id}.`, 409);
        }
        db.prepare("UPDATE block_inspections SET status = 'approved', po_id = NULL WHERE id = ?").run(req.params.id);
        insp.status = 'approved';
        insp.po_id = null;
      }
      if (insp.status === 'rejected') {
        throw new AppError(`Cannot raise PO — inspection ${req.params.id} was rejected.`, 409);
      }
      if (insp.status !== 'approved') {
        throw new AppError(
          `Cannot raise PO — inspection ${req.params.id} is '${insp.status}'. It must be approved first.`,
          409
        );
      }
      if (!insp.vendor_id) throw new AppError('Inspection has no vendor. Update it first.', 400);

      // Accept overrides from body (user may adjust rate/transport at PO creation time)
      const rate = req.body.rate_per_cft_paise;
      const transport = req.body.transport_paise || 0;
      const notes = req.body.notes || insp.notes || null;
      const date = req.body.date || insp.date;

      if (!rate || rate <= 0) throw new AppError('rate_per_cft_paise is required to raise a PO.', 400);

      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(insp.vendor_id);
      if (!vendor) throw new NotFoundError('Vendor not found');

      const cft = insp.est_cft;
      const blocks = insp.block_count;
      const taxable = Math.round(cft * rate) + (transport || 0);
      const gst = Math.round(taxable * GST_RATE);
      const total = taxable + gst;

      // Prevent duplicate PO for same vendor/variety/date/blocks/cft/rate
      const dupe = db.prepare(`
        SELECT id FROM purchase_orders
        WHERE vendor_id = ? AND variety = ? AND date = ?
          AND blocks = ? AND cft = ? AND rate_per_cft_paise = ?
          AND status != 'cancelled'
        LIMIT 1
      `).get(insp.vendor_id, insp.variety, date, blocks, cft, rate);
      if (dupe) throw new AppError(`Duplicate PO: ${dupe.id} already exists for this combination.`, 409);

      const poId = nextPOId();

      db.transaction(() => {
        db.prepare(`
          INSERT INTO purchase_orders
            (id, date, vendor_id, variety, blocks, cft, rate_per_cft_paise,
             transport_paise, taxable_paise, gst_paise, total_paise, notes, inspection_id, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(poId, date, insp.vendor_id, insp.variety, blocks, cft, rate,
               transport, taxable, gst, total, notes, req.params.id, req.user.username);

        db.prepare(`
          UPDATE block_inspections
          SET status = 'po_raised', po_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(poId, req.params.id);
      })();

      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
      const updatedInsp = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(req.params.id);
      audit(req, 'INSPECTION_RAISE_PO', 'block_inspections', req.params.id, insp, { po_id: poId });
      res.status(201).json({ po, inspection: updatedInsp });
    } catch (err) { next(err); }
  }
);

// ─── POST /block-inspections/:id/photos ───
blockInspectionsRouter.post('/:id/photos',
  requireRole('admin', 'accounts', 'yard'),
  validate(blockInspectionPhotoSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const insp = db.prepare('SELECT id FROM block_inspections WHERE id = ?').get(req.params.id);
      if (!insp) throw new NotFoundError('Inspection not found');

      // Limit to 10 photos per inspection
      const count = db.prepare('SELECT COUNT(*) AS n FROM block_inspection_photos WHERE inspection_id = ?').get(req.params.id);
      if (count.n >= 10) throw new AppError('Maximum 10 photos per inspection.', 400);

      const { lastInsertRowid } = db.prepare(
        `INSERT INTO block_inspection_photos (inspection_id, data_url, caption, uploaded_by) VALUES (?, ?, ?, ?)`
      ).run(req.params.id, req.body.data_url, req.body.caption || null, req.user.username);

      const photo = db.prepare('SELECT id, caption, uploaded_at, uploaded_by FROM block_inspection_photos WHERE id = ?').get(lastInsertRowid);
      res.status(201).json({ photo });
    } catch (err) { next(err); }
  }
);

// ─── DELETE /block-inspections/:id/photos/:photoId ───
blockInspectionsRouter.delete('/:id/photos/:photoId',
  requireRole('admin', 'accounts', 'yard'),
  (req, res, next) => {
    try {
      const db = getDb();
      const photo = db.prepare('SELECT id FROM block_inspection_photos WHERE id = ? AND inspection_id = ?')
        .get(req.params.photoId, req.params.id);
      if (!photo) throw new NotFoundError('Photo not found');
      db.prepare('DELETE FROM block_inspection_photos WHERE id = ?').run(req.params.photoId);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ─── DELETE /block-inspections/:id ─── (only pending)
blockInspectionsRouter.delete('/:id',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM block_inspections WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Inspection not found');
      // PO-raised inspections are locked for normal users; admin has full access —
      // EXCEPT once the chain is committed. If the linked PO still exists and has
      // progressed past 'new' (blocks received / in production / possibly sold),
      // nobody may delete it, so the audit trail behind a sale can't be unwound.
      const isAdmin = (req.user.roles ?? [req.user.role]).includes('admin');
      if (existing.status === 'po_raised' && !isAdmin) {
        throw new AppError(`Cannot delete — PO ${existing.po_id} was already raised from this inspection.`, 409);
      }
      if (existing.po_id) {
        const po = db.prepare('SELECT id, status FROM purchase_orders WHERE id = ?').get(existing.po_id);
        if (po && !['new', 'cancelled'].includes(po.status)) {
          throw new AppError(
            `Cannot delete — PO ${po.id} is '${po.status}' (blocks received/committed). ` +
            `Records behind a committed or sold PO cannot be removed, even by admin.`,
            409
          );
        }
      }
      db.prepare('DELETE FROM block_inspections WHERE id = ?').run(req.params.id);
      audit(req, 'INSPECTION_DELETE', 'block_inspections', req.params.id, existing, null);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);
