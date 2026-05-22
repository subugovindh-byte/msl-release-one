import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError, AppError } from '../middleware/error.js';
import { audit } from '../services/audit.js';

export const collectionAccountsRouter = Router();
collectionAccountsRouter.use(authenticate);

// ─── Schemas ───
const baseSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(['upi', 'bank', 'both']),
  // UPI fields
  upi_id: z.string().max(100).optional(),
  upi_name: z.string().max(100).optional(),
  // Bank fields
  account_number: z.string().max(30).optional(),
  ifsc: z.string().length(11).regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
  bank_name: z.string().max(100).optional(),
  branch: z.string().max(100).optional(),
  account_holder: z.string().max(100).optional(),
  account_type: z.enum(['savings', 'current', 'od', 'cc']).optional(),
  notes: z.string().max(500).optional(),
  is_default: z.boolean().default(false),
});

const createSchema = baseSchema.refine(d => {
  if (d.kind === 'upi')  return !!d.upi_id;
  if (d.kind === 'bank') return !!(d.account_number && d.ifsc);
  if (d.kind === 'both') return !!(d.upi_id && d.account_number && d.ifsc);
  return true;
}, { message: 'Missing required fields for the chosen account kind' });

// For updates: partial base schema, omit kind (can't change kind after creation)
const updateSchema = baseSchema.omit({ kind: true }).partial();

// ─── Helpers ───
function nextCAId(db) {
  const row = db.prepare(
    `SELECT id FROM collection_accounts WHERE id LIKE 'CA%' ORDER BY id DESC LIMIT 1`
  ).get();
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(2), 10) + 1;
  return 'CA' + String(seq).padStart(3, '0');
}

// ─── GET / — list ───
collectionAccountsRouter.get('/', (req, res) => {
  const { active, kind } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM collection_accounts WHERE 1=1';
  const params = [];
  if (active !== undefined) { sql += ' AND active = ?'; params.push(active === 'true' ? 1 : 0); }
  if (kind) { sql += ' AND kind = ?'; params.push(kind); }
  sql += ' ORDER BY is_default DESC, name';
  const accounts = db.prepare(sql).all(...params);
  // Don't expose full account numbers in list — mask all but last 4
  const masked = accounts.map(a => ({
    ...a,
    account_number_masked: a.account_number
      ? '****' + a.account_number.slice(-4)
      : null,
  }));
  res.json({ accounts: masked });
});

// ─── GET /:id ───
collectionAccountsRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const account = db.prepare(
      'SELECT * FROM collection_accounts WHERE id = ?'
    ).get(req.params.id);
    if (!account) throw new NotFoundError('Account not found');
    res.json({ account });
  } catch (err) { next(err); }
});

// ─── POST / — create (admin only) ───
collectionAccountsRouter.post('/',
  requireRole('admin', 'accounts'),
  validate(createSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const a = req.body;
      const id = nextCAId(db);

      const tx = db.transaction(() => {
        if (a.is_default) {
          db.prepare('UPDATE collection_accounts SET is_default = 0 WHERE is_default = 1').run();
        }
        db.prepare(`
          INSERT INTO collection_accounts (
            id, name, kind, upi_id, upi_name,
            account_number, ifsc, bank_name, branch, account_holder, account_type,
            is_default, active, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          id, a.name, a.kind,
          a.upi_id || null, a.upi_name || null,
          a.account_number || null, a.ifsc || null,
          a.bank_name || null, a.branch || null,
          a.account_holder || null, a.account_type || null,
          a.is_default ? 1 : 0,
          a.notes || null,
          req.user.username
        );
      });
      tx();

      const account = db.prepare('SELECT * FROM collection_accounts WHERE id = ?').get(id);
      audit(req, 'CA_CREATE', 'collection_accounts', id, null, account);
      res.status(201).json({ account });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /:id ───
collectionAccountsRouter.patch('/:id',
  requireRole('admin', 'accounts'),
  validate(updateSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM collection_accounts WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Account not found');

      const fields = ['name','upi_id','upi_name','account_number','ifsc',
                      'bank_name','branch','account_holder','account_type',
                      'notes','is_default'];
      const updates = [];
      const params = [];
      for (const k of fields) {
        if (req.body[k] !== undefined) {
          let v = req.body[k];
          if (k === 'is_default') v = v ? 1 : 0;
          updates.push(`${k} = ?`);
          params.push(v);
        }
      }
      if (updates.length === 0) return res.json({ account: existing });

      updates.push('updated_at = datetime(\'now\')', 'updated_by = ?');
      params.push(req.user.username, req.params.id);

      const tx = db.transaction(() => {
        if (req.body.is_default === true) {
          db.prepare('UPDATE collection_accounts SET is_default = 0 WHERE is_default = 1 AND id != ?').run(req.params.id);
        }
        db.prepare(`UPDATE collection_accounts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      });
      tx();

      const updated = db.prepare('SELECT * FROM collection_accounts WHERE id = ?').get(req.params.id);
      audit(req, 'CA_UPDATE', 'collection_accounts', req.params.id, existing, updated);
      res.json({ account: updated });
    } catch (err) { next(err); }
  }
);

// ─── POST /:id/set-default ───
collectionAccountsRouter.post('/:id/set-default',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM collection_accounts WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Account not found');
      if (!existing.active) throw new AppError('Cannot default an inactive account', 400);

      const tx = db.transaction(() => {
        db.prepare('UPDATE collection_accounts SET is_default = 0 WHERE is_default = 1').run();
        db.prepare('UPDATE collection_accounts SET is_default = 1, updated_by = ? WHERE id = ?')
          .run(req.user.username, req.params.id);
      });
      tx();

      audit(req, 'CA_SET_DEFAULT', 'collection_accounts', req.params.id, null, null);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ─── DELETE /:id — soft delete ───
collectionAccountsRouter.delete('/:id',
  requireRole('admin'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM collection_accounts WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Account not found');

      // Can't deactivate the only active default
      if (existing.is_default) {
        const activeCount = db.prepare(
          'SELECT COUNT(*) AS n FROM collection_accounts WHERE active = 1 AND id != ?'
        ).get(req.params.id).n;
        if (activeCount === 0) {
          throw new AppError('Cannot deactivate — no other active account exists', 400);
        }
      }

      db.prepare(`
        UPDATE collection_accounts
        SET active = 0, is_default = 0, updated_at = datetime('now'), updated_by = ?
        WHERE id = ?
      `).run(req.user.username, req.params.id);

      audit(req, 'CA_DEACTIVATE', 'collection_accounts', req.params.id, existing, null);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);
