import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const msmeRouter = Router();
msmeRouter.use(authenticate);
msmeRouter.use(requireRole('admin', 'accounts'));

// RBI Repo Rate + 3× for MSMED Act Sec 16 interest
// Default 27% p.a. (3 × 9% = 27%); update via env if RBI rate changes
const MSME_INTEREST_RATE = parseFloat(process.env.MSME_INTEREST_RATE_PCT || '27');
const MSME_PAYMENT_DAYS  = 45;

function calcInterest(principalPaise, fromDate, toDate, annualRate = MSME_INTEREST_RATE) {
  const days = Math.max(0, Math.round((new Date(toDate) - new Date(fromDate)) / 86400000));
  const interest = Math.round(principalPaise * (annualRate / 100) * (days / 365));
  return { days, interest };
}

// ─── GET /msme/vendors ────────────────────────────────────────────────────────
// List all MSME-registered vendors with outstanding status
msmeRouter.get('/vendors', (req, res, next) => {
  try {
    const db = getDb();
    const vendors = db.prepare(`
      SELECT v.*,
        COUNT(DISTINCT po.id)              AS total_pos,
        SUM(CASE WHEN po.status NOT IN ('cancelled','received') THEN po.total_paise ELSE 0 END) AS outstanding_paise,
        MIN(CASE WHEN po.status NOT IN ('cancelled','received') THEN po.date ELSE NULL END) AS oldest_open_po_date,
        MAX(CASE WHEN po.status NOT IN ('cancelled','received')
              AND julianday('now') - julianday(po.date) > ? THEN 1 ELSE 0 END) AS has_overdue
      FROM vendors v
      LEFT JOIN purchase_orders po ON po.vendor_id = v.id
      WHERE v.msme = 1
      GROUP BY v.id
      ORDER BY has_overdue DESC, outstanding_paise DESC
    `, MSME_PAYMENT_DAYS).all(MSME_PAYMENT_DAYS);

    res.json({ vendors, interestRate: MSME_INTEREST_RATE, paymentDays: MSME_PAYMENT_DAYS });
  } catch (err) { next(err); }
});

// ─── GET /msme/outstanding ────────────────────────────────────────────────────
// MSME outstanding with aging + accrued interest
msmeRouter.get('/outstanding', (req, res, next) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const rows = db.prepare(`
      SELECT
        po.id AS po_id, po.date AS po_date, po.vendor_id,
        v.name AS vendor_name, v.msme_number,
        po.total_paise, po.variety, po.status AS po_status,
        CAST(julianday('now') - julianday(po.date) AS INTEGER) AS age_days,
        MAX(0, CAST(julianday('now') - julianday(po.date) AS INTEGER) - ?) AS overdue_days
      FROM purchase_orders po
      JOIN vendors v ON v.id = po.vendor_id
      WHERE v.msme = 1
        AND po.status NOT IN ('cancelled', 'received')
      ORDER BY overdue_days DESC, po.date ASC
    `).all(MSME_PAYMENT_DAYS);

    const result = rows.map(row => {
      const dueDate = new Date(row.po_date);
      dueDate.setDate(dueDate.getDate() + MSME_PAYMENT_DAYS);
      const dueDateStr = dueDate.toISOString().slice(0, 10);
      let accrued_interest = 0;
      if (row.overdue_days > 0) {
        const { interest } = calcInterest(row.total_paise, dueDateStr, today);
        accrued_interest = interest;
      }
      return { ...row, due_date: dueDateStr, accrued_interest_paise: accrued_interest };
    });

    const summary = {
      totalVendors: new Set(rows.map(r => r.vendor_id)).size,
      totalOutstanding: rows.reduce((s, r) => s + r.total_paise, 0),
      overdueCount: result.filter(r => r.overdue_days > 0).length,
      totalOverdue: result.filter(r => r.overdue_days > 0).reduce((s, r) => s + r.total_paise, 0),
      totalAccruedInterest: result.reduce((s, r) => s + r.accrued_interest_paise, 0),
    };

    res.json({ outstanding: result, summary, interestRate: MSME_INTEREST_RATE, paymentDays: MSME_PAYMENT_DAYS });
  } catch (err) { next(err); }
});

