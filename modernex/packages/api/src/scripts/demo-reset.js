/**
 * demo-reset.js  —  Wipe database and replay a complete end-to-end demo
 *
 * Covers: Company · COA · Vendor (MSME) · Customer · Employee ×2 ·
 *         Purchase Order · Products · Sale Invoice · Payment · PDC ·
 *         Payroll Run · Journal Vouchers · TDS · Fixed Asset · MSME Interest
 *
 * Usage:
 *   node packages/api/src/scripts/demo-reset.js
 *   OR:  npm run demo:reset  (from packages/api)
 *   The API server will restart automatically via --watch after the reset.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { generateIRN, requiresEWayBill } from '@modernex/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.resolve(__dirname, '../../data/modernex.db');

// ── 1. DROP DATABASE ──────────────────────────────────────────────────────────
console.log('\n🗑  Deleting database…');
for (const ext of ['', '-shm', '-wal']) {
  const f = DB_PATH + ext;
  if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('   deleted', path.basename(f)); }
}

// ── 2. RECREATE via migrations ────────────────────────────────────────────────
console.log('\n📦 Running migrations…');
runMigrations();
console.log('   Migrations complete');

// ── 3. OPEN DB ────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Helper: run multiple inserts in one transaction
const tx = (fn) => db.transaction(fn)();

// Today and some relative dates
const D = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

console.log('\n🌱 Seeding demo data…');

// ── 4. USERS (hash passwords first, then insert synchronously) ───────────────
const USERS_RAW = [
  { username: 'admin',    pw: 'admin123',    name: 'Subramani R',   role: 'admin' },
  { username: 'accounts', pw: 'accounts123', name: 'Priya K',       role: 'accounts' },
  { username: 'sales',    pw: 'sales123',    name: 'Rajesh S',      role: 'sales' },
  { username: 'yard',     pw: 'yard123',     name: 'Ganesh M',      role: 'yard' },
];
const USERS = await Promise.all(
  USERS_RAW.map(async u => ({ ...u, hash: await bcrypt.hash(u.pw, 10) }))
);
const insUser = db.prepare('INSERT INTO users (username,password_hash,full_name,role) VALUES (?,?,?,?)');
db.transaction(() => {
  for (const u of USERS) insUser.run(u.username, u.hash, u.name, u.role);
})();
console.log(`   ✓ Users (${USERS.length})`);

// ── 5. COMPANY ────────────────────────────────────────────────────────────────
db.prepare(`
  INSERT OR REPLACE INTO company_details
    (id,name,trade_name,gstin,pan,hsn,address,city,state,pincode,phone,email,fy)
  VALUES (1,'MODERNEX STONES LLP','MODERNEX STONES','33ACGFM7745J1ZW','ACGFM7745J','2516',
          '225, Gandhi Nagar, Nakkalpatti, Modikuppam','Krishnagiri','Tamil Nadu','635203',
          '9876543210','info@modernexstones.com','2025-26')
`).run();
console.log('   ✓ Company');

// ── 6. COA ACCOUNTS ───────────────────────────────────────────────────────────
const accounts = [
  // Cash & Bank
  { id:'ACC-CASH', name:'Cash in Hand',             group:'AG-CASH',  code:'1001', debit:1, opening:  500000 },
  { id:'ACC-BANK', name:'SBI Current A/c ••4521',   group:'AG-BANK',  code:'1002', debit:1, opening: 8500000 },
  // Debtors / Creditors
  { id:'ACC-DEB',  name:'Sundry Debtors',            group:'AG-DEB',   code:'1100', debit:1, opening:       0 },
  { id:'ACC-CRED', name:'Sundry Creditors',          group:'AG-CRED',  code:'2100', debit:0, opening:       0 },
  // Income
  { id:'ACC-SALE', name:'Sales – Granite Slabs',     group:'AG-INC',   code:'4001', debit:0, opening:       0 },
  // Direct expenses
  { id:'ACC-PURCH',name:'Purchase – Granite Blocks', group:'AG-DIREX', code:'5001', debit:1, opening:       0 },
  { id:'ACC-TRAN', name:'Transport Expense',         group:'AG-DIREX', code:'5002', debit:1, opening:       0 },
  // Indirect expenses
  { id:'ACC-SAL',  name:'Salaries & Wages',          group:'AG-INDX',  code:'6001', debit:1, opening:       0 },
  { id:'ACC-RENT', name:'Rent & Rates',              group:'AG-INDX',  code:'6002', debit:1, opening:       0 },
  { id:'ACC-MISC', name:'Miscellaneous Expense',     group:'AG-INDX',  code:'6099', debit:1, opening:       0 },
  // Statutory payables
  { id:'ACC-EPF',  name:'EPF Payable',               group:'AG-CL',    code:'2201', debit:0, opening:       0 },
  { id:'ACC-ESI',  name:'ESI Payable',               group:'AG-CL',    code:'2202', debit:0, opening:       0 },
  { id:'ACC-PT',   name:'Professional Tax Payable',  group:'AG-CL',    code:'2203', debit:0, opening:       0 },
  { id:'ACC-TDS',  name:'TDS Payable',               group:'AG-CL',    code:'2204', debit:0, opening:       0 },
  // GST
  { id:'ACC-CGSTI',name:'CGST Input',                group:'AG-TAXA',  code:'1801', debit:1, opening:       0 },
  { id:'ACC-SGSTI',name:'SGST Input',                group:'AG-TAXA',  code:'1802', debit:1, opening:       0 },
  { id:'ACC-CGSTO',name:'CGST Output',               group:'AG-TAXL',  code:'2301', debit:0, opening:       0 },
  { id:'ACC-SGSTO',name:'SGST Output',               group:'AG-TAXL',  code:'2302', debit:0, opening:       0 },
  { id:'ACC-IGSTI',name:'IGST Input',                group:'AG-TAXA',  code:'1803', debit:1, opening:       0 },
  { id:'ACC-IGSTO',name:'IGST Output',               group:'AG-TAXL',  code:'2303', debit:0, opening:       0 },
  // Capital
  { id:'ACC-CAP',  name:'Partners Capital',          group:'AG-CAP',   code:'3001', debit:0, opening:50000000 },
];
const insAcc = db.prepare(`
  INSERT OR IGNORE INTO accounts (id,name,group_id,code,opening_balance_paise,is_debit_balance,is_system)
  VALUES (?,?,?,?,?,?,0)
`);
db.transaction(() => { for (const a of accounts) insAcc.run(a.id,a.name,a.group,a.code,a.opening,a.debit); })();
console.log(`   ✓ COA Accounts (${accounts.length})`);

// ── 7. VENDORS ────────────────────────────────────────────────────────────────
db.prepare(`
  INSERT INTO vendors (id,name,gstin,state,type,msme,msme_number,
                       contact,contact_person,address,pincode,email)
  VALUES
    ('V001','M/s. VATSIN GRANITE',NULL,'Tamil Nadu','Quarry',1,'TN-MSME-2023-0041',
     '9944556677','Thiru. Arun Kaliappagounder','S.No.224/2B2, Chendarapalli Village, Anchoor post, Bargur Taluk, KRISHNAGIRI - 635203','635203','vatsingranite@gmail.com'),
    ('V002','Krishna Transports',NULL,'Tamil Nadu','Transporter',0,NULL,
     '9988776655','Krishna Pillai','Old Bus Stand, Krishnagiri','635001',NULL)
`).run();
console.log('   ✓ Vendors (2, V001=MSME)');

// ── 8. CUSTOMERS ─────────────────────────────────────────────────────────────
db.prepare(`
  INSERT INTO customers (id,name,gstin,state,credit_days,outstanding_paise)
  VALUES
    ('C001','Rajan Tiles & Marbles','33AABCR1234A1Z5','Tamil Nadu',30,0),
    ('C002','Prasad Interiors','29AABCP3456D4Z2','Karnataka',15,0),
    ('C005','Walk-in Customer',NULL,'Tamil Nadu',0,0)
`).run();
console.log('   ✓ Customers (3)');

// ── 9. PRODUCTS (inventory) ───────────────────────────────────────────────────
db.prepare(`
  INSERT INTO products (id,kind,variety,hsn,uom,grade,lot_id,rate_paise,stock,active,created_by)
  VALUES
    ('PRD-001','slab','Paradiso Classic','2516','sqft','A', 'LOT-024', 42000,12,1,'seed'),
    ('PRD-002','slab','Tan Brown',       '2516','sqft','A', 'LOT-026', 49000, 8,1,'seed'),
    ('PRD-003','slab','Black Galaxy',    '2516','sqft','A+','LOT-027', 76000, 5,1,'seed'),
    ('PRD-004','slab','Multicolour Red', '2516','sqft','B', 'LOT-022', 29000,15,1,'seed')
`).run();
db.prepare(`
  INSERT INTO product_slabs (product_id,size_lw,thickness_mm,sqft) VALUES
    ('PRD-001','2600×1600',18,44.78),
    ('PRD-002','2500×1500',20,40.28),
    ('PRD-003','2600×1600',18,44.78),
    ('PRD-004','2000×1200',18,26.91)
`).run();
console.log('   ✓ Products (4 slabs in stock)');

// ── 10. PURCHASE ORDER (MSME vendor, 60 days old → OVERDUE) ───────────────────
// Taxable = 250 CFT × ₹500 = ₹1,25,000; GST 5% = ₹6,250; Transport ₹5,000
const PO_ID    = 'PO-2025-001';
const PO_DATE  = D(-60);  // 60 days ago → triggers MSME overdue interest
db.prepare(`
  INSERT INTO purchase_orders
    (id,date,vendor_id,variety,blocks,cft,rate_per_cft_paise,transport_paise,
     taxable_paise,gst_paise,total_paise,status,notes)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
`).run(
  PO_ID, PO_DATE, 'V001','Paradiso Classic',5,250,
  50000,              // ₹500/CFT in paise
  500000,             // transport ₹5,000
  12500000,           // taxable ₹1,25,000
  625000,             // GST 5% ₹6,250
  13625000,           // total ₹1,36,250
  'received',         // GRN done
  'Demo: 5 blocks Paradiso Classic — MSME vendor (overdue 60 days)'
);
console.log('   ✓ Purchase Order PO-2025-001 (MSME, 60d overdue)');

// ── 11. SALE INVOICE (TN customer → CGST+SGST) ───────────────────────────────
// 3 slabs × 44.78 sqft @ ₹480 = ₹64,483.20; GST 12% = ₹7,737.98; Total ₹72,221
const INV_ID   = 'INV-2025-001';
const INV_DATE = D(-15);
const SQFT     = 44.78;
const QTY      = 3;
const RATE     = 48000;  // ₹480/sqft in paise
const LINE     = Math.round(SQFT * QTY * RATE); // 6431040
const CGST     = Math.round(LINE * 0.06);
const SGST     = Math.round(LINE * 0.06);
const TOTAL    = LINE + CGST + SGST;

db.prepare(`
  INSERT INTO invoices
    (id,date,customer_id,customer_name,customer_state,customer_gstin,
     gross_paise,discount_paise,taxable_paise,cgst_paise,sgst_paise,igst_paise,total_paise,
     paid,due_date,notes,created_by)
  VALUES (?,?,?,?,?,?,?,0,?,?,?,0,?,0,?,?,?)
`).run(
  INV_ID, INV_DATE, 'C001','Rajan Tiles & Marbles','Tamil Nadu','33AABCR1234A1Z5',
  LINE, LINE, CGST, SGST, TOTAL,
  D(-15+30), 'Demo: 3 Paradiso Classic slabs', 'admin'
);
db.prepare(`
  INSERT INTO invoice_items
    (invoice_id,line_no,product_id,product_kind,variety,hsn,uom,uom_qty,qty,rate_paise,line_total_paise,dimension_snapshot,grade)
  VALUES (?,1,?,?,?,?,?,?,?,?,?,?,?)
`).run(INV_ID,'PRD-001','slab','Paradiso Classic','2516','sqft',SQFT,QTY,RATE,LINE,
  JSON.stringify({size:'2600×1600',thickness_mm:18}),'A');

// Generate stub IRN + signed QR payload (same logic as irpClient.js stub)
const demoIRN = generateIRN();
const demoStubQR = Buffer.from(JSON.stringify({
  SellerGstin: '33ACGFM7745J1ZW', BuyerGstin: '33AABCR1234A1Z5',
  DocNo: INV_ID, DocTyp: 'INV', DocDt: INV_DATE.split('-').reverse().join('/'),
  TotInvVal: (TOTAL / 100).toFixed(2), Irn: demoIRN, IrnDt: new Date().toISOString(),
  _note: 'STUB — not a real IRP signature',
})).toString('base64');
const demoEWay = requiresEWayBill(TOTAL) ? `EWB${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}0001` : null;
db.prepare('UPDATE invoices SET irn = ?, eway_bill = ?, signed_qr_payload = ? WHERE id = ?')
  .run(demoIRN, demoEWay, demoStubQR, INV_ID);

console.log(`   ✓ Sale Invoice INV-2025-001  ₹${(TOTAL/100).toFixed(0)} (3 slabs, CGST+SGST)`);
console.log(`   ✓ IRN ${demoIRN.slice(0, 12)}… + e-Invoice QR generated`);

// ── 12. PAYMENT (partial NEFT, rest remains outstanding) ─────────────────────
const PAY_AMT = 4000000; // ₹40,000
db.prepare(`
  INSERT INTO payments (id,date,type,invoice_id,party,amount_paise,mode,utr,notes)
  VALUES (?,?,?,?,?,?,?,?,?)
`).run(
  'PMT-2025-001', D(-10), 'receipt', INV_ID,
  'Rajan Tiles & Marbles', PAY_AMT, 'NEFT',
  'SBIN0012345678', 'Part payment against INV-2025-001'
);
console.log(`   ✓ Payment PMT-2025-001  ₹40,000 NEFT received`);

// ── 13. PDC (post-dated cheque for balance) ───────────────────────────────────
const PDC_AMT = TOTAL - PAY_AMT;
db.prepare(`
  INSERT INTO post_dated_cheques
    (id,type,cheque_no,bank_name,branch,amount_paise,cheque_date,
     customer_id,invoice_id,status,notes,created_by)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`).run(
  'PDC-2025-001','received','123456','Canara Bank','Krishnagiri',
  PDC_AMT, D(15),
  'C001', INV_ID, 'pending',
  `Balance cheque for INV-2025-001 (₹${(PDC_AMT/100).toFixed(0)})`,
  'admin'
);
console.log(`   ✓ PDC PDC-2025-001  ₹${(PDC_AMT/100).toFixed(0)} due ${D(15)}`);

// ── 14. EMPLOYEES ─────────────────────────────────────────────────────────────
// Emp1: Murugan S — yard supervisor, EPF+ESI+PT applicable
// Gross ₹19,600 (< ₹21,000 → ESI applicable)
db.prepare(`
  INSERT INTO employees
    (id,name,designation,department,joining_date,pan,uan,esic_no,
     bank_account,bank_ifsc,
     basic_salary_paise,hra_paise,conveyance_paise,other_allowance_paise,
     pf_applicable,esi_applicable,pt_applicable,active)
  VALUES
    ('EMP-001','Murugan S','Yard Supervisor','Operations','2022-04-01',
     'BKDPM5678K','100122345678','5432109876','12345678901','SBIN0001234',
     1200000,480000,160000,120000,  1,1,1,  1),
    ('EMP-002','Lakshmi P','Accounts Executive','Finance','2023-07-01',
     'GXBPL2345M',NULL,NULL,'98765432109','HDFC0009876',
     800000,320000,160000,80000,    1,1,1,  1)
`).run();
console.log('   ✓ Employees (2: EMP-001 Murugan S, EMP-002 Lakshmi P)');

// ── 15. PAYROLL RUN ───────────────────────────────────────────────────────────
// EMP-001: Basic ₹12,000, HRA ₹4,800, Conv ₹1,600, Other ₹1,200 → Gross ₹19,600
//   EPF employee 12% × ₹12,000 = ₹1,440 | ESI 0.75% × ₹19,600 = ₹147 | PT ₹315
//   EPF employer 12% × ₹12,000 = ₹1,440 | ESI employer 3.25% × ₹19,600 = ₹637
//   Net = ₹19,600 - 1,440 - 147 - 315 = ₹17,698
//
// EMP-002: Basic ₹8,000, HRA ₹3,200, Conv ₹1,600, Other ₹800 → Gross ₹13,600
//   EPF employee 12% × ₹8,000 = ₹960 | ESI 0.75% × ₹13,600 = ₹102 | PT ₹135
//   EPF employer 12% × ₹8,000 = ₹960 | ESI employer 3.25% × ₹13,600 = ₹442
//   Net = ₹13,600 - 960 - 102 - 135 = ₹12,403

const PR_MONTH = D(0).slice(0,7); // YYYY-MM
const PR_ID    = `PR-${PR_MONTH}`;

// Emp1 figures (paise)
const e1 = { basic:1200000, hra:480000, conv:160000, other:120000,
  gross:1960000, pfe:144000, pfer:144000, esie:14700, esier:63700, pt:31500,
  net: 1960000-144000-14700-31500 };       // 1769800

// Emp2 figures (paise)
const e2 = { basic:800000, hra:320000, conv:160000, other:80000,
  gross:1360000, pfe:96000, pfer:96000, esie:10200, esier:44200, pt:13500,
  net: 1360000-96000-10200-13500 };         // 1240300

db.prepare(`
  INSERT INTO payroll_runs
    (id,month,status,
     total_gross_paise,total_pf_employee_paise,total_pf_employer_paise,
     total_esi_employee_paise,total_esi_employer_paise,total_pt_paise,total_net_paise)
  VALUES (?,?,?,?,?,?,?,?,?,?)
`).run(
  PR_ID, PR_MONTH, 'paid',
  e1.gross+e2.gross, e1.pfe+e2.pfe, e1.pfer+e2.pfer,
  e1.esie+e2.esie, e1.esier+e2.esier, e1.pt+e2.pt,
  e1.net+e2.net
);
const insPE = db.prepare(`
  INSERT INTO payroll_entries
    (run_id,employee_id,days_worked,
     basic_paise,hra_paise,conveyance_paise,other_allowance_paise,gross_paise,
     pf_employee_paise,pf_employer_paise,esi_employee_paise,esi_employer_paise,
     pt_paise,tds_paise,total_deductions_paise,net_paise,paid)
  VALUES (?,?,26,?,?,?,?,?,?,?,?,?,?,0,?,?,1)
`);
db.transaction(() => {
  insPE.run(PR_ID,'EMP-001',e1.basic,e1.hra,e1.conv,e1.other,e1.gross,
    e1.pfe,e1.pfer,e1.esie,e1.esier,e1.pt,
    e1.pfe+e1.esie+e1.pt, e1.net);
  insPE.run(PR_ID,'EMP-002',e2.basic,e2.hra,e2.conv,e2.other,e2.gross,
    e2.pfe,e2.pfer,e2.esie,e2.esier,e2.pt,
    e2.pfe+e2.esie+e2.pt, e2.net);
})();
console.log(`   ✓ Payroll Run ${PR_ID}  Gross ₹${((e1.gross+e2.gross)/100).toFixed(0)}  Net ₹${((e1.net+e2.net)/100).toFixed(0)}`);

// ── 16. JOURNAL VOUCHERS ──────────────────────────────────────────────────────
const jv = (id, date, narration, type, entries) => {
  db.prepare(`
    INSERT INTO journal_vouchers (id,date,narration,voucher_type,created_by)
    VALUES (?,?,?,?,'admin')
  `).run(id, date, narration, type);
  const insJE = db.prepare(`
    INSERT INTO journal_entries (voucher_id,account_id,debit_paise,credit_paise,narration)
    VALUES (?,?,?,?,?)
  `);
  db.transaction(() => {
    for (const e of entries) insJE.run(id, e.acc, e.dr||0, e.cr||0, e.note||null);
  })();
};

// JV1 — Rent payment by bank (₹15,000)
jv('JV-2025-001', D(-20), 'Office rent paid — May 2025', 'payment', [
  { acc:'ACC-RENT', dr:1500000, note:'Monthly rent' },
  { acc:'ACC-BANK', cr:1500000, note:'SBI transfer to landlord' },
]);

// JV2 — Cash withdrawn from bank for petty cash (₹5,000)
jv('JV-2025-002', D(-18), 'Cash withdrawn for petty cash', 'contra', [
  { acc:'ACC-CASH', dr:500000,  note:'Petty cash top-up' },
  { acc:'ACC-BANK', cr:500000,  note:'Self-cheque withdrawal' },
]);

// JV3 — Opening balance entry: bank credited, capital
jv('JV-2025-000', D(-90), 'Opening balance entry — partners capital', 'journal', [
  { acc:'ACC-BANK', dr:50000000, note:'Opening balance' },
  { acc:'ACC-CAP',  cr:50000000, note:'Partners capital contribution' },
]);

// JV4 — Salary payment by bank
jv('JV-2025-003', D(-1), `Salary disbursed — ${PR_MONTH}`, 'payment', [
  { acc:'ACC-SAL',  dr:e1.net+e2.net,   note:'Net salary' },
  { acc:'ACC-BANK', cr:e1.net+e2.net,   note:'NEFT salary credit' },
]);

// JV5 — EPF remittance
const totalEPF = e1.pfe+e1.pfer+e2.pfe+e2.pfer; // employee + employer both
jv('JV-2025-004', D(-1), `EPF remittance — ${PR_MONTH}`, 'payment', [
  { acc:'ACC-EPF',  dr:totalEPF,   note:'EPF challan' },
  { acc:'ACC-BANK', cr:totalEPF,   note:'EPFO payment' },
]);

console.log('   ✓ Journal Vouchers (5: opening, rent, cash withdrawal, salary, EPF)');

// ── 17. TDS (Sec 194C on transport payment to V002) ───────────────────────────
// Transport payment ₹50,000 → TDS 1% = ₹500
const TDS_GROSS = 5000000;  // ₹50,000
const TDS_AMT   = 50000;    // ₹500
const now = new Date();
const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear()-1;
const FY = `${String(fyStart).slice(-2)}-${String(fyStart+1).slice(-2)}`;
const Q  = now.getMonth() >= 3 && now.getMonth() <= 5 ? 'Q1'
         : now.getMonth() >= 6 && now.getMonth() <= 8 ? 'Q2'
         : now.getMonth() >= 9 && now.getMonth() <= 11 ? 'Q3' : 'Q4';

db.prepare(`
  INSERT INTO tds_transactions
    (id,vendor_id,section,payment_date,gross_amount_paise,tds_rate_pct,
     tds_amount_paise,deposited,fy,quarter,notes,created_by)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`).run(
  'TDS-2025-001','V002','194C', D(-5),
  TDS_GROSS, 1.0, TDS_AMT, 0, FY, Q,
  'Transport charges — Paradiso Classic delivery', 'admin'
);
console.log(`   ✓ TDS TDS-2025-001  Sec 194C  ₹500 on ₹50,000 transport (${FY} ${Q})`);

// ── 18. FIXED ASSET ───────────────────────────────────────────────────────────
db.prepare(`
  INSERT INTO fixed_assets
    (id,name,category,it_block,purchase_date,purchase_cost_paise,
     description,vendor_id,location,serial_no,depreciation_method,depreciation_rate_pct)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`).run(
  'FA-2025-001','Electronic Weighing Machine','Plant & Machinery','Plant & Machinery',
  D(-45), 4500000,
  '5-tonne capacity weighbridge for quarry output measurement',
  'V001','Yard – Gate 1','WB-EX-2025-0041','WDV',15.0
);
console.log('   ✓ Fixed Asset FA-2025-001  Weighing Machine ₹45,000 WDV 15%');

// ── 19. MSME INTEREST LOG (for the 60-day overdue PO) ────────────────────────
// Interest = 27% p.a. on ₹1,36,250 for (60-45)=15 days
const MSME_PRINCIPAL = 13625000;   // ₹1,36,250 in paise
const MSME_OVERDUE_DAYS = 15;      // days beyond 45-day limit
const MSME_RATE = 27;              // 3× RBI rate
const MSME_INT  = Math.round(MSME_PRINCIPAL * (MSME_RATE/100) * (MSME_OVERDUE_DAYS/365));
const MSME_DUE  = D(-60+45);      // due date = PO date + 45 days

db.prepare(`
  INSERT INTO msme_interest_log
    (vendor_id,po_id,invoice_date,due_date,amount_paise,
     overdue_days,interest_rate_pct,interest_paise)
  VALUES (?,?,?,?,?,?,?,?)
`).run('V001', PO_ID, PO_DATE, MSME_DUE, MSME_PRINCIPAL, MSME_OVERDUE_DAYS, MSME_RATE, MSME_INT);
console.log(`   ✓ MSME Interest log  ₹${(MSME_INT/100).toFixed(0)} on PO (${MSME_OVERDUE_DAYS}d overdue @ ${MSME_RATE}% p.a.)`);

// ── 20. LEAVE BALANCES ────────────────────────────────────────────────────────
const leaveTypes = db.prepare('SELECT id,code FROM leave_types').all();
if (leaveTypes.length > 0) {
  const insLB = db.prepare(`
    INSERT OR IGNORE INTO leave_balances (employee_id,leave_code,year,opening,accrued,taken,encashed)
    VALUES (?,?,?,?,0,0,0)
  `);
  const YEAR = new Date().getFullYear();
  db.transaction(() => {
    for (const emp of ['EMP-001','EMP-002']) {
      for (const lt of leaveTypes) {
        const opening = lt.code==='CL'?12 : lt.code==='EL'?15 : lt.code==='SL'?12 : lt.code==='ML'?182 : 12;
        insLB.run(emp, lt.code, YEAR, opening);
      }
    }
  })();
  console.log(`   ✓ Leave balances seeded for 2 employees (${leaveTypes.length} leave types)`);
}

// ── DONE ──────────────────────────────────────────────────────────────────────
db.close();

// Touch server.js so `node --watch` restarts the API process with the new DB
const serverPath = path.resolve(__dirname, '../server.js');
const now2 = new Date();
fs.utimesSync(serverPath, now2, now2);
console.log('   ↺  Touched server.js — API server will restart automatically');

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  MODERNEX STONES LLP — Demo Reset Complete                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Login:  admin / admin123   (accounts / accounts123)            ║
║                                                                  ║
║  Module             What to see                                  ║
║  ───────────────    ────────────────────────────────────────     ║
║  POS                PRD-001..004 in stock, sell to C001          ║
║  Inventory          4 varieties, stock levels                    ║
║  Purchase           PO-2025-001 (MSME, received, 60d old)        ║
║  Accounts           JV-2025-000..004, journal entries            ║
║  Chart of Accounts  20 accounts, Tally-style groups              ║
║  Reports            Trial balance, P&L, Cash Book, AR/AP aging  ║
║  Payroll            PR-${PR_MONTH}, 2 employees, EPF+ESI+PT       ║
║  TDS                TDS-2025-001 Sec 194C ₹500 pending           ║
║  PDC                PDC-2025-001 ₹${(PDC_AMT/100).toFixed(0)} due ${D(15)}              ║
║  Fixed Assets       FA-2025-001 Weighing Machine ₹45,000         ║
║  MSME               PO-2025-001 overdue 15d, interest accrued   ║
╚══════════════════════════════════════════════════════════════════╝
`);
