import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error.js';
import { nextJournalId } from '../services/idGenerator.js';

export const chartOfAccountsRouter = Router();
chartOfAccountsRouter.use(authenticate);

// ─── GET /coa/groups ─────────────────────────────────────────────────────────
chartOfAccountsRouter.get('/groups', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  res.json({ groups: db.prepare('SELECT * FROM account_groups ORDER BY nature, sort_order').all() });
});

// ─── GET /coa/accounts ───────────────────────────────────────────────────────
chartOfAccountsRouter.get('/accounts', requireRole('admin', 'accounts'), (req, res) => {
  const { nature, group_id, active } = req.query;
  const db = getDb();
  let sql = `
    SELECT a.*, ag.name AS group_name, ag.nature
    FROM accounts a
    JOIN account_groups ag ON ag.id = a.group_id
    WHERE 1=1
  `;
  const params = [];
  if (nature)   { sql += ' AND ag.nature = ?';  params.push(nature); }
  if (group_id) { sql += ' AND a.group_id = ?'; params.push(group_id); }
  if (active !== undefined) { sql += ' AND a.active = ?'; params.push(active === 'false' ? 0 : 1); }
  sql += ' ORDER BY ag.sort_order, a.code, a.name';
  res.json({ accounts: db.prepare(sql).all(...params) });
});

// ─── POST /coa/accounts ──────────────────────────────────────────────────────
chartOfAccountsRouter.post('/accounts', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { name, group_id, code, opening_balance_paise, is_debit_balance } = req.body;
    if (!name || !group_id) return res.status(400).json({ error: 'name and group_id required' });

    // Generate sequential ACC-XXXX id
    const lastRow = db.prepare("SELECT id FROM accounts WHERE id LIKE 'ACC-%' ORDER BY id DESC LIMIT 1").get();
    let seq = 1;
    if (lastRow) seq = parseInt(lastRow.id.slice(4), 10) + 1;
    const id = `ACC-${String(seq).padStart(4, '0')}`;

    db.prepare(`
      INSERT INTO accounts (id, name, group_id, code, opening_balance_paise, is_debit_balance)
      VALUES (?,?,?,?,?,?)
    `).run(id, name, group_id, code || null, opening_balance_paise || 0, is_debit_balance !== false ? 1 : 0);

    res.status(201).json({ account: db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) });
  } catch (err) { next(err); }
});

// ─── PATCH /coa/accounts/:id ─────────────────────────────────────────────────
chartOfAccountsRouter.patch('/accounts/:id', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!acc) throw new NotFoundError('Account not found');
    if (acc.is_system) return res.status(403).json({ error: 'System accounts cannot be modified' });
    const fields = ['name','group_id','code','opening_balance_paise','is_debit_balance','active'];
    const sets = [], params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ account: db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) });
  } catch (err) { next(err); }
});

// ─── GET /coa/vouchers ────────────────────────────────────────────────────────
chartOfAccountsRouter.get('/vouchers', requireRole('admin', 'accounts'), (req, res) => {
  const { type, from, to } = req.query;
  const db = getDb();
  let sql = `SELECT * FROM journal_vouchers WHERE 1=1`;
  const params = [];
  if (type) { sql += ' AND voucher_type = ?'; params.push(type); }
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to)   { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY date DESC, id DESC LIMIT 500';
  const vouchers = db.prepare(sql).all(...params);
  res.json({ vouchers });
});

// ─── GET /coa/vouchers/:id ────────────────────────────────────────────────────
chartOfAccountsRouter.get('/vouchers/:id', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const voucher = db.prepare('SELECT * FROM journal_vouchers WHERE id = ?').get(req.params.id);
    if (!voucher) throw new NotFoundError('Voucher not found');
    const entries = db.prepare(`
      SELECT je.*, a.name AS account_name, ag.name AS group_name
      FROM journal_entries je
      JOIN accounts a ON a.id = je.account_id
      JOIN account_groups ag ON ag.id = a.group_id
      WHERE je.voucher_id = ?
    `).all(req.params.id);
    res.json({ voucher, entries });
  } catch (err) { next(err); }
});

// ─── POST /coa/vouchers ── create journal voucher ─────────────────────────────
chartOfAccountsRouter.post('/vouchers', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { date, narration, voucher_type, ref_id, ref_type, entries } = req.body;
    if (!date || !narration || !voucher_type || !entries?.length)
      return res.status(400).json({ error: 'date, narration, voucher_type, entries[] required' });

    // Validate double entry: sum of debits must equal sum of credits
    const totalDebit  = entries.reduce((s, e) => s + (e.debit_paise  || 0), 0);
    const totalCredit = entries.reduce((s, e) => s + (e.credit_paise || 0), 0);
    if (totalDebit !== totalCredit)
      return res.status(400).json({ error: `Voucher does not balance: Dr ${totalDebit} ≠ Cr ${totalCredit}` });

    const id = nextJournalId();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO journal_vouchers (id, date, narration, voucher_type, ref_id, ref_type, created_by)
        VALUES (?,?,?,?,?,?,?)
      `).run(id, date, narration, voucher_type, ref_id || null, ref_type || null, req.user.username);

      const stmt = db.prepare(`
        INSERT INTO journal_entries (voucher_id, account_id, debit_paise, credit_paise, narration)
        VALUES (?,?,?,?,?)
      `);
      for (const e of entries) {
        stmt.run(id, e.account_id, e.debit_paise || 0, e.credit_paise || 0, e.narration || null);
      }
    })();

    const voucher = db.prepare('SELECT * FROM journal_vouchers WHERE id = ?').get(id);
    const savedEntries = db.prepare('SELECT * FROM journal_entries WHERE voucher_id = ?').all(id);
    res.status(201).json({ voucher, entries: savedEntries });
  } catch (err) { next(err); }
});
