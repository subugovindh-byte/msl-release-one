import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

// ─── Helper: date range WHERE clause ───
function dateRange(alias, from, to) {
  if (from && to) return { sql: ` AND ${alias}.date >= ? AND ${alias}.date <= ?`, params: [from, to] };
  return { sql: '', params: [] };
}

// ─── GET /reports/dashboard ───
reportsRouter.get('/dashboard', (req, res) => {
  const db = getDb();
  const revenue    = db.prepare(`SELECT COALESCE(SUM(taxable_paise), 0) as v FROM invoices`).get().v;
  const ar         = db.prepare(`SELECT COALESCE(SUM(total_paise), 0) as v FROM invoices WHERE paid = 0`).get().v;
  const collected  = db.prepare(`SELECT COALESCE(SUM(total_paise), 0) as v FROM invoices WHERE paid = 1`).get().v;
  const ap         = db.prepare(`SELECT COALESCE(SUM(total_paise), 0) as v FROM purchase_orders`).get().v;
  const gst_output = db.prepare(`SELECT COALESCE(SUM(cgst_paise + sgst_paise + igst_paise), 0) as v FROM invoices`).get().v;
  const gst_itc    = db.prepare(`SELECT COALESCE(SUM(gst_paise), 0) as v FROM purchase_orders`).get().v;
  const stockValue = db.prepare(`SELECT COALESCE(SUM(rate_paise * stock), 0) as v FROM products WHERE active = 1`).get().v;
  const totalProducts = db.prepare(`SELECT COUNT(*) as v FROM products WHERE active = 1`).get().v;
  const invoiceCount  = db.prepare(`SELECT COUNT(*) as v FROM invoices`).get().v;
  const unpaidCount   = db.prepare(`SELECT COUNT(*) as v FROM invoices WHERE paid = 0`).get().v;
  const lowStock      = db.prepare(`SELECT COUNT(*) as v FROM products WHERE active = 1 AND stock <= 2`).get().v;

  const weeklyRevenue = db.prepare(`
    SELECT strftime('%Y-%W', date) as week, SUM(taxable_paise) as v
    FROM invoices WHERE date >= date('now', '-56 days')
    GROUP BY week ORDER BY week
  `).all();
  const byKind = db.prepare(`
    SELECT kind, COUNT(*) as products, SUM(stock) as total_stock, SUM(rate_paise * stock) as value_paise
    FROM products WHERE active = 1 GROUP BY kind ORDER BY value_paise DESC
  `).all();
  const gradeMix = db.prepare(`
    SELECT grade, SUM(stock) as stock
    FROM products WHERE active = 1 AND kind = 'slab' AND grade IS NOT NULL GROUP BY grade
  `).all();
  const salesByKind = db.prepare(`
    SELECT ii.product_kind as kind, COUNT(DISTINCT ii.invoice_id) as invoices, SUM(ii.line_total_paise) as revenue_paise
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.date >= date('now', '-30 days') GROUP BY ii.product_kind ORDER BY revenue_paise DESC
  `).all();

  res.json({
    summary: {
      revenue_paise: revenue, ar_paise: ar, collected_paise: collected, ap_paise: ap,
      gst_output_paise: gst_output, gst_itc_paise: gst_itc,
      net_gst_paise: Math.max(0, gst_output - gst_itc),
      stock_value_paise: stockValue, total_products: totalProducts,
      invoice_count: invoiceCount, unpaid_count: unpaidCount, low_stock_count: lowStock,
    },
    charts: { weeklyRevenue, gradeMix, byKind, salesByKind },
  });
});

// ─── GET /reports/pnl ───
reportsRouter.get('/pnl', requireRole('admin', 'accounts'), (req, res) => {
  const { from, to } = req.query;
  const db = getDb();
  const dr   = dateRange('i',  from, to);
  const podr = dateRange('po', from, to);
  const cpdr = dateRange('cp', from, to);

  const revenue     = db.prepare(`SELECT COALESCE(SUM(taxable_paise),0) as v FROM invoices i WHERE 1=1${dr.sql}`).get(...dr.params).v;
  const rawMat      = db.prepare(`SELECT COALESCE(SUM(taxable_paise),0) as v FROM purchase_orders po WHERE 1=1${podr.sql}`).get(...podr.params).v;
  const production  = db.prepare(`SELECT COALESCE(SUM(labour_paise+power_paise+consumables_paise),0) as v FROM production_jobs WHERE 1=1${dr.sql.replace('i.','')}`).get(...dr.params).v;
  const transport   = db.prepare(`SELECT COALESCE(SUM(transport_paise),0) as v FROM purchase_orders po WHERE 1=1${podr.sql}`).get(...podr.params).v;
  const cpTotal     = db.prepare(`SELECT COALESCE(SUM(total_paise),0) as v FROM consumable_purchases cp WHERE status != 'cancelled' AND 1=1${cpdr.sql}`).get(...cpdr.params).v;

  // Consumables by category
  const cpByCategory = db.prepare(`
    SELECT category, COALESCE(SUM(total_paise),0) as amount_paise
    FROM consumable_purchases cp WHERE status != 'cancelled' AND 1=1${cpdr.sql}
    GROUP BY category ORDER BY amount_paise DESC
  `).all(...cpdr.params);

  // Payroll
  const payroll = db.prepare(`SELECT COALESCE(SUM(total_net_paise),0) as v FROM payroll_runs WHERE status='paid' AND month >= ? AND month <= ?`)
    .get((from || '2020-01').slice(0,7), (to || new Date().toISOString()).slice(0,7)).v;

  const revByKind = db.prepare(`
    SELECT ii.product_kind as kind, COALESCE(SUM(ii.line_total_paise),0) as revenue
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE 1=1${dr.sql} GROUP BY ii.product_kind
  `).all(...dr.params);

  const cogs = rawMat + production + transport;
  const grossProfit = revenue - cogs;
  const opExpenses = cpTotal + payroll;
  const netProfit = grossProfit - opExpenses;

  res.json({
    period: { from, to },
    income: { revenue_paise: revenue },
    cogs: { raw_material_paise: rawMat, production_paise: production, transport_paise: transport, total_cogs_paise: cogs },
    gross_profit_paise: grossProfit,
    gross_margin_pct: revenue > 0 ? +((grossProfit / revenue) * 100).toFixed(2) : 0,
    operating_expenses: { consumables_paise: cpTotal, payroll_paise: payroll, total_opex_paise: opExpenses, by_category: cpByCategory },
    net_profit_paise: netProfit,
    net_margin_pct: revenue > 0 ? +((netProfit / revenue) * 100).toFixed(2) : 0,
    revenue_by_kind: revByKind,
  });
});