// ─── GET /msme/interest ───────────────────────────────────────────────────────
// Detailed interest calculation on all overdue MSME payables
msmeRouter.get('/interest', (req, res, next) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const overduePos = db.prepare(`
      SELECT po.*, v.name AS vendor_name, v.msme_number, v.gstin AS vendor_gstin
      FROM purchase_orders po
      JOIN vendors v ON v.id = po.vendor_id
      WHERE v.msme = 1
        AND po.status NOT IN ('cancelled','received')
        AND julianday('now') - julianday(po.date) > ?
      ORDER BY po.date ASC
    `).all(MSME_PAYMENT_DAYS);

    const details = overduePos.map(po => {
      const dueDate = new Date(po.date);
      dueDate.setDate(dueDate.getDate() + MSME_PAYMENT_DAYS);
      const dueDateStr = dueDate.toISOString().slice(0, 10);
      const { days, interest } = calcInterest(po.total_paise, dueDateStr, today);
      return {
        po_id: po.id,
        po_date: po.date,
        vendor_id: po.vendor_id,
        vendor_name: po.vendor_name,
        msme_number: po.msme_number,
        amount_paise: po.total_paise,
        due_date: dueDateStr,
        overdue_days: days,
        interest_rate_pct: MSME_INTEREST_RATE,
        interest_paise: interest,
        total_liability_paise: po.total_paise + interest,
      };
    });

    const totalInterest = details.reduce((s, d) => s + d.interest_paise, 0);
    const totalLiability = details.reduce((s, d) => s + d.total_liability_paise, 0);

    res.json({ details, totalInterest_paise: totalInterest, totalLiability_paise: totalLiability });
  } catch (err) { next(err); }
});

