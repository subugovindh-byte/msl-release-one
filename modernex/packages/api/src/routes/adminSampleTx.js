/**
 * Admin-only endpoints to seed / purge sample transaction data on the live DB.
 * Every route requires role = admin. All operations are wrapped in a transaction.
 *
 * POST /api/admin/sample-tx          — seed one sample entry per module
 * POST /api/admin/sample-tx/purge    — remove SAMPLE-* rows only (safe)
 * POST /api/admin/sample-tx/purgeall — wipe ALL transactional data (destructive)
 */

import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const adminSampleTxRouter = Router();
adminSampleTxRouter.use(authenticate, requireRole('admin'));

// ── helpers ──────────────────────────────────────────────────────────────────
const daysAgo   = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); };
const daysAhead = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };

const SAMPLE_MONTH   = '2026-04';
const SAMPLE_FY      = '2026-27';
const SAMPLE_QUARTER = 'Q1';

const IDS = {
  customer : 'SAMPLE-CUST',
  po       : 'SAMPLE-PO-001',
  invoice  : 'SAMPLE-INV-001',
  rcpt     : 'SAMPLE-PAY-001',
  pdc      : 'SAMPLE-PDC-001',
  cp       : 'CP-2026-0001',
  emp1     : 'SAMPLE-EMP-001',
  emp2     : 'SAMPLE-EMP-002',
  payrun   : 'SAMPLE-PAYRUN-001',
  asset    : 'SAMPLE-ASSET-001',
  bank     : 'SAMPLE-BANK-001',
  jv1      : 'SAMPLE-JV-001',
  jv2      : 'SAMPLE-JV-002',
  jv3      : 'SAMPLE-JV-003',
  tds_tx   : 'SAMPLE-TDS-001',
  tds_ch   : 'SAMPLE-TDSCHAL-001',
};

