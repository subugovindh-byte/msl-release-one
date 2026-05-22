import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error.js';
import { nextTdsId, nextTdsChallanId } from '../services/idGenerator.js';

export const tdsRouter = Router();
tdsRouter.use(authenticate);

// ─── GET /tds/sections ── reference data for forms
tdsRouter.get('/sections', (req, res) => {
  const db = getDb();
  res.json({ sections: db.prepare('SELECT * FROM tds_sections ORDER BY code').all() });
});

// ─── GET /tds ── list transactions
tdsRouter.get('/', requireRole('admin', 'accounts'), (req, res) => {
  const { fy, quarter, vendor_id, deposited, section } = req.query;
  const db = getDb();
  let sql = `
    SELECT t.*, v.name AS vendor_name, v.pan AS vendor_pan
    FROM tds_transactions t
    LEFT JOIN vendors v ON v.id = t.vendor_id
    WHERE 1=1
  `;
  const params = [];
  if (fy)        { sql += ' AND t.fy = ?';          params.push(fy); }
  if (quarter)   { sql += ' AND t.quarter = ?';      params.push(quarter); }
  if (vendor_id) { sql += ' AND t.vendor_id = ?';    params.push(vendor_id); }
  if (deposited !== undefined) { sql += ' AND t.deposited = ?'; params.push(deposited === 'true' ? 1 : 0); }
  if (section)   { sql += ' AND t.section = ?';      params.push(section); }
  sql += ' ORDER BY t.payment_date DESC, t.id DESC';
  res.json({ transactions: db.prepare(sql).all(...params) });
});

// ─── POST /tds ── create TDS transaction
tdsRouter.post('/', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { vendor_id, payment_id, po_id, section, payment_date, gross_amount_paise, tds_rate_pct, notes } = req.body;
    if (!vendor_id || !section || !payment_date || !gross_amount_paise || tds_rate_pct == null)
      return res.status(400).json({ error: 'vendor_id, section, payment_date, gross_amount_paise, tds_rate_pct required' });

    const tds_amount_paise = Math.round(gross_amount_paise * tds_rate_pct / 100);
    const date = new Date(payment_date);
    const month = date.getMonth() + 1;
    const fyStart = month >= 4 ? date.getFullYear() : date.getFullYear() - 1;
    const fy = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
    const quarter = month >= 4 && month <= 6 ? 'Q1' : month >= 7 && month <= 9 ? 'Q2' : month >= 10 && month <= 12 ? 'Q3' : 'Q4';

    const id = nextTdsId();
    db.prepare(`
      INSERT INTO tds_transactions
        (id, vendor_id, payment_id, po_id, section, payment_date, gross_amount_paise,
         tds_rate_pct, tds_amount_paise, fy, quarter, notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, vendor_id, payment_id || null, po_id || null, section, payment_date,
           gross_amount_paise, tds_rate_pct, tds_amount_paise, fy, quarter,
           notes || null, req.user.username);

    res.status(201).json({ transaction: db.prepare('SELECT * FROM tds_transactions WHERE id = ?').get(id) });
  } catch (err) { next(err); }
});

// ─── PATCH /tds/:id/deposit ── mark as deposited, attach challan
tdsRouter.patch('/:id/deposit', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const txn = db.prepare('SELECT * FROM tds_transactions WHERE id = ?').get(req.params.id);
    if (!txn) throw new NotFoundError('TDS transaction not found');
    const { challan_no, challan_date, bsr_code } = req.body;
    db.prepare(`
      UPDATE tds_transactions SET deposited = 1, challan_no = ?, challan_date = ?, bsr_code = ?
      WHERE id = ?
    `).run(challan_no || null, challan_date || null, bsr_code || null, req.params.id);
    res.json({ transaction: db.prepare('SELECT * FROM tds_transactions WHERE id = ?').get(req.params.id) });
  } catch (err) { next(err); }
});

// ─── GET /tds/challans ── list challans
tdsRouter.get('/challans', requireRole('admin', 'accounts'), (req, res) => {
  const { fy, quarter } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM tds_challans WHERE 1=1';
  const params = [];
  if (fy)      { sql += ' AND fy = ?';      params.push(fy); }
  if (quarter) { sql += ' AND quarter = ?'; params.push(quarter); }
  sql += ' ORDER BY challan_date DESC';
  res.json({ challans: db.prepare(sql).all(...params) });
});

// ─── POST /tds/challans ── record ITNS 281 challan deposit
tdsRouter.post('/challans', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { challan_date, bsr_code, challan_serial_no, section, amount_paise, fy, quarter } = req.body;
    if (!challan_date || !bsr_code || !challan_serial_no || !section || !amount_paise || !fy || !quarter)
      return res.status(400).json({ error: 'All challan fields required' });

    const id = nextTdsChallanId();
    db.prepare(`
      INSERT INTO tds_challans (id, challan_date, bsr_code, challan_serial_no, section, amount_paise, fy, quarter)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(id, challan_date, bsr_code, challan_serial_no, section, amount_paise, fy, quarter);

    res.status(201).json({ challan: db.prepare('SELECT * FROM tds_challans WHERE id = ?').get(id) });
  } catch (err) { next(err); }
});

// ─── GET /tds/26q ── Form 26Q data export (quarterly TDS return)
tdsRouter.get('/26q', requireRole('admin', 'accounts'), (req, res) => {
  const { fy, quarter } = req.query;
  if (!fy || !quarter) return res.status(400).json({ error: 'fy and quarter required' });
  const db = getDb();

  const transactions = db.prepare(`
    SELECT t.*, v.name AS vendor_name, v.pan AS vendor_pan, v.state AS vendor_state,
           v.deductee_type, v.address AS vendor_address
    FROM tds_transactions t
    LEFT JOIN vendors v ON v.id = t.vendor_id
    WHERE t.fy = ? AND t.quarter = ?
    ORDER BY t.payment_date
  `).all(fy, quarter);

  const summary = db.prepare(`
    SELECT section,
           COUNT(*) AS txn_count,
           SUM(gross_amount_paise) AS total_gross_paise,
           SUM(tds_amount_paise) AS total_tds_paise,
           SUM(CASE WHEN deposited = 1 THEN tds_amount_paise ELSE 0 END) AS deposited_paise,
           SUM(CASE WHEN deposited = 0 THEN tds_amount_paise ELSE 0 END) AS pending_paise
    FROM tds_transactions
    WHERE fy = ? AND quarter = ?
    GROUP BY section
  `).all(fy, quarter);

  res.json({ fy, quarter, summary, transactions });
});