// ─── GET /msme/form-i ─────────────────────────────────────────────────────────
// MSME Form I — Half-yearly return (MSMED Act Sec 22)
// Buyer must file if outstanding > 45 days at end of half-year
msmeRouter.get('/form-i', (req, res, next) => {
  try {
    const db = getDb();
    const { half_year } = req.query; // e.g. '2025-H1' (Apr-Sep) or '2025-H2' (Oct-Mar)

    let periodEnd;
    if (half_year) {
      const [yr, h] = half_year.split('-');
      periodEnd = h === 'H1'
        ? `${yr}-09-30`
        : `${Number(yr) + 1}-03-31`;
    } else {
      periodEnd = new Date().toISOString().slice(0, 10);
    }

    // All amounts outstanding to MSME vendors as of periodEnd that exceeded 45 days
    const company = db.prepare('SELECT * FROM company_details WHERE id=1').get();
    const rows = db.prepare(`
      SELECT
        po.id AS po_id, po.date, po.total_paise,
        v.id AS vendor_id, v.name AS vendor_name, v.msme_number,
        v.address AS vendor_address, v.gstin AS vendor_gstin,
        CAST(julianday(?) - julianday(po.date) AS INTEGER) AS age_days_at_period_end
      FROM purchase_orders po
      JOIN vendors v ON v.id = po.vendor_id
      WHERE v.msme = 1
        AND po.date <= ?
        AND po.status NOT IN ('cancelled','received')
        AND julianday(?) - julianday(po.date) > ?
      ORDER BY v.name, po.date
    `).all(periodEnd, periodEnd, periodEnd, MSME_PAYMENT_DAYS);

    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.vendor_id]) {
        grouped[r.vendor_id] = {
          vendor_id: r.vendor_id, vendor_name: r.vendor_name,
          msme_number: r.msme_number, vendor_gstin: r.vendor_gstin,
          vendor_address: r.vendor_address, orders: [], total_paise: 0,
        };
      }
      const dueDate = new Date(r.date);
      dueDate.setDate(dueDate.getDate() + MSME_PAYMENT_DAYS);
      const { interest } = calcInterest(r.total_paise, dueDate.toISOString().slice(0, 10), periodEnd);
      grouped[r.vendor_id].orders.push({ ...r, due_date: dueDate.toISOString().slice(0, 10), interest_paise: interest });
      grouped[r.vendor_id].total_paise += r.total_paise;
    }

    res.json({
      form_i: {
        period_end: periodEnd,
        half_year: half_year || 'current',
        buyer: {
          name: company?.name, pan: company?.pan, gstin: company?.gstin,
          address: company?.address,
        },
        suppliers: Object.values(grouped),
        total_outstanding_paise: rows.reduce((s, r) => s + r.total_paise, 0),
        vendor_count: Object.keys(grouped).length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /msme/payment-register ──────────────────────────────────────────────
// Complete MSME payment register (all paid + outstanding, with aging)
msmeRouter.get('/payment-register', (req, res, next) => {
  try {
    const db = getDb();
    const { from_date, to_date, vendor_id } = req.query;
    let sql = `
      SELECT
        po.id, po.date, po.vendor_id, v.name AS vendor_name, v.msme_number,
        po.variety, po.total_paise, po.status,
        CASE WHEN po.status = 'received' THEN 1 ELSE 0 END AS paid,
        CAST(julianday('now') - julianday(po.date) AS INTEGER) AS age_days,
        CASE WHEN po.status = 'received' THEN 0
             ELSE MAX(0, CAST(julianday('now') - julianday(po.date) AS INTEGER) - ?)
        END AS overdue_days
      FROM purchase_orders po
      JOIN vendors v ON v.id = po.vendor_id
      WHERE v.msme = 1
        AND po.status != 'cancelled'
    `;
    const params = [MSME_PAYMENT_DAYS];

    if (from_date) { sql += ' AND po.date >= ?'; params.push(from_date); }
    if (to_date)   { sql += ' AND po.date <= ?'; params.push(to_date); }
    if (vendor_id) { sql += ' AND po.vendor_id = ?'; params.push(vendor_id); }
    sql += ' ORDER BY po.date DESC';

    const rows = db.prepare(sql).all(...params);
    const summary = {
      total:    rows.length,
      paid:     rows.filter(r => r.paid).length,
      pending:  rows.filter(r => !r.paid).length,
      overdue:  rows.filter(r => r.overdue_days > 0).length,
      totalAmount:   rows.reduce((s, r) => s + r.total_paise, 0),
      pendingAmount: rows.filter(r => !r.paid).reduce((s, r) => s + r.total_paise, 0),
      overdueAmount: rows.filter(r => r.overdue_days > 0).reduce((s, r) => s + r.total_paise, 0),
    };

    res.json({ register: rows, summary });
  } catch (err) { next(err); }
});

// ─── POST /msme/interest-log ──────────────────────────────────────────────────
// Record accrued interest for a PO (for ledger posting)
msmeRouter.post('/interest-log', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { vendor_id, po_id, invoice_date, amount_paise, payment_date } = req.body;
    if (!vendor_id || !invoice_date || !amount_paise)
      return res.status(400).json({ error: 'vendor_id, invoice_date, amount_paise required' });

    const dueDate = new Date(invoice_date);
    dueDate.setDate(dueDate.getDate() + MSME_PAYMENT_DAYS);
    const today = payment_date || new Date().toISOString().slice(0, 10);
    const { days, interest } = calcInterest(amount_paise, dueDate.toISOString().slice(0, 10), today);

    const result = db.prepare(`
      INSERT INTO msme_interest_log
        (vendor_id, po_id, invoice_date, due_date, payment_date, amount_paise,
         overdue_days, interest_rate_pct, interest_paise)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(vendor_id, po_id || null, invoice_date, dueDate.toISOString().slice(0, 10),
           payment_date || null, amount_paise, days, MSME_INTEREST_RATE, interest);

    res.status(201).json({ id: result.lastInsertRowid, overdue_days: days, interest_paise: interest });
  } catch (err) { next(err); }
});
