import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error.js';
import { nextBankAccId } from '../services/idGenerator.js';

export const bankReconRouter = Router();
bankReconRouter.use(authenticate);

// ─── GET /bank-recon/accounts ────────────────────────────────────────────────
bankReconRouter.get('/accounts', (req, res) => {
  const db = getDb();
  res.json({ accounts: db.prepare('SELECT * FROM bank_accounts_reg WHERE active = 1 ORDER BY name').all() });
});

// ─── POST /bank-recon/accounts ───────────────────────────────────────────────
bankReconRouter.post('/accounts', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { name, account_no, ifsc, bank_name, branch, opening_balance_paise, opening_date, account_id } = req.body;
    if (!name || !bank_name) return res.status(400).json({ error: 'name and bank_name required' });
    const id = nextBankAccId();
    db.prepare(`
      INSERT INTO bank_accounts_reg (id, name, account_no, ifsc, bank_name, branch, opening_balance_paise, opening_date, account_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(id, name, account_no || null, ifsc || null, bank_name, branch || null,
           opening_balance_paise || 0, opening_date || new Date().toISOString().slice(0,10),
           account_id || null);
    res.status(201).json({ account: db.prepare('SELECT * FROM bank_accounts_reg WHERE id = ?').get(id) });
  } catch (err) { next(err); }
});

// ─── GET /bank-recon/:bankId/statement ───────────────────────────────────────
bankReconRouter.get('/:bankId/statement', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const bank = db.prepare('SELECT * FROM bank_accounts_reg WHERE id = ?').get(req.params.bankId);
    if (!bank) throw new NotFoundError('Bank account not found');

    const { from, to, reconciled } = req.query;
    let sql = 'SELECT * FROM bank_statement_lines WHERE bank_account_id = ?';
    const params = [req.params.bankId];
    if (from)        { sql += ' AND txn_date >= ?'; params.push(from); }
    if (to)          { sql += ' AND txn_date <= ?'; params.push(to); }
    if (reconciled !== undefined) { sql += ' AND reconciled = ?'; params.push(reconciled === 'true' ? 1 : 0); }
    sql += ' ORDER BY txn_date ASC, id ASC';

    const lines = db.prepare(sql).all(...params);
    const unreconciled = db.prepare(
      'SELECT SUM(credit_paise) as cr, SUM(debit_paise) as dr FROM bank_statement_lines WHERE bank_account_id = ? AND reconciled = 0'
    ).get(req.params.bankId);

    res.json({ bank, lines, unreconciled_credit: unreconciled?.cr || 0, unreconciled_debit: unreconciled?.dr || 0 });
  } catch (err) { next(err); }
});

// ─── POST /bank-recon/:bankId/import ── bulk import bank statement lines ─────
bankReconRouter.post('/:bankId/import', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const bank = db.prepare('SELECT * FROM bank_accounts_reg WHERE id = ?').get(req.params.bankId);
    if (!bank) throw new NotFoundError('Bank account not found');

    const { lines } = req.body; // array of { txn_date, value_date, description, ref_no, debit_paise, credit_paise, running_balance_paise }
    if (!Array.isArray(lines) || !lines.length)
      return res.status(400).json({ error: 'lines[] array required' });

    const stmt = db.prepare(`
      INSERT INTO bank_statement_lines
        (bank_account_id, txn_date, value_date, description, ref_no, debit_paise, credit_paise, running_balance_paise)
      VALUES (?,?,?,?,?,?,?,?)
    `);

    let imported = 0;
    db.transaction(() => {
      for (const l of lines) {
        stmt.run(req.params.bankId, l.txn_date, l.value_date || null, l.description || null,
                 l.ref_no || null, l.debit_paise || 0, l.credit_paise || 0, l.running_balance_paise || 0);
        imported++;
      }
    })();

    // Auto-match: try to match unreconciled lines to payments by amount + date proximity
    const unmatchedLines = db.prepare(
      `SELECT * FROM bank_statement_lines WHERE bank_account_id = ? AND reconciled = 0`
    ).all(req.params.bankId);

    let autoMatched = 0;
    db.transaction(() => {
      for (const line of unmatchedLines) {
        if (line.credit_paise > 0) {
          const payment = db.prepare(`
            SELECT id FROM payments
            WHERE amount_paise = ?
              AND ABS(julianday(date) - julianday(?)) <= 2
              AND id NOT IN (SELECT matched_payment_id FROM bank_statement_lines WHERE matched_payment_id IS NOT NULL)
            LIMIT 1
          `).get(line.credit_paise, line.txn_date);
          if (payment) {
            db.prepare('UPDATE bank_statement_lines SET reconciled = 1, matched_payment_id = ? WHERE id = ?')
              .run(payment.id, line.id);
            autoMatched++;
          }
        }
      }
    })();

    res.json({ imported, auto_matched: autoMatched });
  } catch (err) { next(err); }
});

// ─── PATCH /bank-recon/lines/:lineId/reconcile ── manual reconciliation ──────
bankReconRouter.patch('/lines/:lineId/reconcile', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { matched_payment_id } = req.body;
    db.prepare('UPDATE bank_statement_lines SET reconciled = 1, matched_payment_id = ? WHERE id = ?')
      .run(matched_payment_id || null, req.params.lineId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── GET /bank-recon/:bankId/brs ── Bank Reconciliation Statement ─────────────
bankReconRouter.get('/:bankId/brs', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const bank = db.prepare('SELECT * FROM bank_accounts_reg WHERE id = ?').get(req.params.bankId);
    if (!bank) throw new NotFoundError('Bank account not found');

    const { as_of } = req.query;
    const asOf = as_of || new Date().toISOString().slice(0, 10);

    // Bank balance as per statement
    const lastLine = db.prepare(
      'SELECT running_balance_paise FROM bank_statement_lines WHERE bank_account_id = ? AND txn_date <= ? ORDER BY txn_date DESC, id DESC LIMIT 1'
    ).get(req.params.bankId, asOf);
    const bankBalance = lastLine?.running_balance_paise || bank.opening_balance_paise;

    // Uncleared deposits (in our books but not yet in bank statement)
    const unclearedDeposits = db.prepare(`
      SELECT p.id, p.date, p.amount_paise, p.reference, c.name AS customer_name
      FROM payments p
      LEFT JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE p.date <= ?
        AND p.method IN ('cheque','neft','rtgs','upi')
        AND p.id NOT IN (
          SELECT matched_payment_id FROM bank_statement_lines
          WHERE matched_payment_id IS NOT NULL AND bank_account_id = ?
        )
      ORDER BY p.date
    `).all(asOf, req.params.bankId);

    const totalUnclearedDeposits = unclearedDeposits.reduce((s, r) => s + r.amount_paise, 0);

    // Adjusted book balance
    const adjustedBalance = bankBalance + totalUnclearedDeposits;

    res.json({
      bank,
      as_of: asOf,
      bank_balance_paise: bankBalance,
      uncleared_deposits: unclearedDeposits,
      total_uncleared_deposits_paise: totalUnclearedDeposits,
      adjusted_balance_paise: adjustedBalance,
    });
  } catch (err) { next(err); }
});
