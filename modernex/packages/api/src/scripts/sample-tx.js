/**
 * sample-tx.js — One sample entry for every module.
 *
 * Modules covered:
 *   Production  · Sales (PO/Invoice/Payment/PDC)
 *   HR/Payroll  · EPF · ESI · PT · Bonus
 *   Fixed Assets · TDS · GST filing periods
 *   Bank         · Journal Vouchers
 *
 * Usage:
 *   node …/sample-tx.js             # seed sample data
 *   node …/sample-tx.js --purge     # remove SAMPLE-* records only
 *   node …/sample-tx.js --purgeall  # wipe ALL transactional data
 *
 * npm shortcuts (from packages/api):
 *   npm run sample:tx
 *   npm run sample:purge
 *   npm run sample:purgeall
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.resolve(__dirname, '../../data/modernex.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const PURGE     = process.argv.includes('--purge');
const PURGE_ALL = process.argv.includes('--purgeall');

// ── Date helpers ──────────────────────────────────────────────────────────────
const daysAgo   = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); };
const daysAhead = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };

// ── Constants ─────────────────────────────────────────────────────────────────
const SAMPLE_MONTH   = '2026-04';
const SAMPLE_FY      = '2026-27';
const SAMPLE_QUARTER = 'Q1';

// ── IDs (all prefixed SAMPLE- for safe per-record purge) ──────────────────────
const IDS = {
  // Production / Sales
  customer : 'SAMPLE-CUST',
  po       : 'SAMPLE-PO-001',
  invoice  : 'SAMPLE-INV-001',
  rcpt     : 'SAMPLE-PAY-001',
  pdc      : 'SAMPLE-PDC-001',
  // Consumables / Budgets
  cp       : 'CP-2026-0001',
  // HR / Payroll
  emp1     : 'SAMPLE-EMP-001',
  emp2     : 'SAMPLE-EMP-002',
  payrun   : 'SAMPLE-PAYRUN-001',
  // Assets / Bank
  asset    : 'SAMPLE-ASSET-001',
  bank     : 'SAMPLE-BANK-001',
  // Journals
  jv1      : 'SAMPLE-JV-001',
  jv2      : 'SAMPLE-JV-002',
  jv3      : 'SAMPLE-JV-003',
  // TDS
  tds_tx   : 'SAMPLE-TDS-001',
  tds_ch   : 'SAMPLE-TDSCHAL-001',
};

// ── PURGE ALL ──────────────────────────────────────────────────────────────────
if (PURGE_ALL) {
  console.log('\n⚠️   Wiping ALL transactional data…');
  console.log('    (users · locations · COA · variety master · TDS sections preserved)\n');

  db.pragma('foreign_keys = OFF');

  const clear = (table) => {
    try {
      const n = db.prepare(`DELETE FROM ${table}`).run().changes;
      if (n) console.log(`   ✓ ${table.padEnd(36)} ${n} row(s)`);
    } catch (e) {
      console.log(`   ⚠  ${table}: ${e.message}`);
    }
  };

  db.transaction(() => {
    // ── Production ──
    clear('production_job_outputs');
    clear('production_job_inputs');
    clear('production_jobs');
    clear('production_jobs_legacy');
    clear('inventory_moves');

    // ── Product dimension tables ──
    clear('product_blocks');
    clear('product_slabs');
    clear('product_tiles');
    clear('product_cts');
    clear('product_strips');
    clear('product_kerbs');
    clear('product_cobbles');
    clear('product_chips');
    clear('product_monuments');
    clear('product_monuments_legacy');
    clear('product_spec_templates');
    clear('slabs_legacy');
    clear('products');

    // ── Finance ──
    clear('post_dated_cheques');
    clear('payments');
    clear('debit_credit_notes');
    clear('delivery_challan_items');
    clear('delivery_challans');
    clear('invoice_items');
    clear('invoice_items_legacy');
    clear('invoices');
    clear('purchase_order_receipts');
    clear('purchase_orders');

    // ── Parties ──
    clear('customers');
    clear('vendors');

    // ── Accounting journals ──
    clear('journal_entry_cc');
    clear('journal_entries');
    clear('recurring_voucher_lines');
    clear('recurring_vouchers');
    clear('journal_vouchers');

    // ── Tax / compliance ──
    clear('tds_transactions');
    clear('tds_challans');
    clear('gstr2b_records');
    clear('gstr2b_imports');
    clear('gst_filing_periods');
    clear('itc_ledger');
    clear('interest_calc_log');
    clear('msme_interest_log');
    clear('pt_challans_tn');
    clear('epf_challans');
    clear('esi_challans');
    clear('lwf_contributions');
    clear('lwf_challan_batches');

    // ── Payroll / HR ──
    clear('payroll_entries');
    clear('payroll_runs');
    clear('bonus_entries');
    clear('bonus_runs');
    clear('gratuity_records');
    clear('leave_applications');
    clear('leave_balances');
    clear('employee_tax_declarations');
    clear('employees');

    // ── Assets / banking ──
    clear('asset_depreciation_log');
    clear('fixed_assets');
    clear('bank_statement_lines');
    clear('bank_statements');
    clear('bank_accounts_reg');
    clear('collection_accounts');
    clear('budgets');
    clear('budget_targets');

    // ── Consumables ──
    clear('consumable_purchases');

    // ── Audit / session ──
    clear('audit_log');
    clear('backups');
    clear('refresh_tokens');
  })();

  db.pragma('foreign_keys = ON');

  console.log(`
✅  All transactional data wiped.
    Kept: users · locations · chart of accounts · variety master · TDS sections
    Run: npm run sample:tx   to re-seed sample data
`);
  db.close();
  process.exit(0);
}

// ── PURGE (SAMPLE- only) ───────────────────────────────────────────────────────
if (PURGE) {
  console.log('\n🗑  Purging SAMPLE-* records…');

  db.transaction(() => {
    const del  = (table, col, val) => {
      const n = db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(val).changes;
      if (n) console.log(`   ✓ Removed ${n} row(s) from ${table}`);
    };
    const delLike = (table, col, pat) => {
      const n = db.prepare(`DELETE FROM ${table} WHERE ${col} LIKE ?`).run(pat).changes;
      if (n) console.log(`   ✓ Removed ${n} row(s) from ${table}`);
    };

    // Consumables / Budgets
    del('consumable_purchases', 'id', IDS.cp);
    const btDel = db.prepare(`DELETE FROM budget_targets WHERE created_by = 'sample-tx'`).run().changes;
    if (btDel) console.log(`   ✓ Removed ${btDel} row(s) from budget_targets`);

    // Compliance
    del('tds_challans',     'id',          IDS.tds_ch);
    del('tds_transactions', 'id',          IDS.tds_tx);
    db.prepare(`DELETE FROM gst_filing_periods WHERE filed_by = 'sample-tx'`).run();
    db.prepare(`DELETE FROM pt_challans_tn  WHERE month = ?`).run(SAMPLE_MONTH);
    db.prepare(`DELETE FROM esi_challans    WHERE month = ?`).run(SAMPLE_MONTH);
    db.prepare(`DELETE FROM epf_challans    WHERE month = ?`).run(SAMPLE_MONTH);

    // Bank
    delLike('bank_statement_lines', 'bank_account_id', 'SAMPLE-%');
    del('bank_accounts_reg', 'id', IDS.bank);

    // Fixed assets
    del('asset_depreciation_log', 'asset_id', IDS.asset);
    del('fixed_assets',           'id',        IDS.asset);

    // Journals
    delLike('journal_entries',  'voucher_id', 'SAMPLE-%');
    delLike('journal_vouchers', 'id',          'SAMPLE-%');

    // HR / payroll
    db.prepare(`DELETE FROM bonus_entries WHERE run_id IN (SELECT id FROM bonus_runs WHERE created_by='sample-tx')`).run();
    db.prepare(`DELETE FROM bonus_runs WHERE created_by='sample-tx'`).run();
    delLike('leave_applications', 'employee_id', 'SAMPLE-%');
    delLike('leave_balances',     'employee_id', 'SAMPLE-%');
    delLike('payroll_entries',    'run_id',       'SAMPLE-%');
    del('payroll_runs', 'id', IDS.payrun);
    delLike('employees', 'id', 'SAMPLE-%');

    // Production
    delLike('production_job_outputs', 'job_id',     'SAMPLE-%');
    delLike('production_job_inputs',  'job_id',     'SAMPLE-%');
    delLike('production_jobs',        'id',         'SAMPLE-%');
    delLike('product_blocks',         'product_id', 'SAMPLE-%');
    delLike('product_slabs',          'product_id', 'SAMPLE-%');
    delLike('products',               'id',         'SAMPLE-%');

    // Sales
    del('post_dated_cheques', 'id',         IDS.pdc);
    del('payments',           'id',         IDS.rcpt);
    del('invoice_items',      'invoice_id', IDS.invoice);
    del('invoices',           'id',         IDS.invoice);
    del('purchase_orders',    'id',         IDS.po);
    del('customers',          'id',         IDS.customer);
  })();

  console.log('\n✅  Sample data purged. Live data untouched.\n');
  db.close();
  process.exit(0);
}

// ── SEED ───────────────────────────────────────────────────────────────────────
console.log('\n🌱  Seeding one sample entry per module…\n');

// Ensure V001 vendor exists (re-create if wiped by purge-all)
const vendor = db.prepare('SELECT id FROM vendors WHERE id = ?').get('V001');
if (!vendor) {
  db.prepare(`
    INSERT INTO vendors (id, name, gstin, state, address, contact, email, type, created_by)
    VALUES ('V001','M/s. VATSIN GRANITE','33AABCV1234A1Z5','Tamil Nadu',
            'Survey No. 42, Hosur Road, Krishnagiri - 635001',
            '9994561230','vatsin.granite@example.com','Quarry','sample-tx')
  `).run();
  console.log('   ✓ Vendor     V001  VATSIN GRANITE (re-created)');
}

// Guard against double-seed
if (db.prepare('SELECT 1 FROM customers WHERE id = ?').get(IDS.customer)) {
  console.log('⚠️  Sample data already exists. Run with --purge first.\n');
  db.close();
  process.exit(0);
}

// Auto next IDs
function nextProductId() {
  const row = db.prepare(`SELECT id FROM products WHERE id LIKE 'PRD-%' ORDER BY id DESC LIMIT 1`).get();
  const seq  = row ? parseInt(row.id.slice(4), 10) + 1 : 1;
  return 'PRD-' + String(seq).padStart(6, '0');
}
function nextJobId() {
  const row = db.prepare(`SELECT id FROM production_jobs WHERE id LIKE 'JOB-%' ORDER BY id DESC LIMIT 1`).get();
  const seq  = row ? parseInt(row.id.slice(4), 10) + 1 : 1;
  return 'JOB-' + String(seq).padStart(6, '0');
}

db.transaction(() => {

  // ════════════════════════════════════════════════════════════
  // SECTION A — PRODUCTION
  // ════════════════════════════════════════════════════════════
  console.log('  ── Production ──');

  // A1. Raw block at Raw Yard  (2440×1220×1220 mm, ≈44.3 CFT)
  const blockId = nextProductId();
  const [BL, BW, BH] = [2.440, 1.220, 1.220];
  const blockCft = +(BL * BW * BH * 35.3147).toFixed(2);
  db.prepare(`
    INSERT INTO products
      (id, kind, variety, hsn, uom, lot_id, current_location_id, rate_paise, stock, active, created_by)
    VALUES (?, 'block', 'Paradiso Classic', '2516', 'cft', 'LOT-001', 'RAW_YARD', 50000, 1, 1, 'sample-tx')
  `).run(blockId);
  db.prepare(`INSERT INTO product_blocks (product_id, length_m, width_m, height_m, cft) VALUES (?,?,?,?,?)`)
    .run(blockId, BL, BW, BH, blockCft);
  console.log(`   ✓ Block       ${blockId}  Paradiso Classic  ${BL*1000|0}×${BW*1000|0}×${BH*1000|0} mm  (${blockCft} CFT)  @ Raw Yard`);

  // A2. Cut job → 15 slabs → Gangsaw Out
  const jobId  = nextJobId();
  const slabId = nextProductId();
  const SQFT = 44.78, RATE_PS = 42000, SLABS = 15;

  db.prepare(`
    INSERT INTO production_jobs
      (id, lot_id, stage, status, date, labour_paise, power_paise, consumables_paise, created_by)
    VALUES (?, 'LOT-001', 'cut', 'Complete', ?, 150000, 50000, 0, 'sample-tx')
  `).run(jobId, daysAgo(10));
  db.prepare(`UPDATE products SET stock = stock - 1 WHERE id = ?`).run(blockId);
  db.prepare(`INSERT INTO production_job_inputs (job_id, product_id, qty_consumed, unit_cost_paise) VALUES (?,?,1,50000)`)
    .run(jobId, blockId);
  db.prepare(`
    INSERT INTO products
      (id, kind, variety, hsn, uom, grade, lot_id, current_location_id,
       rate_paise, stock, source_job_id, source_product_id, active, created_by)
    VALUES (?, 'slab', 'Paradiso Classic', '2516', 'sqft', 'A', 'LOT-001', 'GANGSAW_OUT',
            ?, ?, ?, ?, 1, 'sample-tx')
  `).run(slabId, RATE_PS, SLABS, jobId, blockId);
  db.prepare(`INSERT INTO product_slabs (product_id, size_lw, thickness_mm, sqft) VALUES (?, '2600×1600', 20, ?)`)
    .run(slabId, SQFT);
  db.prepare(`INSERT INTO production_job_outputs (job_id, product_id, qty_produced, unit_cost_paise) VALUES (?,?,?,0)`)
    .run(jobId, slabId, SLABS);
  console.log(`   ✓ Cut Job     ${jobId}  1 block → ${SLABS} slabs @ Gangsaw Out`);

  // ════════════════════════════════════════════════════════════
  // SECTION B — SALES  (PO · Invoice · Payment · PDC)
  // ════════════════════════════════════════════════════════════
  console.log('\n  ── Sales ──');

  // B1. Customer
  db.prepare(`
    INSERT INTO customers (id, name, gstin, state, address, contact, email, credit_days, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(IDS.customer, 'Rajan Tiles & Marbles', '33AABCR1234A1Z5',
         'Tamil Nadu', '12 Gandhi Nagar, Krishnagiri 635001',
         '9876543210', 'rajan.tiles@example.com', 30, 'sample-tx');
  console.log(`   ✓ Customer    ${IDS.customer}  Rajan Tiles & Marbles`);

  // B2. Purchase Order  (4 blocks 200 CFT @ ₹500/CFT)
  const PO_TAXABLE = 200 * 50000;
  const PO_GST     = Math.round(PO_TAXABLE * 0.05);
  const PO_TOTAL   = PO_TAXABLE + 400000 + PO_GST;
  db.prepare(`
    INSERT INTO purchase_orders
      (id, date, vendor_id, variety, blocks, cft, rate_per_cft_paise,
       transport_paise, taxable_paise, gst_paise, total_paise, status, notes, created_by)
    VALUES (?,?,'V001','Paradiso Classic',4,200,50000,400000,?,?,?,'received','Sample PO','sample-tx')
  `).run(IDS.po, daysAgo(25), PO_TAXABLE, PO_GST, PO_TOTAL);
  console.log(`   ✓ PO          ${IDS.po}  200 CFT @ ₹500  Total ₹${(PO_TOTAL/100).toLocaleString('en-IN')}`);

  // B3. Slab product for invoice (Finished Yard)
  const invProd = nextProductId();
  db.prepare(`
    INSERT INTO products
      (id, kind, variety, hsn, uom, grade, lot_id, current_location_id, rate_paise, stock, active, created_by)
    VALUES (?, 'slab', 'Paradiso Classic', '2516', 'sqft', 'A', 'LOT-001', 'FINISHED_YARD', ?, 10, 1, 'sample-tx')
  `).run(invProd, RATE_PS);
  db.prepare(`INSERT INTO product_slabs (product_id, size_lw, thickness_mm, sqft) VALUES (?, '2600×1600', 18, ?)`)
    .run(invProd, SQFT);

  // B4. Invoice (3 slabs, TN→TN CGST+SGST 6%+6%)
  const QTY = 3, LINE = Math.round(SQFT * QTY * RATE_PS);
  const CGST = Math.round(LINE * 0.06), SGST = Math.round(LINE * 0.06);
  const INV_TOTAL = LINE + CGST + SGST;
  db.prepare(`
    INSERT INTO invoices
      (id, date, customer_id, customer_name, customer_state, customer_gstin,
       gross_paise, discount_paise, taxable_paise,
       cgst_paise, sgst_paise, igst_paise, total_paise,
       paid, due_date, notes, created_by)
    VALUES (?,?,?,'Rajan Tiles & Marbles','Tamil Nadu','33AABCR1234A1Z5',
            ?,0,?,?,?,0,?,0,?,'Sample invoice','sample-tx')
  `).run(IDS.invoice, daysAgo(20), IDS.customer, LINE, LINE, CGST, SGST, INV_TOTAL, daysAhead(10));
  db.prepare(`
    INSERT INTO invoice_items
      (invoice_id, line_no, product_id, product_kind, variety, hsn, uom,
       uom_qty, qty, rate_paise, line_total_paise, dimension_snapshot, grade)
    VALUES (?,1,?,'slab','Paradiso Classic','2516','sqft',?,?,?,?,?,'A')
  `).run(IDS.invoice, invProd, SQFT, QTY, RATE_PS, LINE,
         JSON.stringify({ size: '2600×1600', thickness_mm: 18 }));
  console.log(`   ✓ Invoice     ${IDS.invoice}  3 slabs  Total ₹${(INV_TOTAL/100).toLocaleString('en-IN')}`);

  // B5. Partial payment ₹50,000 NEFT
  const PAY = 5_000_000;
  db.prepare(`
    INSERT INTO payments (id, date, type, invoice_id, party, amount_paise, mode, utr, notes, created_by)
    VALUES (?,?,'receipt',?,'Rajan Tiles & Marbles',?,'NEFT','SBIN0SAMPLE001','Part payment','sample-tx')
  `).run(IDS.rcpt, daysAgo(5), IDS.invoice, PAY);
  console.log(`   ✓ Payment     ${IDS.rcpt}  ₹50,000 NEFT`);

  // B6. PDC for balance
  const PDC = INV_TOTAL - PAY;
  db.prepare(`
    INSERT INTO post_dated_cheques
      (id, type, cheque_no, bank_name, branch, amount_paise, cheque_date,
       customer_id, invoice_id, status, notes, created_by)
    VALUES (?,'received','CHQ-SAMPLE-001','Canara Bank','Krishnagiri',
            ?,?,?,?,'pending','Balance cheque','sample-tx')
  `).run(IDS.pdc, PDC, daysAhead(15), IDS.customer, IDS.invoice);
  console.log(`   ✓ PDC         ${IDS.pdc}  ₹${(PDC/100).toLocaleString('en-IN')} due ${daysAhead(15)}`);

  // ════════════════════════════════════════════════════════════
  // SECTION C — HR / PAYROLL
  // ════════════════════════════════════════════════════════════
  console.log('\n  ── HR & Payroll ──');

  // C1. Employees
  db.prepare(`
    INSERT INTO employees
      (id, name, designation, department, joining_date,
       pan, uan, bank_account, bank_ifsc,
       basic_salary_paise, hra_paise, conveyance_paise, other_allowance_paise,
       pf_applicable, esi_applicable, pt_applicable, active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,1,1)
  `).run(IDS.emp1, 'Arun Kumar', 'Production Manager', 'Production',
         '2023-06-01', 'ABCPA1234D', '101234567890',
         '30291234567', 'SBIN0001234',
         2_500_000, 1_000_000, 200_000, 0);
  db.prepare(`
    INSERT INTO employees
      (id, name, designation, department, joining_date,
       pan, uan, esic_no, bank_account, bank_ifsc,
       basic_salary_paise, hra_paise, conveyance_paise, other_allowance_paise,
       pf_applicable, esi_applicable, pt_applicable, active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,1)
  `).run(IDS.emp2, 'Ravi Kumar', 'Machine Operator', 'Production',
         '2024-01-10', 'BCDPB5678E', '201234567890', 'ESI-SAMPLE-001',
         '30297654321', 'SBIN0001234',
         1_200_000, 400_000, 0, 0);
  console.log(`   ✓ Employee    ${IDS.emp1}  Arun Kumar  (Manager, Basic ₹25,000)`);
  console.log(`   ✓ Employee    ${IDS.emp2}  Ravi Kumar  (Operator, Basic ₹12,000)`);

  // Leave balances (current calendar year)
  const yr = new Date().getFullYear();
  for (const [empId, elDays, clDays] of [[IDS.emp1, 15, 8], [IDS.emp2, 12, 6]]) {
    for (const [code, quota] of [['EL', elDays], ['CL', clDays]]) {
      db.prepare(`
        INSERT INTO leave_balances
          (employee_id, leave_code, year, opening, accrued, taken, encashed)
        VALUES (?,?,?,0,?,0,0)
      `).run(empId, code, yr, quota);
    }
  }
  // Leave application (Ravi took 2 EL days)
  db.prepare(`
    INSERT INTO leave_applications
      (employee_id, leave_code, from_date, to_date, days,
       reason, status, approved_by, approved_at)
    VALUES (?,'EL',?,?,2,'Personal work','approved','admin',datetime('now','-5 days'))
  `).run(IDS.emp2, daysAgo(15), daysAgo(14));
  db.prepare(`UPDATE leave_balances SET taken = taken + 2 WHERE employee_id=? AND leave_code='EL' AND year=?`)
    .run(IDS.emp2, yr);
  console.log(`   ✓ Leave       ${IDS.emp2} — 2 EL days approved`);

  // C2. Payroll Run for SAMPLE_MONTH
  // Emp1: gross ₹37,000  PF ₹3,000  PT ₹200  Net ₹33,800
  const G1 = 3_700_000, PF1E = 300_000, PF1R = 300_000, PT1 = 20_000;
  const D1 = PF1E + PT1, N1 = G1 - D1;
  // Emp2: gross ₹16,000  PF ₹1,440  ESI ₹120+₹520  PT ₹150  Net ₹14,290
  const G2 = 1_600_000, PF2E = 144_000, PF2R = 144_000;
  const ESI2E = 12_000, ESI2R = 52_000, PT2 = 15_000;
  const D2 = PF2E + ESI2E + PT2, N2 = G2 - D2;

  db.prepare(`
    INSERT INTO payroll_runs
      (id, month, status, total_gross_paise,
       total_pf_employee_paise, total_pf_employer_paise,
       total_esi_employee_paise, total_esi_employer_paise,
       total_pt_paise, total_net_paise)
    VALUES (?,?,'processed',?,?,?,?,?,?,?)
  `).run(IDS.payrun, SAMPLE_MONTH,
         G1+G2, PF1E+PF2E, PF1R+PF2R, ESI2E, ESI2R, PT1+PT2, N1+N2);
  db.prepare(`
    INSERT INTO payroll_entries
      (run_id, employee_id, days_worked,
       basic_paise, hra_paise, conveyance_paise, other_allowance_paise, gross_paise,
       pf_employee_paise, pf_employer_paise, pt_paise, total_deductions_paise, net_paise, paid)
    VALUES (?,?,26,?,?,?,?,?,?,?,?,?,?,1)
  `).run(IDS.payrun, IDS.emp1,
         2_500_000, 1_000_000, 200_000, 0, G1, PF1E, PF1R, PT1, D1, N1);
  db.prepare(`
    INSERT INTO payroll_entries
      (run_id, employee_id, days_worked,
       basic_paise, hra_paise, conveyance_paise, other_allowance_paise, gross_paise,
       pf_employee_paise, pf_employer_paise,
       esi_employee_paise, esi_employer_paise,
       pt_paise, total_deductions_paise, net_paise, paid)
    VALUES (?,?,26,?,?,?,?,?,?,?,?,?,?,?,?,1)
  `).run(IDS.payrun, IDS.emp2,
         1_200_000, 400_000, 0, 0, G2, PF2E, PF2R, ESI2E, ESI2R, PT2, D2, N2);
  console.log(`   ✓ Payroll     ${IDS.payrun}  ${SAMPLE_MONTH}  Gross ₹${((G1+G2)/100).toLocaleString('en-IN')}  Net ₹${((N1+N2)/100).toLocaleString('en-IN')}`);

  // C3. EPF Challan
  const WAGES_PF = 2_500_000 + 1_200_000;
  const EMP_PF   = PF1E + PF2E;
  const EPS      = Math.round(WAGES_PF * 0.0833);
  const EPF_ER   = Math.round(WAGES_PF * 0.0367);
  const EDLI     = Math.round(WAGES_PF * 0.005);
  const ADMIN    = Math.round(WAGES_PF * 0.005);
  const EPF_TOTAL = EMP_PF + EPS + EPF_ER + EDLI + ADMIN;
  db.prepare(`
    INSERT INTO epf_challans
      (month, trrn, challan_date,
       total_wages_paise, employee_pf_paise,
       employer_epf_paise, eps_paise, edli_paise, admin_charge_paise,
       total_paise, status)
    VALUES (?,'TRRN-SAMPLE-001',?,?,?,?,?,?,?,?,'paid')
  `).run(SAMPLE_MONTH, daysAgo(5),
         WAGES_PF, EMP_PF, EPF_ER, EPS, EDLI, ADMIN, EPF_TOTAL);
  console.log(`   ✓ EPF Challan ${SAMPLE_MONTH}  Employee PF ₹${(EMP_PF/100).toLocaleString('en-IN')}  Total ₹${(EPF_TOTAL/100).toLocaleString('en-IN')}`);

  // C4. ESI Challan
  const ESI_TOTAL = ESI2E + ESI2R;
  db.prepare(`
    INSERT INTO esi_challans
      (month, challan_no, challan_date,
       total_wages_paise, employee_esi_paise, employer_esi_paise,
       total_paise, status)
    VALUES (?,'ESI-SAMPLE-001',?,?,?,?,?,'paid')
  `).run(SAMPLE_MONTH, daysAgo(5), G2, ESI2E, ESI2R, ESI_TOTAL);
  console.log(`   ✓ ESI Challan ${SAMPLE_MONTH}  Total ₹${(ESI_TOTAL/100).toLocaleString('en-IN')}`);

  // C5. PT Challan (Tamil Nadu)
  db.prepare(`
    INSERT INTO pt_challans_tn
      (month, challan_no, challan_date, employee_count, total_pt_paise, status)
    VALUES (?,'PT-SAMPLE-001',?,2,?,'paid')
  `).run(SAMPLE_MONTH, daysAgo(5), PT1+PT2);
  console.log(`   ✓ PT Challan  ${SAMPLE_MONTH}  ₹${((PT1+PT2)/100).toLocaleString('en-IN')}`);

  // C6. Bonus Run (FY 2025-26)
  const BONUS_RATE = 8.33;
  const B1 = Math.round(2_500_000 * 12 * BONUS_RATE / 100);
  const B2 = Math.round(1_200_000 * 12 * BONUS_RATE / 100);
  const bonusRun = db.prepare(`
    INSERT INTO bonus_runs
      (fy, bonus_rate_pct, calc_basis, status, total_paise, notes, created_by)
    VALUES ('2025-26', 8.33, 'basic', 'processed', ?, 'Sample bonus run FY 2025-26', 'sample-tx')
    RETURNING id
  `).get(B1+B2);
  const bonusRunId = bonusRun.id;
  for (const [empId, monthlyBasic, bonus] of [
    [IDS.emp1, 2_500_000, B1],
    [IDS.emp2, 1_200_000, B2],
  ]) {
    db.prepare(`
      INSERT INTO bonus_entries
        (run_id, employee_id, monthly_basic, annual_basic, months_worked, bonus_paise, eligible, paid)
      VALUES (?,?,?,?,12,?,1,1)
    `).run(bonusRunId, empId, monthlyBasic, monthlyBasic * 12, bonus);
  }
  console.log(`   ✓ Bonus Run   FY 2025-26  8.33%  Total ₹${((B1+B2)/100).toLocaleString('en-IN')}`);

  // ════════════════════════════════════════════════════════════
  // SECTION D — FIXED ASSETS
  // ════════════════════════════════════════════════════════════
  console.log('\n  ── Fixed Assets ──');
  db.prepare(`
    INSERT INTO fixed_assets
      (id, name, category, it_block, purchase_date, purchase_cost_paise,
       description, vendor_id, location, serial_no,
       depreciation_method, depreciation_rate_pct, account_id, disposed)
    VALUES (?,?,'Plant & Machinery','Plant & Machinery',
            ?,150000000,
            'Multi-wire gangsaw for cutting granite blocks',
            'V001','Production Floor','GS-2024-001',
            'WDV',15.0,'ACC-PLANT',0)
  `).run(IDS.asset, 'Multi-Wire Gangsaw Machine', daysAgo(365));
  console.log(`   ✓ Fixed Asset ${IDS.asset}  Gangsaw Machine  ₹15,00,000  WDV 15%`);

  // ════════════════════════════════════════════════════════════
  // SECTION E — BANK
  // ════════════════════════════════════════════════════════════
  console.log('\n  ── Bank ──');
  const fyStart = `${new Date().getFullYear()}-04-01`;
  db.prepare(`
    INSERT INTO bank_accounts_reg
      (id, name, account_no, ifsc, bank_name, branch,
       opening_balance_paise, opening_date, account_id, active)
    VALUES (?,'SBI Current A/c – Production',
            '30291234567','SBIN0001234','State Bank of India','Krishnagiri',
            500000000,?,  'ACC-BANK1',1)
  `).run(IDS.bank, fyStart);
  // Credit: NEFT from customer
  db.prepare(`
    INSERT INTO bank_statement_lines
      (bank_account_id, txn_date, value_date, description, ref_no,
       credit_paise, running_balance_paise, reconciled)
    VALUES (?,?,?,'NEFT Cr — Rajan Tiles','SBIN0SAMPLE001',5000000,50000000,1)
  `).run(IDS.bank, daysAgo(5), daysAgo(5));
  // Debit: salary payment
  db.prepare(`
    INSERT INTO bank_statement_lines
      (bank_account_id, txn_date, value_date, description, ref_no,
       debit_paise, running_balance_paise, reconciled)
    VALUES (?,?,?,'NEFT Dr — Salary Apr-2026','SAL-APR26',?,?,0)
  `).run(IDS.bank, daysAgo(2), daysAgo(2), N1+N2, 50000000-(N1+N2));
  console.log(`   ✓ Bank Acct   ${IDS.bank}  SBI Current + 2 statement lines`);

  // ════════════════════════════════════════════════════════════
  // SECTION F — JOURNAL VOUCHERS
  // ════════════════════════════════════════════════════════════
  console.log('\n  ── Journal Vouchers ──');

  const jv = (jvId, vtype, narration, lines) => {
    db.prepare(`
      INSERT INTO journal_vouchers (id, date, narration, voucher_type, created_by)
      VALUES (?,?,?,?,'sample-tx')
    `).run(jvId, daysAgo(2), narration, vtype);
    for (const [acc, dr, cr] of lines) {
      db.prepare(`
        INSERT INTO journal_entries (voucher_id, account_id, debit_paise, credit_paise)
        VALUES (?,?,?,?)
      `).run(jvId, acc, dr, cr);
    }
  };

  // JV1 — Salary payment (salary payable → bank)
  jv(IDS.jv1, 'payment', `Salary payment ${SAMPLE_MONTH}`, [
    ['ACC-SALP', N1+N2, 0],
    ['ACC-BANK1', 0,    N1+N2],
  ]);
  console.log(`   ✓ JV-001      Payment  Salary ${SAMPLE_MONTH}  ₹${((N1+N2)/100).toLocaleString('en-IN')}`);

  // JV2 — Customer receipt (bank ← debtors)
  jv(IDS.jv2, 'receipt', 'NEFT receipt — Rajan Tiles SAMPLE-INV-001', [
    ['ACC-BANK1', PAY, 0],
    ['ACC-DEB',   0,   PAY],
  ]);
  console.log(`   ✓ JV-002      Receipt  Customer NEFT  ₹${(PAY/100).toLocaleString('en-IN')}`);

  // JV3 — Employer PF provision
  jv(IDS.jv3, 'journal', `PF employer provision ${SAMPLE_MONTH}`, [
    ['ACC-PFEX', PF1R+PF2R, 0],
    ['ACC-PFP',  0,          PF1R+PF2R],
  ]);
  console.log(`   ✓ JV-003      Journal  PF provision  ₹${((PF1R+PF2R)/100).toLocaleString('en-IN')}`);

  // ════════════════════════════════════════════════════════════
  // SECTION I — CONSUMABLE PURCHASES
  // ════════════════════════════════════════════════════════════
  console.log('\n  ── Consumables ──');

  const cpItems = [
    { description: 'Diamond Gangsaw Wire Rope (50m)', qty: 2, unit: 'roll', rate_paise: 800000, amount_paise: 1600000 },
    { description: 'Diamond Segment Blade 600mm',     qty: 4, unit: 'pcs',  rate_paise: 350000, amount_paise: 1400000 },
    { description: 'Epoxy Colour (5kg tin)',           qty: 3, unit: 'tin',  rate_paise: 120000, amount_paise:  360000 },
  ];
  const cpTotal = cpItems.reduce((s, i) => s + i.amount_paise, 0);
  db.prepare(`
    INSERT INTO consumable_purchases
      (id, date, vendor_name, category, items, total_paise,
       payment_mode, reference_no, notes, status, created_by)
    VALUES (?,?,'Diamond Tools India','Blades & Segments',?,?,
            'NEFT','SBIN0CPSMPL01',
            'Quarterly consumable restock','paid','sample-tx')
  `).run(IDS.cp, daysAgo(7), JSON.stringify(cpItems), cpTotal);
  console.log(`   ✓ Consumables ${IDS.cp}  3 items  Total ₹${(cpTotal/100).toLocaleString('en-IN')}  (paid)`);

  // ════════════════════════════════════════════════════════════
  // SECTION J — BUDGET TARGETS
  // ════════════════════════════════════════════════════════════
  console.log('\n  ── Budget Targets ──');

  const budgetTargets = [
    { category: 'Revenue',      amount_paise: 50_000_000 },  // ₹5,00,000
    { category: 'Raw Material', amount_paise: 30_000_000 },  // ₹3,00,000
    { category: 'Consumables',  amount_paise:  5_000_000 },  // ₹50,000
    { category: 'Payroll',      amount_paise:  5_300_000 },  // ₹53,000
    { category: 'Transport',    amount_paise:  2_000_000 },  // ₹20,000
  ];
  const btStmt = db.prepare(`
    INSERT OR IGNORE INTO budget_targets (fy, month, category, amount_paise, notes, created_by)
    VALUES (?,?,?,?,?,?)
  `);
  for (const bt of budgetTargets) {
    btStmt.run(SAMPLE_FY, SAMPLE_MONTH, bt.category, bt.amount_paise, 'Sample budget', 'sample-tx');
    console.log(`   ✓ Budget      ${SAMPLE_MONTH}  ${bt.category.padEnd(14)} ₹${(bt.amount_paise/100).toLocaleString('en-IN')}`);
  }

  // ════════════════════════════════════════════════════════════
  // SECTION G — TDS
  // ════════════════════════════════════════════════════════════
  console.log('\n  ── TDS ──');
  const TDS_GROSS = 10_000_000;   // ₹1,00,000 contractor payment
  const TDS_AMT   = Math.round(TDS_GROSS * 0.02);  // 2% under 194C
  db.prepare(`
    INSERT INTO tds_transactions
      (id, vendor_id, po_id, section,
       payment_date, gross_amount_paise, tds_rate_pct, tds_amount_paise,
       deposited, fy, quarter, notes, created_by)
    VALUES (?,'V001',?,'194C',?,?,2.0,?,1,?,?,'TDS on contractor payment — VATSIN GRANITE','sample-tx')
  `).run(IDS.tds_tx, IDS.po, daysAgo(20), TDS_GROSS, TDS_AMT, SAMPLE_FY, SAMPLE_QUARTER);
  db.prepare(`
    INSERT INTO tds_challans
      (id, challan_date, bsr_code, challan_serial_no, section, amount_paise, fy, quarter)
    VALUES (?,?,'0002560','CHL-SAMPLE-001','194C',?,?,?)
  `).run(IDS.tds_ch, daysAgo(15), TDS_AMT, SAMPLE_FY, SAMPLE_QUARTER);
  console.log(`   ✓ TDS         ${IDS.tds_tx}  194C  ₹${(TDS_GROSS/100).toLocaleString('en-IN')} → TDS ₹${(TDS_AMT/100).toLocaleString('en-IN')}`);
  console.log(`   ✓ TDS Challan ${IDS.tds_ch}  Deposited ₹${(TDS_AMT/100).toLocaleString('en-IN')}`);

  // ════════════════════════════════════════════════════════════
  // SECTION H — GST COMPLIANCE
  // ════════════════════════════════════════════════════════════
  console.log('\n  ── GST Compliance ──');
  const gstPeriods = [
    ['2026-27', 'Apr-2026', 'GSTR1',  '2026-05-11', daysAgo(12), 'filed'],
    ['2026-27', 'Apr-2026', 'GSTR3B', '2026-05-20', daysAgo(2),  'filed'],
    ['2026-27', 'May-2026', 'GSTR1',  '2026-06-11', null,        'pending'],
    ['2026-27', 'May-2026', 'GSTR3B', '2026-06-20', null,        'pending'],
  ];
  for (const [fy, period, rtype, due, filed, status] of gstPeriods) {
    db.prepare(`
      INSERT OR IGNORE INTO gst_filing_periods
        (fy, period, return_type, due_date, filed_date, filed_by, status)
      VALUES (?,?,?,?,?,?,?)
    `).run(fy, period, rtype, due, filed, filed ? 'sample-tx' : null, status);
    const mark = filed ? '✓ filed' : '⏳ pending';
    console.log(`   ${mark}  ${period} ${rtype} (due ${due})`);
  }

})();

db.close();

console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  Sample Data Seeded — All Modules                                    ║
╠══════════════════════════════════════════════════════════════════════╣
║  Production                                                          ║
║    Block + Cut Job          Paradiso Classic @ Raw Yard → Gangsaw    ║
║  Sales                                                               ║
║    Customer SAMPLE-CUST     Rajan Tiles & Marbles                    ║
║    PO       SAMPLE-PO-001   V001 VATSIN GRANITE (received)           ║
║    Invoice  SAMPLE-INV-001  3 slabs CGST+SGST                        ║
║    Payment  SAMPLE-PAY-001  ₹50,000 NEFT                             ║
║    PDC      SAMPLE-PDC-001  Balance cheque                           ║
║  Consumables  CP-2026-0001  Blade + Rope + Epoxy ₹33,600 (paid)      ║
║  Budget Targets (${SAMPLE_MONTH})                                       ║
║    Revenue ₹5L · Raw Mat ₹3L · Consumables ₹50K · Payroll ₹53K      ║
║  HR & Payroll (${SAMPLE_MONTH})                                         ║
║    Employees  Arun Kumar (Manager) · Ravi Kumar (Operator)           ║
║    Payroll + EPF + ESI + PT challans + Bonus (FY 2025-26)            ║
║  Fixed Assets  SAMPLE-ASSET-001  Multi-Wire Gangsaw  ₹15,00,000      ║
║  Bank          SAMPLE-BANK-001   SBI Current + 2 statement lines     ║
║  Journals      JV-001 Salary · JV-002 Receipt · JV-003 PF           ║
║  TDS           194C  ₹1,00,000 gross → ₹2,000 TDS + challan         ║
║  GST           Apr+May 2026 GSTR1 & GSTR3B filing periods           ║
╠══════════════════════════════════════════════════════════════════════╣
║  npm run sample:purge     remove SAMPLE-* records only               ║
║  npm run sample:purgeall  wipe ALL transactional data                ║
╚══════════════════════════════════════════════════════════════════════╝
`);