// ─── GET /reports/gstr1 — Full GSTR-1 per GST rules ───
// Returns: B2B (invoice-wise), B2C Large (>2.5L interstate), B2C Small (consolidated),
//          CDNR (credit notes against registered), CDN (credit notes against unregistered),
//          HSN Summary (Table 12), Document Summary (Table 13)
reportsRouter.get('/gstr1', requireRole('admin', 'accounts'), (req, res) => {
  const { from, to } = req.query;
  const db = getDb();
  const homeState = db.prepare('SELECT home_state FROM company_details WHERE id=1').get()?.home_state || 'Tamil Nadu';
  const dr = dateRange('i', from, to);
  const baseWhere = `WHERE (i.status IS NULL OR i.status != 'cancelled') ${dr.sql}`;

  // ── B2B: registered customers, invoice-wise ──
  const b2b = db.prepare(`
    SELECT i.id, i.date, i.customer_name, i.customer_gstin,
      CASE WHEN i.customer_state = '${homeState}' THEN 'Intrastate' ELSE 'Interstate' END AS supply_type,
      i.taxable_paise, i.cgst_paise, i.sgst_paise, i.igst_paise, i.total_paise
    FROM invoices i ${baseWhere}
      AND i.customer_gstin IS NOT NULL AND i.customer_gstin != ''
    ORDER BY i.date
  `).all(...dr.params);

  // ── B2C Large: unregistered + interstate + >₹2.5L ──
  const b2cLarge = db.prepare(`
    SELECT i.id, i.date, i.customer_name, i.customer_state,
      i.taxable_paise, i.igst_paise, i.total_paise
    FROM invoices i ${baseWhere}
      AND (i.customer_gstin IS NULL OR i.customer_gstin = '')
      AND i.customer_state != '${homeState}'
      AND i.total_paise >= 25000000
    ORDER BY i.date
  `).all(...dr.params);

  // ── B2C Small: unregistered, consolidated by state+HSN ──
  const b2cSmall = db.prepare(`
    SELECT i.customer_state,
      SUM(i.taxable_paise) as taxable_paise,
      SUM(i.cgst_paise) as cgst_paise,
      SUM(i.sgst_paise) as sgst_paise,
      SUM(i.igst_paise) as igst_paise,
      COUNT(*) as invoice_count
    FROM invoices i ${baseWhere}
      AND (i.customer_gstin IS NULL OR i.customer_gstin = '')
      AND NOT (i.customer_state != '${homeState}' AND i.total_paise >= 25000000)
    GROUP BY i.customer_state
    ORDER BY i.customer_state
  `).all(...dr.params);

  // ── CDNR: Credit/Debit notes against registered buyers ──
  const cdnr = db.prepare(`
    SELECT n.id, n.date, n.type, n.customer_name, n.customer_gstin,
      n.ref_invoice_id, n.reason, n.taxable_paise, n.cgst_paise,
      n.sgst_paise, n.igst_paise, n.total_paise
    FROM debit_credit_notes n
    WHERE n.status = 'confirmed'
      AND n.customer_gstin IS NOT NULL AND n.customer_gstin != ''
      ${from && to ? "AND n.date >= ? AND n.date <= ?" : ""}
    ORDER BY n.date
  `).all(...(from && to ? [from, to] : []));

  // ── CDNUR: Credit/Debit notes against unregistered buyers ──
  const cdnur = db.prepare(`
    SELECT n.id, n.date, n.type, n.customer_name, n.reason,
      n.taxable_paise, n.cgst_paise, n.sgst_paise, n.igst_paise, n.total_paise
    FROM debit_credit_notes n
    WHERE n.status = 'confirmed'
      AND (n.customer_gstin IS NULL OR n.customer_gstin = '')
      ${from && to ? "AND n.date >= ? AND n.date <= ?" : ""}
    ORDER BY n.date
  `).all(...(from && to ? [from, to] : []));

  // ── HSN Summary (Table 12) — read from DB view ──
  const hsnSummary = from && to
    ? db.prepare(`
        SELECT ii.hsn, ii.uom, SUM(ii.qty) AS total_qty,
          SUM(ii.line_total_paise) AS taxable_paise,
          SUM(CASE WHEN i.customer_state = '${homeState}'
              THEN ROUND(ii.line_total_paise * CASE WHEN ii.hsn='2517' THEN 0.025 ELSE 0.09 END) ELSE 0 END) AS cgst_paise,
          SUM(CASE WHEN i.customer_state = '${homeState}'
              THEN ROUND(ii.line_total_paise * CASE WHEN ii.hsn='2517' THEN 0.025 ELSE 0.09 END) ELSE 0 END) AS sgst_paise,
          SUM(CASE WHEN i.customer_state != '${homeState}'
              THEN ROUND(ii.line_total_paise * CASE WHEN ii.hsn='2517' THEN 0.05 ELSE 0.18 END) ELSE 0 END) AS igst_paise
        FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
        WHERE (i.status IS NULL OR i.status != 'cancelled') AND i.date >= ? AND i.date <= ?
        GROUP BY ii.hsn, ii.uom
      `).all(from, to)
    : db.prepare('SELECT * FROM v_hsn_summary').all();

  // ── Document Summary (Table 13) ──
  const docSummary = db.prepare(`
    SELECT 'Invoice' AS doc_type,
      COUNT(*) AS issued, 0 AS cancelled,
      MIN(id) AS from_no, MAX(id) AS to_no
    FROM invoices i ${baseWhere}
    UNION ALL
    SELECT 'Credit Note', COUNT(*), 0, MIN(id), MAX(id)
    FROM debit_credit_notes WHERE type='credit'
      ${from && to ? "AND date >= ? AND date <= ?" : ""}
    UNION ALL
    SELECT 'Debit Note', COUNT(*), 0, MIN(id), MAX(id)
    FROM debit_credit_notes WHERE type='debit'
      ${from && to ? "AND date >= ? AND date <= ?" : ""}
  `).all(...dr.params, ...(from && to ? [from, to, from, to] : []));

  // ── Totals ──
  const totalTaxable = b2b.reduce((s,r) => s + r.taxable_paise, 0)
    + b2cLarge.reduce((s,r) => s + r.taxable_paise, 0)
    + b2cSmall.reduce((s,r) => s + r.taxable_paise, 0);

  res.json({
    period: { from, to }, home_state: homeState,
    b2b, b2c_large: b2cLarge, b2c_small: b2cSmall,
    cdnr, cdnur, hsn_summary: hsnSummary, doc_summary: docSummary,
    totals: {
      invoice_count: b2b.length + b2cLarge.length + b2cSmall.reduce((s,r) => s + r.invoice_count, 0),
      taxable_paise: totalTaxable,
    },
  });
});