// ── POST /api/admin/sample-tx/purge ──────────────────────────────────────────
adminSampleTxRouter.post('/purge', (req, res, next) => {
  try {
    const db = getDb();
    const removed = [];

    db.transaction(() => {
      const del = (table, col, val) => {
        const n = db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(val).changes;
        if (n) removed.push(`${table} (${n})`);
      };
      const delLike = (table, col, pat) => {
        const n = db.prepare(`DELETE FROM ${table} WHERE ${col} LIKE ?`).run(pat).changes;
        if (n) removed.push(`${table} (${n})`);
      };

      // Consumables / Budgets
      del('consumable_purchases', 'id', IDS.cp);
      const btDel = db.prepare(`DELETE FROM budget_targets WHERE created_by = 'sample-tx'`).run().changes;
      if (btDel) removed.push(`budget_targets (${btDel})`);

      // Compliance
      del('tds_challans',     'id', IDS.tds_ch);
      del('tds_transactions', 'id', IDS.tds_tx);
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

    res.json({ ok: true, action: 'purge', removed });
  } catch (err) { next(err); }
});

// ── POST /api/admin/sample-tx/purgeall ───────────────────────────────────────
adminSampleTxRouter.post('/purgeall', (req, res, next) => {
  try {
    const db = getDb();
    const removed = [];

    db.pragma('foreign_keys = OFF');

    const clear = (table) => {
      try {
        const n = db.prepare(`DELETE FROM ${table}`).run().changes;
        if (n) removed.push(`${table} (${n})`);
      } catch { /* table may not exist */ }
    };

    db.transaction(() => {
      clear('production_job_outputs'); clear('production_job_inputs');
      clear('production_jobs'); clear('production_jobs_legacy'); clear('inventory_moves');
      clear('product_blocks'); clear('product_slabs'); clear('product_tiles');
      clear('product_cts'); clear('product_strips'); clear('product_kerbs');
      clear('product_cobbles'); clear('product_chips'); clear('product_monuments');
      clear('product_monuments_legacy'); clear('product_spec_templates');
      clear('slabs_legacy'); clear('products');
      clear('post_dated_cheques'); clear('payments'); clear('debit_credit_notes');
      clear('delivery_challan_items'); clear('delivery_challans');
      clear('invoice_items'); clear('invoice_items_legacy'); clear('invoices');
      clear('purchase_order_receipts'); clear('purchase_orders');
      clear('customers'); clear('vendors');
      clear('journal_entry_cc'); clear('journal_entries');
      clear('recurring_voucher_lines'); clear('recurring_vouchers'); clear('journal_vouchers');
      clear('tds_transactions'); clear('tds_challans');
      clear('gstr2b_records'); clear('gstr2b_imports'); clear('gst_filing_periods');
      clear('itc_ledger'); clear('interest_calc_log'); clear('msme_interest_log');
      clear('pt_challans_tn'); clear('epf_challans'); clear('esi_challans');
      clear('lwf_contributions'); clear('lwf_challan_batches');
      clear('payroll_entries'); clear('payroll_runs');
      clear('bonus_entries'); clear('bonus_runs'); clear('gratuity_records');
      clear('leave_applications'); clear('leave_balances');
      clear('employee_tax_declarations'); clear('employees');
      clear('asset_depreciation_log'); clear('fixed_assets');
      clear('bank_statement_lines'); clear('bank_statements');
      clear('bank_accounts_reg'); clear('collection_accounts');
      clear('budgets'); clear('budget_targets'); clear('consumable_purchases');
      clear('audit_log'); clear('backups'); clear('refresh_tokens');
    })();

    db.pragma('foreign_keys = ON');

    res.json({ ok: true, action: 'purgeall', removed });
  } catch (err) { next(err); }
});

// ── POST /api/admin/sample-tx ─────────────────────────────────────────────────
adminSampleTxRouter.post('/', (req, res, next) => {
  try {
    const db = getDb();

    // Guard: don't double-seed
    if (db.prepare('SELECT 1 FROM customers WHERE id = ?').get(IDS.customer)) {
      return res.status(409).json({ error: 'Sample data already exists. Run purge first.' });
    }

    // Ensure V001 vendor exists
    if (!db.prepare('SELECT 1 FROM vendors WHERE id = ?').get('V001')) {
      db.prepare(`
        INSERT INTO vendors (id, name, gstin, state, address, contact, email, type, created_by)
        VALUES ('V001','M/s. VATSIN GRANITE','33AABCV1234A1Z5','Tamil Nadu',
                'Survey No. 42, Hosur Road, Krishnagiri - 635001',
                '9994561230','vatsin.granite@example.com','Quarry','sample-tx')
      `).run();
    }

    function nextProductId() {
      const row = db.prepare(`SELECT id FROM products WHERE id LIKE 'PRD-%' ORDER BY id DESC LIMIT 1`).get();
      return 'PRD-' + String(row ? parseInt(row.id.slice(4)) + 1 : 1).padStart(6, '0');
    }
    function nextJobId() {
      const row = db.prepare(`SELECT id FROM production_jobs WHERE id LIKE 'JOB-%' ORDER BY id DESC LIMIT 1`).get();
      return 'JOB-' + String(row ? parseInt(row.id.slice(4)) + 1 : 1).padStart(6, '0');
    }

    const seeded = [];

    db.transaction(() => {
      // ── Production ──
      const blockId = nextProductId();
      const [BL, BW, BH] = [2.440, 1.220, 1.220];
      const blockCft = +(BL * BW * BH * 35.3147).toFixed(2);
      db.prepare(`INSERT INTO products (id,kind,variety,hsn,uom,lot_id,current_location_id,rate_paise,stock,active,created_by)
        VALUES (?,'block','Paradiso Classic','2516','cft','LOT-001','RAW_YARD',50000,1,1,'sample-tx')`).run(blockId);
      db.prepare(`INSERT INTO product_blocks (product_id,length_m,width_m,height_m,cft) VALUES (?,?,?,?,?)`).run(blockId,BL,BW,BH,blockCft);
      seeded.push(`Block ${blockId} (${blockCft} CFT)`);

      const jobId = nextJobId();
      const slabId = nextProductId();
      const SQFT=44.78, RATE_PS=42000, SLABS=15;
      db.prepare(`INSERT INTO production_jobs (id,lot_id,stage,status,date,labour_paise,power_paise,consumables_paise,created_by)
        VALUES (?,'LOT-001','cut','Complete',?,150000,50000,0,'sample-tx')`).run(jobId, daysAgo(10));
      db.prepare(`UPDATE products SET stock=stock-1 WHERE id=?`).run(blockId);
      db.prepare(`INSERT INTO production_job_inputs (job_id,product_id,qty_consumed,unit_cost_paise) VALUES (?,?,1,50000)`).run(jobId,blockId);
      db.prepare(`INSERT INTO products (id,kind,variety,hsn,uom,grade,lot_id,current_location_id,rate_paise,stock,source_job_id,source_product_id,active,created_by)
        VALUES (?,'slab','Paradiso Classic','2516','sqft','A','LOT-001','GANGSAW_OUT',?,?,?,?,1,'sample-tx')`).run(slabId,RATE_PS,SLABS,jobId,blockId);
      db.prepare(`INSERT INTO product_slabs (product_id,size_lw,thickness_mm,sqft) VALUES (?,'2600×1600',20,?)`).run(slabId,SQFT);
      db.prepare(`INSERT INTO production_job_outputs (job_id,product_id,qty_produced,unit_cost_paise) VALUES (?,?,?,0)`).run(jobId,slabId,SLABS);
      seeded.push(`Cut Job ${jobId} → ${SLABS} slabs`);

      // ── Sales ──
      db.prepare(`INSERT INTO customers (id,name,gstin,state,address,contact,email,credit_days,created_by)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(IDS.customer,'Rajan Tiles & Marbles','33AABCR1234A1Z5','Tamil Nadu',
        '12 Gandhi Nagar, Krishnagiri 635001','9876543210','rajan.tiles@example.com',30,'sample-tx');

      const PO_TAXABLE=200*50000, PO_GST=Math.round(200*50000*0.05);
      db.prepare(`INSERT INTO purchase_orders (id,date,vendor_id,variety,blocks,cft,rate_per_cft_paise,transport_paise,taxable_paise,gst_paise,total_paise,status,notes,created_by)
        VALUES (?,?,'V001','Paradiso Classic',4,200,50000,400000,?,?,?,'received','Sample PO','sample-tx')`
      ).run(IDS.po, daysAgo(25), PO_TAXABLE, PO_GST, PO_TAXABLE+400000+PO_GST);

      const invProd=nextProductId();
      db.prepare(`INSERT INTO products (id,kind,variety,hsn,uom,grade,lot_id,current_location_id,rate_paise,stock,active,created_by)
        VALUES (?,'slab','Paradiso Classic','2516','sqft','A','LOT-001','FINISHED_YARD',?,10,1,'sample-tx')`).run(invProd,RATE_PS);
      db.prepare(`INSERT INTO product_slabs (product_id,size_lw,thickness_mm,sqft) VALUES (?,'2600×1600',18,?)`).run(invProd,SQFT);

      const QTY=3, LINE=Math.round(SQFT*QTY*RATE_PS);
      const CGST=Math.round(LINE*0.06), SGST=Math.round(LINE*0.06), INV_TOTAL=LINE+CGST+SGST;
      db.prepare(`INSERT INTO invoices (id,date,customer_id,customer_name,customer_state,customer_gstin,gross_paise,discount_paise,taxable_paise,cgst_paise,sgst_paise,igst_paise,total_paise,paid,due_date,notes,created_by)
        VALUES (?,?,?,'Rajan Tiles & Marbles','Tamil Nadu','33AABCR1234A1Z5',?,0,?,?,?,0,?,0,?,'Sample invoice','sample-tx')`
      ).run(IDS.invoice,daysAgo(20),IDS.customer,LINE,LINE,CGST,SGST,INV_TOTAL,daysAhead(10));
      db.prepare(`INSERT INTO invoice_items (invoice_id,line_no,product_id,product_kind,variety,hsn,uom,uom_qty,qty,rate_paise,line_total_paise,dimension_snapshot,grade)
        VALUES (?,1,?,'slab','Paradiso Classic','2516','sqft',?,?,?,?,?,'A')`
      ).run(IDS.invoice,invProd,SQFT,QTY,RATE_PS,LINE,JSON.stringify({size:'2600×1600',thickness_mm:18}));

      const PAY=5_000_000;
      db.prepare(`INSERT INTO payments (id,date,type,invoice_id,party,amount_paise,mode,utr,notes,created_by)
        VALUES (?,?,'receipt',?,'Rajan Tiles & Marbles',?,'NEFT','SBIN0SAMPLE001','Part payment','sample-tx')`
      ).run(IDS.rcpt,daysAgo(5),IDS.invoice,PAY);
      db.prepare(`INSERT INTO post_dated_cheques (id,type,cheque_no,bank_name,branch,amount_paise,cheque_date,customer_id,invoice_id,status,notes,created_by)
        VALUES (?,'received','CHQ-SAMPLE-001','Canara Bank','Krishnagiri',?,?,?,?,'pending','Balance cheque','sample-tx')`
      ).run(IDS.pdc,INV_TOTAL-PAY,daysAhead(15),IDS.customer,IDS.invoice);
      seeded.push(`Invoice ${IDS.invoice}`, `Payment ${IDS.rcpt}`, `PDC ${IDS.pdc}`);

      // ── Consumables ──
      const cpItems=[
        {description:'Diamond Gangsaw Wire Rope (50m)',qty:2,unit:'roll',rate_paise:800000,amount_paise:1600000},
        {description:'Diamond Segment Blade 600mm',qty:4,unit:'pcs',rate_paise:350000,amount_paise:1400000},
        {description:'Epoxy Colour (5kg tin)',qty:3,unit:'tin',rate_paise:120000,amount_paise:360000},
      ];
      const cpTotal=cpItems.reduce((s,i)=>s+i.amount_paise,0);
      db.prepare(`INSERT INTO consumable_purchases (id,date,vendor_name,category,items,total_paise,payment_mode,reference_no,notes,status,created_by)
        VALUES (?,?,'Diamond Tools India','Blades & Segments',?,?,'NEFT','SBIN0CPSMPL01','Quarterly restock','paid','sample-tx')`
      ).run(IDS.cp,daysAgo(7),JSON.stringify(cpItems),cpTotal);
      seeded.push(`Consumables ${IDS.cp}`);

      // ── Budget Targets ──
      const btStmt=db.prepare(`INSERT OR IGNORE INTO budget_targets (fy,month,category,amount_paise,notes,created_by) VALUES (?,?,?,?,?,?)`);
      for(const [cat,amt] of [['Revenue',50000000],['Raw Material',30000000],['Consumables',5000000],['Payroll',5300000],['Transport',2000000]]) {
        btStmt.run(SAMPLE_FY,SAMPLE_MONTH,cat,amt,'Sample budget','sample-tx');
      }
      seeded.push('Budget Targets (5 categories)');

      // ── HR / Payroll ──
      db.prepare(`INSERT INTO employees (id,name,designation,department,joining_date,pan,uan,bank_account,bank_ifsc,basic_salary_paise,hra_paise,conveyance_paise,other_allowance_paise,pf_applicable,esi_applicable,pt_applicable,active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,1,1)`
      ).run(IDS.emp1,'Arun Kumar','Production Manager','Production','2023-06-01','ABCPA1234D','101234567890','30291234567','SBIN0001234',2500000,1000000,200000,0);
      db.prepare(`INSERT INTO employees (id,name,designation,department,joining_date,pan,uan,esic_no,bank_account,bank_ifsc,basic_salary_paise,hra_paise,conveyance_paise,other_allowance_paise,pf_applicable,esi_applicable,pt_applicable,active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,1)`
      ).run(IDS.emp2,'Ravi Kumar','Machine Operator','Production','2024-01-10','BCDPB5678E','201234567890','ESI-SAMPLE-001','30297654321','SBIN0001234',1200000,400000,0,0);

      const yr=new Date().getFullYear();
      for(const [empId,el,cl] of [[IDS.emp1,15,8],[IDS.emp2,12,6]]) {
        for(const [code,quota] of [['EL',el],['CL',cl]]) {
          db.prepare(`INSERT INTO leave_balances (employee_id,leave_code,year,opening,accrued,taken,encashed) VALUES (?,?,?,0,?,0,0)`).run(empId,code,yr,quota);
        }
      }

      const G1=3700000,PF1E=300000,PF1R=300000,PT1=20000,D1=PF1E+PT1,N1=G1-D1;
      const G2=1600000,PF2E=144000,PF2R=144000,ESI2E=12000,ESI2R=52000,PT2=15000,D2=PF2E+ESI2E+PT2,N2=G2-D2;
      db.prepare(`INSERT INTO payroll_runs (id,month,status,total_gross_paise,total_pf_employee_paise,total_pf_employer_paise,total_esi_employee_paise,total_esi_employer_paise,total_pt_paise,total_net_paise)
        VALUES (?,?,'processed',?,?,?,?,?,?,?)`
      ).run(IDS.payrun,SAMPLE_MONTH,G1+G2,PF1E+PF2E,PF1R+PF2R,ESI2E,ESI2R,PT1+PT2,N1+N2);
      db.prepare(`INSERT INTO payroll_entries (run_id,employee_id,days_worked,basic_paise,hra_paise,conveyance_paise,other_allowance_paise,gross_paise,pf_employee_paise,pf_employer_paise,pt_paise,total_deductions_paise,net_paise,paid)
        VALUES (?,?,26,?,?,?,?,?,?,?,?,?,?,1)`
      ).run(IDS.payrun,IDS.emp1,2500000,1000000,200000,0,G1,PF1E,PF1R,PT1,D1,N1);
      db.prepare(`INSERT INTO payroll_entries (run_id,employee_id,days_worked,basic_paise,hra_paise,conveyance_paise,other_allowance_paise,gross_paise,pf_employee_paise,pf_employer_paise,esi_employee_paise,esi_employer_paise,pt_paise,total_deductions_paise,net_paise,paid)
        VALUES (?,?,26,?,?,?,?,?,?,?,?,?,?,?,?,1)`
      ).run(IDS.payrun,IDS.emp2,1200000,400000,0,0,G2,PF2E,PF2R,ESI2E,ESI2R,PT2,D2,N2);
      seeded.push(`Payroll ${IDS.payrun}`);

      // Statutory challans
      const WAGES_PF=2500000+1200000, EPS=Math.round(WAGES_PF*0.0833), EPF_ER=Math.round(WAGES_PF*0.0367);
      const EDLI=Math.round(WAGES_PF*0.005), ADMIN=Math.round(WAGES_PF*0.005);
      db.prepare(`INSERT INTO epf_challans (month,trrn,challan_date,total_wages_paise,employee_pf_paise,employer_epf_paise,eps_paise,edli_paise,admin_charge_paise,total_paise,status)
        VALUES (?,'TRRN-SAMPLE-001',?,?,?,?,?,?,?,?,'paid')`
      ).run(SAMPLE_MONTH,daysAgo(5),WAGES_PF,PF1E+PF2E,EPF_ER,EPS,EDLI,ADMIN,PF1E+PF2E+EPS+EPF_ER+EDLI+ADMIN);
      db.prepare(`INSERT INTO esi_challans (month,challan_no,challan_date,total_wages_paise,employee_esi_paise,employer_esi_paise,total_paise,status)
        VALUES (?,'ESI-SAMPLE-001',?,?,?,?,?,'paid')`).run(SAMPLE_MONTH,daysAgo(5),G2,ESI2E,ESI2R,ESI2E+ESI2R);
      db.prepare(`INSERT INTO pt_challans_tn (month,challan_no,challan_date,employee_count,total_pt_paise,status)
        VALUES (?,'PT-SAMPLE-001',?,2,?,'paid')`).run(SAMPLE_MONTH,daysAgo(5),PT1+PT2);

      // ── Fixed Assets ──
      db.prepare(`INSERT INTO fixed_assets (id,name,category,it_block,purchase_date,purchase_cost_paise,description,vendor_id,location,serial_no,depreciation_method,depreciation_rate_pct,account_id,disposed)
        VALUES (?,'Multi-Wire Gangsaw Machine','Plant & Machinery','Plant & Machinery',?,150000000,'Multi-wire gangsaw for cutting granite blocks','V001','Production Floor','GS-2024-001','WDV',15.0,'ACC-PLANT',0)`
      ).run(IDS.asset,daysAgo(365));
      seeded.push(`Fixed Asset ${IDS.asset}`);

      // ── Bank ──
      const fyStart=`${new Date().getFullYear()}-04-01`;
      db.prepare(`INSERT INTO bank_accounts_reg (id,name,account_no,ifsc,bank_name,branch,opening_balance_paise,opening_date,account_id,active)
        VALUES (?,'SBI Current A/c – Production','30291234567','SBIN0001234','State Bank of India','Krishnagiri',500000000,?,'ACC-BANK1',1)`
      ).run(IDS.bank,fyStart);
      db.prepare(`INSERT INTO bank_statement_lines (bank_account_id,txn_date,value_date,description,ref_no,credit_paise,running_balance_paise,reconciled)
        VALUES (?,?,?,'NEFT Cr — Rajan Tiles','SBIN0SAMPLE001',5000000,50000000,1)`).run(IDS.bank,daysAgo(5),daysAgo(5));
      db.prepare(`INSERT INTO bank_statement_lines (bank_account_id,txn_date,value_date,description,ref_no,debit_paise,running_balance_paise,reconciled)
        VALUES (?,?,?,'NEFT Dr — Salary Apr-2026','SAL-APR26',?,?,0)`).run(IDS.bank,daysAgo(2),daysAgo(2),N1+N2,50000000-(N1+N2));
      seeded.push(`Bank ${IDS.bank}`);

      // ── Journal Vouchers ──
      const jv=(id,vtype,narration,lines)=>{
        db.prepare(`INSERT INTO journal_vouchers (id,date,narration,voucher_type,created_by) VALUES (?,?,?,?,'sample-tx')`).run(id,daysAgo(2),narration,vtype);
        for(const [acc,dr,cr] of lines) db.prepare(`INSERT INTO journal_entries (voucher_id,account_id,debit_paise,credit_paise) VALUES (?,?,?,?)`).run(id,acc,dr,cr);
      };
      jv(IDS.jv1,'payment',`Salary payment ${SAMPLE_MONTH}`,[['ACC-SALP',N1+N2,0],['ACC-BANK1',0,N1+N2]]);
      jv(IDS.jv2,'receipt','NEFT receipt — Rajan Tiles SAMPLE-INV-001',[['ACC-BANK1',PAY,0],['ACC-DEB',0,PAY]]);
      jv(IDS.jv3,'journal',`PF employer provision ${SAMPLE_MONTH}`,[['ACC-PFEX',PF1R+PF2R,0],['ACC-PFP',0,PF1R+PF2R]]);
      seeded.push('JV-001 JV-002 JV-003');

      // ── TDS ──
      const TDS_GROSS=10000000, TDS_AMT=Math.round(TDS_GROSS*0.02);
      db.prepare(`INSERT INTO tds_transactions (id,vendor_id,po_id,section,payment_date,gross_amount_paise,tds_rate_pct,tds_amount_paise,deposited,fy,quarter,notes,created_by)
        VALUES (?,'V001',?,'194C',?,?,2.0,?,1,?,?,'TDS on contractor payment','sample-tx')`
      ).run(IDS.tds_tx,IDS.po,daysAgo(20),TDS_GROSS,TDS_AMT,SAMPLE_FY,SAMPLE_QUARTER);
      db.prepare(`INSERT INTO tds_challans (id,challan_date,bsr_code,challan_serial_no,section,amount_paise,fy,quarter)
        VALUES (?,?,'0002560','CHL-SAMPLE-001','194C',?,?,?)`).run(IDS.tds_ch,daysAgo(15),TDS_AMT,SAMPLE_FY,SAMPLE_QUARTER);
      seeded.push(`TDS ${IDS.tds_tx}`);

      // ── GST filing periods ──
      for(const [fy,period,rtype,due,filed,status] of [
        ['2026-27','Apr-2026','GSTR1', '2026-05-11',daysAgo(12),'filed'],
        ['2026-27','Apr-2026','GSTR3B','2026-05-20',daysAgo(2), 'filed'],
        ['2026-27','May-2026','GSTR1', '2026-06-11',null,        'pending'],
        ['2026-27','May-2026','GSTR3B','2026-06-20',null,        'pending'],
      ]) {
        db.prepare(`INSERT OR IGNORE INTO gst_filing_periods (fy,period,return_type,due_date,filed_date,filed_by,status) VALUES (?,?,?,?,?,?,?)`
        ).run(fy,period,rtype,due,filed,filed?'sample-tx':null,status);
      }
      seeded.push('GST filing periods (Apr+May 2026)');
    })();

    res.json({ ok: true, action: 'seed', seeded });
  } catch (err) { next(err); }
});
