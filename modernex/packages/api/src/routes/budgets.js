import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const budgetsRouter = Router();
budgetsRouter.use(authenticate);

// Note: uses budget_targets table (migration 023) — distinct from the COA-linked
// "budgets" table in migration 015 which is account-group based.

// ─── GET /budgets?fy=2025-26&month=2025-04 ───────────────────────────────────
budgetsRouter.get('/', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { fy, month } = req.query;
    let sql = 'SELECT * FROM budget_targets WHERE 1=1';
    const params = [];
    if (fy)    { sql += ' AND fy = ?';    params.push(fy); }
    if (month) { sql += ' AND month = ?'; params.push(month); }
    sql += ' ORDER BY month ASC, category ASC';
    res.json({ budgets: db.prepare(sql).all(...params) });
  } catch (err) { next(err); }
});

// ─── POST /budgets ── create or update budget for (fy, month, category) ──────
budgetsRouter.post('/', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { fy, month, category, amount_paise, notes } = req.body;
    if (!fy || !month || !category) return res.status(400).json({ error: 'fy, month, category required' });

    const existing = db.prepare('SELECT id FROM budget_targets WHERE fy = ? AND month = ? AND category = ?').get(fy, month, category);
    if (existing) {
      db.prepare('UPDATE budget_targets SET amount_paise = ?, notes = ? WHERE fy = ? AND month = ? AND category = ?')
        .run(amount_paise || 0, notes || null, fy, month, category);
    } else {
      db.prepare(`
        INSERT INTO budget_targets (fy, month, category, amount_paise, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(fy, month, category, amount_paise || 0, notes || null, req.user.username);
    }

    const budget = db.prepare('SELECT * FROM budget_targets WHERE fy = ? AND month = ? AND category = ?').get(fy, month, category);
    res.status(existing ? 200 : 201).json({ budget });
  } catch (err) { next(err); }
});

// ─── DELETE /budgets/:id ──────────────────────────────────────────────────────
budgetsRouter.delete('/:id', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM budget_targets WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── GET /budgets/vs-actual?fy=2025-26&month=2025-04 ─────────────────────────
budgetsRouter.get('/vs-actual', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { fy, month } = req.query;
    if (!fy) return res.status(400).json({ error: 'fy required' });

    let dateFrom, dateTo;
    if (month) {
      dateFrom = month + '-01';
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${month}-${String(lastDay).padStart(2, '0')}`;
    } else {
      const fyStart = parseInt(fy.split('-')[0], 10);
      dateFrom = `${fyStart}-04-01`;
      dateTo = `${fyStart + 1}-03-31`;
    }

    const budgetRows = db.prepare(
      'SELECT category, SUM(amount_paise) as budgeted_paise FROM budget_targets WHERE fy = ? ' +
      (month ? 'AND month = ? ' : '') +
      'GROUP BY category'
    ).all(...(month ? [fy, month] : [fy]));

    const budgetMap = {};
    for (const row of budgetRows) budgetMap[row.category] = row.budgeted_paise;

    const revenue = db.prepare(
      "SELECT SUM(taxable_paise) as v FROM invoices WHERE date >= ? AND date <= ?"
    ).get(dateFrom, dateTo)?.v || 0;

    const rawMaterial = db.prepare(
      "SELECT SUM(total_paise) as v FROM purchase_orders WHERE date >= ? AND date <= ? AND status != 'cancelled'"
    ).get(dateFrom, dateTo)?.v || 0;

    const consumables = db.prepare(
      "SELECT SUM(total_paise) as v FROM consumable_purchases WHERE date >= ? AND date <= ? AND status != 'cancelled'"
    ).get(dateFrom, dateTo)?.v || 0;

    const payroll = db.prepare(
      "SELECT SUM(total_net_paise) as v FROM payroll_runs WHERE month >= ? AND month <= ?"
    ).get(dateFrom.slice(0, 7), dateTo.slice(0, 7))?.v || 0;

    const transport = db.prepare(
      "SELECT SUM(transport_paise) as v FROM purchase_orders WHERE date >= ? AND date <= ? AND status != 'cancelled'"
    ).get(dateFrom, dateTo)?.v || 0;

    const actualsMap = {
      'Revenue': revenue,
      'Raw Material': rawMaterial,
      'Consumables': consumables,
      'Payroll': payroll,
      'Transport': transport,
    };

    const CATEGORIES = ['Revenue', 'Raw Material', 'Consumables', 'Payroll', 'Transport'];
    for (const cat of Object.keys(budgetMap)) {
      if (!CATEGORIES.includes(cat)) CATEGORIES.push(cat);
    }

    const rows = CATEGORIES.map(category => {
      const budgeted = budgetMap[category] || 0;
      const actual = actualsMap[category] || 0;
      const variance = category === 'Revenue'
        ? actual - budgeted
        : budgeted - actual;
      const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : null;
      return { category, budgeted_paise: budgeted, actual_paise: actual, variance_paise: variance, utilization_pct: pct };
    });

    res.json({ fy, month: month || null, from: dateFrom, to: dateTo, rows });
  } catch (err) { next(err); }
});