// ─── GET /reports/gstr3b ───
reportsRouter.get('/gstr3b', requireRole('admin', 'accounts'), (req, res) => {
  const { from, to } = req.query;
  const db = getDb();
  const dr = dateRange('', from, to);
  const invRange = from && to ? 'WHERE date >= ? AND date <= ?' : '';
  const invParams = from && to ? [from, to] : [];

  const output = db.prepare(`
    SELECT COALESCE(SUM(taxable_paise),0) as taxable,
      COALESCE(SUM(cgst_paise),0) as cgst,
      COALESCE(SUM(sgst_paise),0) as sgst,
      COALESCE(SUM(igst_paise),0) as igst
    FROM invoices ${invRange}
  `).get(...invParams);

  const itcRaw = db.prepare(`
    SELECT COALESCE(SUM(gst_paise),0) as total FROM purchase_orders ${invRange}
  `).get(...invParams);
  const itcCgst = Math.round(itcRaw.total / 2);
  const itcSgst = itcRaw.total - itcCgst;

  // Credit notes reduce output
  const cnAdjust = db.prepare(`
    SELECT COALESCE(SUM(taxable_paise),0) as taxable,
      COALESCE(SUM(cgst_paise),0) as cgst,
      COALESCE(SUM(sgst_paise),0) as sgst,
      COALESCE(SUM(igst_paise),0) as igst
    FROM debit_credit_notes WHERE type='credit' AND status='confirmed' ${from && to ? 'AND date >= ? AND date <= ?' : ''}
  `).get(...(from && to ? [from, to] : []));

  const netTaxable = output.taxable - cnAdjust.taxable;
  const netCgst = output.cgst - cnAdjust.cgst;
  const netSgst = output.sgst - cnAdjust.sgst;
  const netIgst = output.igst - cnAdjust.igst;

  res.json({
    period: { from, to },
    '3_1_outward': { taxable_paise: netTaxable, cgst: netCgst, sgst: netSgst, igst: netIgst },
    '3_1_1_credit_notes': cnAdjust,
    '4_itc': { cgst_paise: itcCgst, sgst_paise: itcSgst, total_paise: itcRaw.total },
    net_payable: {
      cgst_paise: Math.max(0, netCgst - itcCgst),
      sgst_paise: Math.max(0, netSgst - itcSgst),
      igst_paise: Math.max(0, netIgst),
      total_paise: Math.max(0, (netCgst + netSgst + netIgst) - itcRaw.total),
    },
  });
});

// ─── GET /reports/gstr9 — Annual return summary ───
reportsRouter.get('/gstr9', requireRole('admin', 'accounts'), (req, res) => {
  const { fy } = req.query;
  if (!fy) return res.status(400).json({ error: 'fy param required (e.g. 2025-26)' });
  const db = getDb();
  const [fyStart] = fy.split('-');
  const from = `${fyStart}-04-01`;
  const to   = `${parseInt(fyStart) + 1}-03-31`;

  const sales     = db.prepare(`SELECT COALESCE(SUM(taxable_paise),0) as v FROM invoices WHERE date >= ? AND date <= ?`).get(from, to).v;
  const cgstOut   = db.prepare(`SELECT COALESCE(SUM(cgst_paise),0) as v FROM invoices WHERE date >= ? AND date <= ?`).get(from, to).v;
  const sgstOut   = db.prepare(`SELECT COALESCE(SUM(sgst_paise),0) as v FROM invoices WHERE date >= ? AND date <= ?`).get(from, to).v;
  const igstOut   = db.prepare(`SELECT COALESCE(SUM(igst_paise),0) as v FROM invoices WHERE date >= ? AND date <= ?`).get(from, to).v;
  const purchases = db.prepare(`SELECT COALESCE(SUM(taxable_paise),0) as v FROM purchase_orders WHERE date >= ? AND date <= ?`).get(from, to).v;
  const itc       = db.prepare(`SELECT COALESCE(SUM(gst_paise),0) as v FROM purchase_orders WHERE date >= ? AND date <= ?`).get(from, to).v;
  const payments  = db.prepare(`SELECT COALESCE(SUM(amount_paise),0) as v FROM payments WHERE type='payment' AND date >= ? AND date <= ?`).get(from, to).v;
  const collections = db.prepare(`SELECT COALESCE(SUM(amount_paise),0) as v FROM payments WHERE type='receipt' AND date >= ? AND date <= ?`).get(from, to).v;

  const hsnBreakdown = db.prepare(`
    SELECT ii.hsn, SUM(ii.qty) as qty, SUM(ii.line_total_paise) as taxable_paise
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.date >= ? AND i.date <= ? GROUP BY ii.hsn
  `).all(from, to);

  res.json({
    fy, period: { from, to },
    pt4_outward_taxable: { taxable_paise: sales, cgst: cgstOut, sgst: sgstOut, igst: igstOut },
    pt5_itc: { total_paise: itc, cgst: Math.round(itc/2), sgst: Math.round(itc/2) },
    pt6_tax_paid: { cgst: Math.max(0, cgstOut - Math.round(itc/2)), sgst: Math.max(0, sgstOut - Math.round(itc/2)), igst: igstOut },
    purchase_summary: { taxable_paise: purchases },
    cashflow: { collections_paise: collections, payments_paise: payments },
    hsn_breakdown: hsnBreakdown,
  });
});

