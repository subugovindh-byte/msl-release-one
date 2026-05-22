import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { varietyMasterSchema } from '@modernex/shared';
import { NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';

export const varietyMasterRouter = Router();
varietyMasterRouter.use(authenticate);

// ─── GET /variety-master ───
varietyMasterRouter.get('/', (req, res) => {
  const { region, active, q } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM variety_master WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (variety_name LIKE ? OR region LIKE ? OR notes LIKE ?)';
    const p = `%${q}%`;
    params.push(p, p, p);
  }
  if (region) { sql += ' AND region = ?'; params.push(region); }
  if (active !== undefined) { sql += ' AND active = ?'; params.push(active === 'true' ? 1 : 0); }
  sql += ' ORDER BY sort_order, variety_name';
  res.json({ varieties: db.prepare(sql).all(...params) });
});

// ─── GET /variety-master/:id ───
varietyMasterRouter.get('/:id', (req, res, next) => {
  try {
    const v = getDb().prepare('SELECT * FROM variety_master WHERE id = ?').get(req.params.id);
    if (!v) throw new NotFoundError('Variety not found');
    res.json({ variety: v });
  } catch (err) { next(err); }
});

// ─── POST /variety-master ───
varietyMasterRouter.post('/',
  requireRole('admin'),
  validate(varietyMasterSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const last = db.prepare("SELECT id FROM variety_master ORDER BY id DESC LIMIT 1").get();
      const seq = last ? parseInt(last.id.split('-')[1]) + 1 : 1;
      const id = `VM-${String(seq).padStart(3, '0')}`;
      const v = req.body;
      db.prepare(`
        INSERT INTO variety_master (id, variety_name, region, hsn_default, uom_default,
          kind_default, typical_grades, photo_url, notes, active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, v.variety_name, v.region, v.hsn_default, v.uom_default,
             v.kind_default, v.typical_grades, v.photo_url || null,
             v.notes || null, v.active ? 1 : 0, v.sort_order ?? 0);
      const row = db.prepare('SELECT * FROM variety_master WHERE id = ?').get(id);
      audit(req, 'VARIETY_CREATE', 'variety_master', id, null, row);
      res.status(201).json({ variety: row });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /variety-master/:id ───
varietyMasterRouter.patch('/:id',
  requireRole('admin'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM variety_master WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Variety not found');
      const allowed = ['variety_name','region','hsn_default','uom_default','kind_default',
                       'typical_grades','photo_url','notes','active','sort_order'];
      const updates = [];
      const params = [];
      for (const k of allowed) {
        if (req.body[k] !== undefined) {
          updates.push(`${k} = ?`);
          params.push(k === 'active' ? (req.body[k] ? 1 : 0) : req.body[k]);
        }
      }
      if (updates.length === 0) return res.json({ variety: existing });
      params.push(req.params.id);
      db.prepare(`UPDATE variety_master SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      const updated = db.prepare('SELECT * FROM variety_master WHERE id = ?').get(req.params.id);
      audit(req, 'VARIETY_UPDATE', 'variety_master', req.params.id, existing, updated);
      res.json({ variety: updated });
    } catch (err) { next(err); }
  }
);

// ─── DELETE /variety-master/:id ───
varietyMasterRouter.delete('/:id', requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM variety_master WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('Variety not found');
    const inUse = db.prepare("SELECT COUNT(*) as n FROM products WHERE variety = ?").get(existing.variety_name);
    if (inUse.n > 0)
      return res.status(409).json({ error: `Cannot delete: ${inUse.n} product(s) use this variety` });
    db.prepare('DELETE FROM variety_master WHERE id = ?').run(req.params.id);
    audit(req, 'VARIETY_DELETE', 'variety_master', req.params.id, existing, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
