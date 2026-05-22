import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { customerSchema } from '@modernex/shared';
import { NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { nextCustomerId } from '../services/idGenerator.js';

export const customersRouter = Router();

customersRouter.use(authenticate);

// ─── GET /customers ───
customersRouter.get('/', (req, res) => {
  const { q } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM customers';
  const params = [];
  if (q) {
    sql += ' WHERE name LIKE ? OR gstin LIKE ? OR id LIKE ?';
    const p = `%${q}%`;
    params.push(p, p, p);
  }
  sql += ' ORDER BY name';
  res.json({ customers: db.prepare(sql).all(...params) });
});

// ─── GET /customers/:id ───
customersRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) throw new NotFoundError('Customer not found');
    res.json({ customer });
  } catch (err) { next(err); }
});

// ─── POST /customers ───
customersRouter.post('/',
  requireRole('admin', 'accounts', 'sales'),
  validate(customerSchema),
  (req, res, next) => {
    try {
      const db = getDb();
      const id = nextCustomerId();
      const c = req.body;
      db.prepare(
        `INSERT INTO customers (id, name, gstin, state, address, contact, email, credit_days, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, c.name, c.gstin || null, c.state, c.address || null,
            c.contact || null, c.email || null, c.credit_days || 0, req.user.username);
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
      audit(req, 'CUSTOMER_CREATE', 'customers', id, null, customer);
      res.status(201).json({ customer });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /customers/:id ───
customersRouter.patch('/:id',
  requireRole('admin', 'accounts', 'sales'),
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      if (!existing) throw new NotFoundError('Customer not found');

      const allowed = ['name', 'gstin', 'state', 'address', 'contact', 'email', 'credit_days'];
      const updates = [];
      const params = [];
      for (const k of allowed) {
        if (req.body[k] !== undefined) {
          updates.push(`${k} = ?`);
          params.push(req.body[k]);
        }
      }
      if (updates.length === 0) return res.json({ customer: existing });

      updates.push('updated_by = ?');
      params.push(req.user.username);
      params.push(req.params.id);
      db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      audit(req, 'CUSTOMER_UPDATE', 'customers', req.params.id, existing, updated);
      res.json({ customer: updated });
    } catch (err) { next(err); }
  }
);

// ─── DELETE /customers/:id ───
customersRouter.delete('/:id', requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('Customer not found');

    // Check for dependent invoices
    const hasInvoices = db.prepare(
      'SELECT COUNT(*) as n FROM invoices WHERE customer_id = ?'
    ).get(req.params.id);
    if (hasInvoices.n > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${hasInvoices.n} invoice(s) reference this customer`,
      });
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    audit(req, 'CUSTOMER_DELETE', 'customers', req.params.id, existing, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