// ─── GET /reports/day-book ───
reportsRouter.get('/day-book', requireRole('admin', 'accounts'), (req, res) => {
  const { from, to, limit = 200 } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM v_day_book WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to)   { sql += ' AND date <= ?'; params.push(to); }
  sql += ` LIMIT ?`;
  params.push(Number(limit));
  res.json({ entries: db.prepare(sql).all(...params) });
});

// ─── GET /reports/sales-register ───
reportsRouter.get('/sales-register', requireRole('admin', 'accounts'), (req, res) => {
  const { from, to } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM v_sales_register WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to)   { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY date';
  res.json({ invoices: db.prepare(sql).all(...params) });
});

// ─── GET /reports/purchase-register ───
reportsRouter.get('/purchase-register', requireRole('admin', 'accounts'), (req, res) => {
  const { from, to } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM v_purchase_register WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to)   { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY date';
  res.json({ purchase_orders: db.prepare(sql).all(...params) });
});

// ─── GET /reports/aging ───
reportsRouter.get('/aging', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      CASE
        WHEN julianday('now') - julianday(date) <= 30 THEN '0-30'
        WHEN julianday('now') - julianday(date) <= 60 THEN '31-60'
        WHEN julianday('now') - julianday(date) <= 90 THEN '61-90'
        ELSE '90+'
      END as bucket,
      COUNT(*) as count, SUM(total_paise) as amount
    FROM invoices WHERE paid = 0
    GROUP BY bucket
    ORDER BY CASE bucket WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END
  `).all();
  res.json({ aging: rows });
});

// ─── GET /reports/filing-calendar ───
reportsRouter.get('/filing-calendar', requireRole('admin', 'accounts'), (req, res) => {
  const { fy } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM gst_filing_periods WHERE 1=1';
  const params = [];
  if (fy) { sql += ' AND fy = ?'; params.push(fy); }
  sql += ' ORDER BY due_date';
  res.json({ periods: db.prepare(sql).all(...params) });
});

// ─── PATCH /reports/filing-calendar/:id ───
reportsRouter.patch('/filing-calendar/:id',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const { filed_date, status, notes } = req.body;
      const db = getDb();
      const row = db.prepare('SELECT * FROM gst_filing_periods WHERE id = ?').get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Period not found' });
      db.prepare(`
        UPDATE gst_filing_periods SET filed_date=?, status=?, notes=?, filed_by=? WHERE id=?
      `).run(filed_date || null, status || row.status, notes || null, req.user.username, req.params.id);
      res.json({ period: db.prepare('SELECT * FROM gst_filing_periods WHERE id = ?').get(req.params.id) });
    } catch (err) { next(err); }
  }
);

// ─── GET /reports/customer-ledger/:customerId ───
reportsRouter.get('/customer-ledger/:customerId', (req, res, next) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const invoices = db.prepare(`
      SELECT id, date, 'Invoice' as type, total_paise as dr_paise, 0 as cr_paise,
        CASE WHEN paid=1 THEN 'Paid' ELSE 'Outstanding' END as status
      FROM invoices WHERE customer_id = ? ORDER BY date
    `).all(req.params.customerId);

    const receipts = db.prepare(`
      SELECT id, date, 'Receipt' as type, 0 as dr_paise, amount_paise as cr_paise, 'Posted' as status
      FROM payments WHERE type='receipt' AND invoice_id IN (
        SELECT id FROM invoices WHERE customer_id = ?
      ) ORDER BY date
    `).all(req.params.customerId);

    const allEntries = [...invoices, ...receipts].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    const ledger = allEntries.map(e => {
      balance += e.dr_paise - e.cr_paise;
      return { ...e, running_balance_paise: balance };
    });

    res.json({ customer, ledger, closing_balance_paise: balance });
  } catch (err) { next(err); }
});

// ─── GET /reports/vendor-ledger/:vendorId ───
reportsRouter.get('/vendor-ledger/:vendorId', (req, res, next) => {
  try {
    const db = getDb();
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const pos = db.prepare(`
      SELECT id, date, 'Purchase Order' as type, total_paise as cr_paise, 0 as dr_paise, status
      FROM purchase_orders WHERE vendor_id = ? ORDER BY date
    `).all(req.params.vendorId);

    const payments = db.prepare(`
      SELECT id, date, 'Payment' as type, 0 as cr_paise, amount_paise as dr_paise, 'Posted' as status
      FROM payments WHERE type='payment' AND po_id IN (
        SELECT id FROM purchase_orders WHERE vendor_id = ?
      ) ORDER BY date
    `).all(req.params.vendorId);

    const allEntries = [...pos, ...payments].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    const ledger = allEntries.map(e => {
      balance += e.cr_paise - e.dr_paise;
      return { ...e, running_balance_paise: balance };
    });

    res.json({ vendor, ledger, outstanding_paise: balance });
  } catch (err) { next(err); }
});

// ─── GET /reports/msme-compliance ── MSME 45-day overdue tracker ─────────────
reportsRouter.get('/msme-compliance', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM v_msme_overdue ORDER BY days_elapsed DESC').all();
    const totalDisallowance = rows
      .filter(r => r.is_overdue)
      .reduce((s, r) => s + (r.outstanding_paise || 0), 0);
    res.json({ rows, total_disallowance_paise: totalDisallowance, count_overdue: rows.filter(r => r.is_overdue).length });
  } catch {
    // View may not exist if migration not applied yet
    res.json({ rows: [], total_disallowance_paise: 0, count_overdue: 0 });
  }
});

// ─── GET /reports/overdue-interest ── Interest on overdue receivables ─────────
reportsRouter.get('/overdue-interest', requireRole('admin', 'accounts'), (req, res) => {
  const { as_of } = req.query;
  const db = getDb();
  const asOf = as_of || new Date().toISOString().slice(0, 10);

  const unpaid = db.prepare(`
    SELECT i.id, i.date, i.total_paise, i.customer_id,
           c.name AS customer_name,
           COALESCE(c.interest_rate_pct, 18.0) AS rate_pct,
           COALESCE(c.credit_days_actual, 30) AS credit_days
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.paid = 0
    ORDER BY i.date
  `).all();

  const results = unpaid.map(inv => {
    const dueDateMs = new Date(inv.date).getTime() + inv.credit_days * 86400000;
    const asOfMs = new Date(asOf).getTime();
    const overdueDays = Math.max(0, Math.floor((asOfMs - dueDateMs) / 86400000));
    const interestPaise = overdueDays > 0
      ? Math.round(inv.total_paise * inv.rate_pct / 100 * overdueDays / 365)
      : 0;
    return { ...inv, overdue_days: overdueDays, interest_paise: interestPaise };
  }).filter(r => r.overdue_days > 0);

  const totalInterest = results.reduce((s, r) => s + r.interest_paise, 0);
  res.json({ as_of: asOf, invoices: results, total_interest_paise: totalInterest });
});

// ─── GET /reports/trial-balance ── Trial Balance from chart of accounts ───────
reportsRouter.get('/trial-balance', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM v_trial_balance ORDER BY nature, group_name, code').all();
    const totals = rows.reduce((acc, r) => {
      acc.totalDebit  += r.period_debit;
      acc.totalCredit += r.period_credit;
      return acc;
    }, { totalDebit: 0, totalCredit: 0 });
    res.json({ rows, totals });
  } catch {
    res.json({ rows: [], totals: { totalDebit: 0, totalCredit: 0 } });
  }
});

// ─── GET /reports/balance-sheet ── Balance Sheet (assets vs liabilities + capital) ──
reportsRouter.get('/balance-sheet', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM v_trial_balance ORDER BY nature, group_name, code').all();

    const byNature = { asset: [], liability: [], capital: [], income: [], expense: [] };
    for (const r of rows) {
      (byNature[r.nature] || byNature.asset).push(r);
    }

    const sum = (arr) => arr.reduce((s, r) => s + Math.abs(r.closing_balance), 0);
    const totalAssets      = sum(byNature.asset);
    const totalLiabilities = sum(byNature.liability) + sum(byNature.capital);
    const netProfit        = sum(byNature.income) - sum(byNature.expense);

    res.json({
      assets:      byNature.asset,
      liabilities: byNature.liability,
      capital:     byNature.capital,
      income:      byNature.income,
      expenses:    byNature.expense,
      totals: {
        total_assets_paise: totalAssets,
        total_liabilities_capital_paise: totalLiabilities + netProfit,
        net_profit_paise: netProfit,
      },
    });
  } catch {
    res.json({ assets: [], liabilities: [], capital: [], income: [], expenses: [], totals: {} });
  }
});

// ─── GET /reports/gstr2b-recon ── GSTR-2B reconciliation ─────────────────────
reportsRouter.get('/gstr2b-recon', requireRole('admin', 'accounts'), (req, res) => {
  const { period } = req.query;
  const db = getDb();
  if (!period) return res.status(400).json({ error: 'period required (YYYY-MM)' });

  const importRow = db.prepare('SELECT * FROM gstr2b_imports WHERE period = ? ORDER BY imported_at DESC LIMIT 1').get(period);
  if (!importRow) return res.json({ period, imported: false, records: [], summary: {} });

  const records = db.prepare(`
    SELECT r.*, v.name AS matched_vendor_name
    FROM gstr2b_records r
    LEFT JOIN purchase_orders po ON po.id = r.matched_po_id
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE r.import_id = ?
    ORDER BY r.supplier_name, r.invoice_date
  `).all(importRow.id);

  const summary = {
    total: records.length,
    reconciled: records.filter(r => r.reconciled).length,
    unreconciled: records.filter(r => !r.reconciled).length,
    total_itc_paise: records.reduce((s, r) => s + r.igst_paise + r.cgst_paise + r.sgst_paise, 0),
    itc_available_paise: records.filter(r => r.itc_available === 'Y').reduce((s, r) => s + r.igst_paise + r.cgst_paise + r.sgst_paise, 0),
  };

  res.json({ period, imported: true, import_date: importRow.imported_at, records, summary });
});

// ─── GET /reports/cash-book ── Day-wise cash transactions (Tally Cash Book) ─
reportsRouter.get('/cash-book', requireRole('admin', 'accounts'), (req, res) => {
  const { from, to } = req.query;
  const db = getDb();
  const params = [];
  let where = "WHERE (ag.nature = 'asset' AND (a.name LIKE '%Cash%' OR a.code LIKE '%CASH%'))";
  if (from) { where += ' AND jv.date >= ?'; params.push(from); }
  if (to)   { where += ' AND jv.date <= ?'; params.push(to); }

  const entries = db.prepare(`
    SELECT jv.date, jv.id AS voucher_id, jv.voucher_type, jv.narration,
      a.name AS account_name,
      CASE WHEN je.debit_paise > 0 THEN 'Receipt' ELSE 'Payment' END AS direction,
      je.debit_paise AS inflow_paise, je.credit_paise AS outflow_paise,
      -- counterpart account
      (SELECT GROUP_CONCAT(a2.name, ', ')
       FROM journal_entries je2 JOIN accounts a2 ON a2.id = je2.account_id
       WHERE je2.voucher_id = jv.id AND je2.id != je.id) AS contra_accounts
    FROM journal_vouchers jv
    JOIN journal_entries je ON je.voucher_id = jv.id
    JOIN accounts a ON a.id = je.account_id
    JOIN account_groups ag ON ag.id = a.group_id
    ${where}
    ORDER BY jv.date, jv.id
  `).all(...params);

  let runningBalance = 0;
  const withBalance = entries.map(e => {
    runningBalance += (e.inflow_paise - e.outflow_paise);
    return { ...e, running_balance_paise: runningBalance };
  });

  const totalInflow  = entries.reduce((s, e) => s + e.inflow_paise, 0);
  const totalOutflow = entries.reduce((s, e) => s + e.outflow_paise, 0);

  res.json({
    entries: withBalance,
    summary: { total_receipts_paise: totalInflow, total_payments_paise: totalOutflow, closing_balance_paise: runningBalance },
  });
});

// ─── GET /reports/bank-book ── Day-wise bank transactions ─────────────────────
reportsRouter.get('/bank-book', requireRole('admin', 'accounts'), (req, res) => {
  const { from, to, bank_account_id } = req.query;
  const db = getDb();
  const params = [];
  let where = "WHERE (ag.name IN ('Bank Accounts', 'Bank OD Accounts') OR a.name LIKE '%Bank%' OR a.name LIKE '%SBI%' OR a.name LIKE '%HDFC%')";
  if (bank_account_id) { where += ' AND a.id = ?'; params.push(bank_account_id); }
  if (from) { where += ' AND jv.date >= ?'; params.push(from); }
  if (to)   { where += ' AND jv.date <= ?'; params.push(to); }

  const entries = db.prepare(`
    SELECT jv.date, jv.id AS voucher_id, jv.voucher_type, jv.narration,
      a.name AS bank_account,
      CASE WHEN je.debit_paise > 0 THEN 'Deposit' ELSE 'Withdrawal' END AS direction,
      je.debit_paise AS inflow_paise, je.credit_paise AS outflow_paise,
      (SELECT GROUP_CONCAT(a2.name, ', ')
       FROM journal_entries je2 JOIN accounts a2 ON a2.id = je2.account_id
       WHERE je2.voucher_id = jv.id AND je2.id != je.id) AS contra_accounts
    FROM journal_vouchers jv
    JOIN journal_entries je ON je.voucher_id = jv.id
    JOIN accounts a ON a.id = je.account_id
    JOIN account_groups ag ON ag.id = a.group_id
    ${where}
    ORDER BY jv.date, jv.id
  `).all(...params);

  let runningBalance = 0;
  const withBalance = entries.map(e => {
    runningBalance += (e.inflow_paise - e.outflow_paise);
    return { ...e, running_balance_paise: runningBalance };
  });

  res.json({
    entries: withBalance,
    summary: {
      total_deposits_paise: entries.reduce((s, e) => s + e.inflow_paise, 0),
      total_withdrawals_paise: entries.reduce((s, e) => s + e.outflow_paise, 0),
      closing_balance_paise: runningBalance,
    },
  });
});

// ─── GET /reports/ar-aging ── Accounts Receivable aging (Tally-style) ─────────
reportsRouter.get('/ar-aging', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM v_ar_aging ORDER BY age_days DESC').all();
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0 };
    const bucketAmounts = { '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0 };
    for (const r of rows) {
      buckets[r.aging_bucket] = (buckets[r.aging_bucket] || 0) + 1;
      bucketAmounts[r.aging_bucket] = (bucketAmounts[r.aging_bucket] || 0) + r.total_paise;
    }
    res.json({
      invoices: rows,
      buckets: Object.keys(buckets).map(k => ({ bucket: k, count: buckets[k], amount_paise: bucketAmounts[k] })),
      total_outstanding_paise: rows.reduce((s, r) => s + r.total_paise, 0),
    });
  } catch { res.json({ invoices: [], buckets: [], total_outstanding_paise: 0 }); }
});

// ─── GET /reports/ap-aging ── Accounts Payable aging ──────────────────────────
reportsRouter.get('/ap-aging', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM v_ap_aging ORDER BY age_days DESC').all();
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0 };
    const bucketAmounts = { '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0 };
    for (const r of rows) {
      buckets[r.aging_bucket] = (buckets[r.aging_bucket] || 0) + 1;
      bucketAmounts[r.aging_bucket] = (bucketAmounts[r.aging_bucket] || 0) + r.total_paise;
    }
    res.json({
      purchase_orders: rows,
      buckets: Object.keys(buckets).map(k => ({ bucket: k, count: buckets[k], amount_paise: bucketAmounts[k] })),
      total_outstanding_paise: rows.reduce((s, r) => s + r.total_paise, 0),
      msme_overdue_paise: rows.filter(r => r.msme_overdue_days > 0).reduce((s, r) => s + r.total_paise, 0),
    });
  } catch { res.json({ purchase_orders: [], buckets: [], total_outstanding_paise: 0 }); }
});

// ─── GET /reports/cash-flow ── Cash Flow Statement (Indirect method) ──────────
reportsRouter.get('/cash-flow', requireRole('admin', 'accounts'), (req, res) => {
  const { from, to } = req.query;
  const db = getDb();
  const fyStart = from || `${new Date().getFullYear()}-04-01`;
  const fyEnd   = to   || new Date().toISOString().slice(0, 10);

  // Operating activities
  const netSales     = db.prepare('SELECT COALESCE(SUM(total_paise),0) as v FROM invoices WHERE date >= ? AND date <= ?').get(fyStart, fyEnd).v;
  const collections  = db.prepare("SELECT COALESCE(SUM(amount_paise),0) as v FROM payments WHERE type='receipt' AND date >= ? AND date <= ?").get(fyStart, fyEnd).v;
  const purchases    = db.prepare('SELECT COALESCE(SUM(total_paise),0) as v FROM purchase_orders WHERE date >= ? AND date <= ? AND status != ?').get(fyStart, fyEnd, 'cancelled').v;
  const vendorPayments = db.prepare("SELECT COALESCE(SUM(amount_paise),0) as v FROM payments WHERE type='payment' AND date >= ? AND date <= ?").get(fyStart, fyEnd).v;
  const payroll      = db.prepare("SELECT COALESCE(SUM(total_net_paise),0) as v FROM payroll_runs WHERE status='paid' AND month >= ? AND month <= ?").get(fyStart.slice(0,7), fyEnd.slice(0,7)).v;

  // Investing activities
  const assetPurchases = db.prepare('SELECT COALESCE(SUM(purchase_cost_paise),0) as v FROM fixed_assets WHERE purchase_date >= ? AND purchase_date <= ?').get(fyStart, fyEnd).v;
  const assetDisposals = db.prepare('SELECT COALESCE(SUM(disposal_value_paise),0) as v FROM fixed_assets WHERE disposal_date >= ? AND disposal_date <= ? AND disposed=1').get(fyStart, fyEnd).v;

  const consumablesPaid = db.prepare("SELECT COALESCE(SUM(total_paise),0) as v FROM consumable_purchases WHERE status='paid' AND date >= ? AND date <= ?").get(fyStart, fyEnd).v;
  const operating_cf = collections - vendorPayments - payroll - consumablesPaid;
  const investing_cf = (assetDisposals || 0) - (assetPurchases || 0);
  const financing_cf = 0; // loans/equity changes — requires manual entry

  res.json({
    period: { from: fyStart, to: fyEnd },
    operating_activities: {
      collections_paise: collections,
      vendor_payments_paise: vendorPayments,
      payroll_paise: payroll,
      consumables_paid_paise: consumablesPaid,
      net_operating_cf_paise: operating_cf,
    },
    investing_activities: {
      asset_purchases_paise: assetPurchases,
      asset_disposals_paise: assetDisposals || 0,
      net_investing_cf_paise: investing_cf,
    },
    financing_activities: {
      net_financing_cf_paise: financing_cf,
      note: 'Add loan receipts/repayments, capital contributions via journal vouchers',
    },
    net_change_in_cash_paise: operating_cf + investing_cf + financing_cf,
    supplementary: {
      net_sales_paise: netSales,
      total_purchases_paise: purchases,
    },
  });
});

// ─── GET /reports/ratio-analysis ── Financial Ratios (Tally-like) ─────────────
reportsRouter.get('/ratio-analysis', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();

  // Current Assets (cash + bank + debtors + stock)
  const arPaise      = db.prepare("SELECT COALESCE(SUM(total_paise),0) as v FROM invoices WHERE paid=0").get().v;
  const stockValue   = db.prepare("SELECT COALESCE(SUM(rate_paise * stock),0) as v FROM products WHERE active=1").get().v;
  const revenue      = db.prepare("SELECT COALESCE(SUM(taxable_paise),0) as v FROM invoices").get().v;
  const apPaise      = db.prepare("SELECT COALESCE(SUM(total_paise),0) as v FROM purchase_orders WHERE status NOT IN ('cancelled','received')").get().v;
  const grossProfit  = db.prepare(`
    SELECT COALESCE(SUM(taxable_paise),0) - COALESCE((SELECT SUM(taxable_paise) FROM purchase_orders WHERE status != 'cancelled'),0) as v
    FROM invoices
  `).get().v;
  const invoiceCount = db.prepare("SELECT COUNT(*) as v, COALESCE(AVG(total_paise),0) as avg FROM invoices WHERE paid=0").get();
  const collectionDays = arPaise > 0 && revenue > 0 ? Math.round(arPaise / revenue * 365) : 0;
  const paymentDays    = apPaise > 0 && revenue > 0 ? Math.round(apPaise / revenue * 365) : 0;
  const inventoryDays  = stockValue > 0 && revenue > 0 ? Math.round(stockValue / revenue * 365) : 0;

  const currentAssets  = arPaise + stockValue;
  const currentLiab    = apPaise;
  const currentRatio   = currentLiab > 0 ? (currentAssets / currentLiab).toFixed(2) : 'N/A';
  const quickRatio     = currentLiab > 0 ? ((arPaise) / currentLiab).toFixed(2) : 'N/A';
  const gpMargin       = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(2) : '0.00';

  res.json({
    liquidity: {
      current_ratio:     currentRatio,
      quick_ratio:       quickRatio,
      current_assets_paise:   currentAssets,
      current_liabilities_paise: currentLiab,
    },
    efficiency: {
      debtors_days:      collectionDays,   // avg collection period
      creditors_days:    paymentDays,      // avg payment period
      inventory_days:    inventoryDays,    // stock holding period
      working_capital_paise: currentAssets - currentLiab,
    },
    profitability: {
      gross_profit_margin_pct: gpMargin,
      revenue_paise:     revenue,
      gross_profit_paise: grossProfit,
    },
    outstanding: {
      ar_paise:          arPaise,
      ap_paise:          apPaise,
      stock_value_paise: stockValue,
      unpaid_invoices:   invoiceCount.v,
    },
  });
});

// ─── GET /reports/ledger/:accountId ── Account Ledger (Tally Ledger) ──────────
reportsRouter.get('/ledger/:accountId', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const { from, to } = req.query;
    let where = 'WHERE je.account_id = ?';
    const params = [req.params.accountId];
    if (from) { where += ' AND jv.date >= ?'; params.push(from); }
    if (to)   { where += ' AND jv.date <= ?'; params.push(to); }

    const entries = db.prepare(`
      SELECT jv.date, jv.id AS voucher_id, jv.voucher_type, jv.narration,
        je.debit_paise, je.credit_paise, je.narration AS entry_narration
      FROM journal_entries je
      JOIN journal_vouchers jv ON jv.id = je.voucher_id
      ${where}
      ORDER BY jv.date, jv.id
    `).all(...params);

    let balance = account.opening_balance_paise || 0;
    const withBalance = entries.map(e => {
      balance += (account.is_debit_balance ? 1 : -1) * (e.debit_paise - e.credit_paise);
      return { ...e, running_balance_paise: balance };
    });

    const periodDebit  = entries.reduce((s, e) => s + e.debit_paise, 0);
    const periodCredit = entries.reduce((s, e) => s + e.credit_paise, 0);

    res.json({ account, entries: withBalance, periodDebit, periodCredit, closingBalance: balance });
  } catch (err) { next(err); }
});

// ─── GET /reports/pl-real ── Real P&L from Chart of Accounts ─────────────────
reportsRouter.get('/pl-real', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM v_trial_balance ORDER BY nature, group_name, code').all();
    const income  = rows.filter(r => r.nature === 'income');
    const expense = rows.filter(r => r.nature === 'expense');

    const totalIncome  = income.reduce((s, r) => s + Math.abs(r.closing_balance), 0);
    const totalExpense = expense.reduce((s, r) => s + Math.abs(r.closing_balance), 0);
    const netProfit    = totalIncome - totalExpense;

    res.json({
      income_accounts:  income,
      expense_accounts: expense,
      totals: {
        total_income_paise:  totalIncome,
        total_expense_paise: totalExpense,
        net_profit_paise:    netProfit,
        net_profit_margin_pct: totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(2) : '0.00',
      },
    });
  } catch {
    res.json({ income_accounts: [], expense_accounts: [], totals: { total_income_paise: 0, total_expense_paise: 0, net_profit_paise: 0 } });
  }
});

// ─── GET /reports/cost-centre ── Cost Centre summary ─────────────────────────
reportsRouter.get('/cost-centres', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  try {
    const centres = db.prepare('SELECT * FROM cost_centres WHERE active=1 ORDER BY name').all();
    const summary = db.prepare(`
      SELECT jcc.cost_centre_id, cc.name, cc.type,
        SUM(CASE WHEN je.debit_paise > 0 THEN jcc.amount_paise ELSE 0 END) AS debit_paise,
        SUM(CASE WHEN je.credit_paise > 0 THEN jcc.amount_paise ELSE 0 END) AS credit_paise
      FROM journal_entry_cc jcc
      JOIN journal_entries je ON je.id = jcc.entry_id
      JOIN cost_centres cc ON cc.id = jcc.cost_centre_id
      GROUP BY jcc.cost_centre_id
    `).all();
    res.json({ centres, summary });
  } catch { res.json({ centres: [], summary: [] }); }
});

// ─── POST /reports/gstr2b-import ── Upload GSTR-2B JSON ──────────────────────
reportsRouter.post('/gstr2b-import', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { period, records } = req.body;
    if (!period || !Array.isArray(records))
      return res.status(400).json({ error: 'period and records[] required' });

    db.transaction(() => {
      const importId = db.prepare(
        'INSERT INTO gstr2b_imports (period, record_count) VALUES (?,?)'
      ).run(period, records.length).lastInsertRowid;

      const stmt = db.prepare(`
        INSERT INTO gstr2b_records
          (import_id, supplier_gstin, supplier_name, invoice_no, invoice_date,
           invoice_type, taxable_paise, igst_paise, cgst_paise, sgst_paise, itc_available)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `);

      for (const r of records) {
        const taxable = Math.round((r.taxable_val || 0) * 100);
        const igst    = Math.round((r.igst || 0) * 100);
        const cgst    = Math.round((r.cgst || 0) * 100);
        const sgst    = Math.round((r.sgst || r.utgst || 0) * 100);

        stmt.run(importId, r.gstin || r.ctin, r.name || r.trdnm, r.inv_no || r.inum,
                 r.inv_date || r.dt, r.inv_type || 'B2B', taxable, igst, cgst, sgst,
                 r.itc_avl || 'Y');
      }

      // Auto-reconcile by GSTIN + invoice number match
      const inserted = db.prepare(
        'SELECT * FROM gstr2b_records WHERE import_id = ?'
      ).all(importId);

      for (const rec of inserted) {
        const po = db.prepare(`
          SELECT po.id FROM purchase_orders po
          JOIN vendors v ON v.id = po.vendor_id
          WHERE v.gstin = ? AND po.invoice_no = ?
          LIMIT 1
        `).get(rec.supplier_gstin, rec.invoice_no);
        if (po) {
          db.prepare('UPDATE gstr2b_records SET reconciled = 1, matched_po_id = ? WHERE id = ?')
            .run(po.id, rec.id);
        }
      }
    })();

    res.status(201).json({ success: true, imported: records.length });
  } catch (err) { next(err); }
});

// ─── GET /reports/stock-valuation ── Weighted-average cost per product ─────────
reportsRouter.get('/stock-valuation', requireRole('admin', 'accounts', 'yard'), (req, res) => {
  const db = getDb();
  try {
    const products = db.prepare(`
      SELECT p.id, p.kind, p.variety, p.grade, p.stock, p.uom,
             p.rate_paise, p.unit_cost_paise, p.lot_id, p.current_location_id AS location
      FROM products p
      WHERE p.active = 1 AND p.stock > 0
      ORDER BY p.kind, p.variety, p.lot_id
    `).all();

    const byVariety = {};
    let totalValue = 0;
    for (const p of products) {
      const costPaise = p.unit_cost_paise || p.rate_paise || 0;
      const value = costPaise * (p.stock || 1);
      totalValue += value;
      if (!byVariety[p.variety]) byVariety[p.variety] = { count: 0, stock: 0, value_paise: 0 };
      byVariety[p.variety].count++;
      byVariety[p.variety].stock += (p.stock || 1);
      byVariety[p.variety].value_paise += value;
    }

    res.json({
      products: products.map(p => ({
        ...p,
        cost_paise: p.unit_cost_paise || p.rate_paise || 0,
        value_paise: (p.unit_cost_paise || p.rate_paise || 0) * (p.stock || 1),
      })),
      by_variety: Object.entries(byVariety).map(([variety, v]) => ({ variety, ...v })),
      total_value_paise: totalValue,
      total_products: products.length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /reports/depreciation ── Auto depreciation schedule (SLM) ────────────
reportsRouter.get('/depreciation', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  try {
    const assets = db.prepare(
      `SELECT * FROM fixed_assets WHERE disposed = 0 OR disposed IS NULL ORDER BY purchase_date`
    ).all();

    const today = new Date();
    const schedule = assets.map(a => {
      const cost = a.purchase_cost_paise || 0;
      const salvage = a.salvage_value_paise || 0;
      const life = a.useful_life_years || 5;
      const rate = a.depreciation_rate_pct || (100 / life);
      const annualDep = Math.round((cost - salvage) * rate / 100);
      const monthlyDep = Math.round(annualDep / 12);

      const start = new Date(a.purchase_date || a.created_at);
      const monthsInService = Math.max(0,
        (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth())
      );
      const accumulatedDep = Math.min(cost - salvage, monthlyDep * monthsInService);
      const bookValue = Math.max(salvage, cost - accumulatedDep);

      return { ...a, annual_dep_paise: annualDep, monthly_dep_paise: monthlyDep,
        months_in_service: monthsInService, accumulated_dep_paise: accumulatedDep,
        book_value_paise: bookValue, fully_depreciated: bookValue <= salvage };
    });

    res.json({
      assets: schedule,
      summary: {
        total_cost_paise: schedule.reduce((s, a) => s + (a.purchase_cost_paise || 0), 0),
        total_accumulated_dep_paise: schedule.reduce((s, a) => s + a.accumulated_dep_paise, 0),
        total_book_value_paise: schedule.reduce((s, a) => s + a.book_value_paise, 0),
        monthly_dep_paise: schedule.filter(a => !a.fully_depreciated).reduce((s, a) => s + a.monthly_dep_paise, 0),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
