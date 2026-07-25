import { useState, useMemo, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Row = string[];
interface Section {
  id: string;
  title: string;
  content: ContentBlock[];
}
type ContentBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'h4'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: Row[] }
  | { type: 'code'; text: string }
  | { type: 'warn'; text: string }
  | { type: 'tip'; text: string }
  | { type: 'checklist'; items: string[] };

// ── Content ───────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: 'overview',
    title: '1. System Overview',
    content: [
      { type: 'table', headers: ['Module', 'Purpose', 'Primary Users'], rows: [
        ['POS', 'Walk-in and credit sales invoicing', 'Sales, Admin'],
        ['Inventory', 'Slab stock tracking by variety/grade/lot', 'Yard, Admin'],
        ['Purchase', 'Purchase orders from quarries', 'Admin, Accounts'],
        ['Production', 'Gang-saw / polishing job tracking', 'Yard'],
        ['Accounts', 'Journal vouchers, cash/bank books', 'Accounts'],
        ['Chart of Accounts', 'Ledger, trial balance, P&L', 'Accounts'],
        ['Reports', 'Balance sheet, ratio analysis, cash flow', 'Admin, Accounts'],
        ['Payroll', 'Salary processing, EPF/ESI/PT/LWF', 'Admin, Accounts'],
        ['TDS', 'Tax deduction at source, challans', 'Accounts'],
        ['PDC', 'Post-dated cheque register', 'Accounts'],
        ['Fixed Assets', 'Asset register, depreciation', 'Accounts'],
        ['MSME', '45-day payment tracking, Form I', 'Accounts'],
        ['Compliance', 'GST, GSTR-1/3B/9', 'Accounts'],
        ['Masters', 'Customers, vendors, varieties', 'Admin'],
        ['Roles & Permissions', 'Define roles and per-module access', 'Admin'],
        ['Variety Photos', 'Manage product / variety images', 'Admin, Yard'],
        ['Bank / UPI Accounts', 'Bank & UPI details for invoices and receipts', 'Admin, Accounts'],
      ]},
      { type: 'h3', text: 'User Roles' },
      { type: 'table', headers: ['Role', 'Access'], rows: [
        ['admin', 'Full system access — all modules and settings, incl. user management'],
        ['accounts', 'Invoices, payments, payroll, GST, reports; POS (read)'],
        ['sales', 'POS, invoices, customers, payments (read)'],
        ['yard', 'Inventory, production, slabs, purchase orders (read)'],
      ]},
    ],
  },
  {
    id: 'setup',
    title: '2. First-Time Setup',
    content: [
      { type: 'h3', text: '2.1 Initial Login' },
      { type: 'p', text: 'On first start with an empty database, the system creates a single admin user from the ADMIN_USERNAME and ADMIN_PASSWORD set by the administrator (Azure App Settings). Login is case-sensitive.' },
      { type: 'ul', items: ['Username: as set in ADMIN_USERNAME (e.g. "Admin" — note the capital A)', 'Password: as set in ADMIN_PASSWORD'] },
      { type: 'warn', text: 'Change your password via System → Security → Change Password after first login. Never leave a default/placeholder password in production.' },
      { type: 'h3', text: '2.2 Company Setup (Day 1)' },
      { type: 'p', text: 'Path: System → Company Details' },
      { type: 'ul', items: [
        'Company name, GSTIN, PAN',
        'HSN code (2516 for granite)',
        'Registered address',
        'Bank details for invoice footer',
        'SMTP settings for email delivery (optional)',
      ]},
      { type: 'h3', text: '2.3 Chart of Accounts Setup (Day 1)' },
      { type: 'p', text: 'Path: Chart of Accounts → Accounts — create minimum accounts:' },
      { type: 'table', headers: ['Account', 'Group', 'Use'], rows: [
        ['Cash in Hand', 'Cash-in-Hand', 'Daily petty cash'],
        ['SBI Current A/c', 'Bank Accounts', 'Main operating account'],
        ['Sales – Granite', 'Income', 'All granite sales'],
        ['Purchase – Granite', 'Direct Expenses', 'Quarry purchases'],
        ['Transport Expense', 'Direct Expenses', 'Inward freight'],
        ['Salaries & Wages', 'Indirect Expenses', 'Monthly payroll'],
        ['Sundry Debtors', 'Sundry Debtors', 'Customer AR'],
        ['Sundry Creditors', 'Current Liabilities', 'Vendor AP'],
        ['EPF Payable', 'Current Liabilities', 'Monthly EPF'],
        ['ESI Payable', 'Current Liabilities', 'Monthly ESI'],
        ['PT Payable', 'Current Liabilities', 'Professional Tax'],
        ['TDS Payable', 'Current Liabilities', 'TDS liability'],
        ['CGST Input / Output', 'Duties & Taxes', 'GST reconciliation'],
        ['SGST Input / Output', 'Duties & Taxes', 'GST reconciliation'],
        ['Partners Capital', 'Capital Account', 'Owners equity'],
      ]},
      { type: 'h3', text: '2.4 Opening Balances' },
      { type: 'checklist', items: [
        'Bank balance (confirm with bank statement)',
        'Cash on hand (physical count)',
        'Customer outstanding (ledger-wise)',
        'Vendor outstanding (ledger-wise)',
        'Stock value (physical count × last purchase rate)',
        'Fixed assets (as per asset register)',
        'Loan balances',
      ]},
      { type: 'tip', text: 'Post one opening balance journal voucher to balance debits and credits against Partners Capital.' },
      { type: 'h3', text: '2.5 Masters Setup' },
      { type: 'h4', text: 'Customers (Masters → Customers)' },
      { type: 'ul', items: ['Full name, GSTIN, state (for IGST vs CGST/SGST)', 'Credit days (30/45/60)', 'Contact details'] },
      { type: 'h4', text: 'Vendors (Masters → Vendors)' },
      { type: 'ul', items: [
        'Name, GSTIN, state',
        'MSME: Check "MSME Registered" and enter MSME number — critical for 45-day compliance',
        'Type: Quarry / Transporter / Other',
        'Bank details for payment reference',
      ]},
      { type: 'h4', text: 'Employees (Payroll → Employees)' },
      { type: 'ul', items: [
        'Full name, designation, department, joining date',
        'PAN, UAN (for EPF), ESIC number',
        'Bank account + IFSC',
        'Basic salary, HRA, conveyance, other allowances',
        'EPF applicable (if basic ≤ ₹15,000 or by choice)',
        'ESI applicable (if gross ≤ ₹21,000/month)',
        'PT applicable (all TN employees)',
      ]},
    ],
  },
  {
    id: 'daily',
    title: '3. Daily Operations',
    content: [
      { type: 'h3', text: '3.1 Morning Checklist' },
      { type: 'table', headers: ['Time', 'Action', 'Module', 'By'], rows: [
        ['9:00 AM', 'Check overnight bank alerts', 'External', 'Accounts'],
        ['9:15 AM', 'Review PDC cheques due today', 'PDC', 'Accounts'],
        ['9:30 AM', 'Check overdue invoices (>credit days)', 'Reports → AR Aging', 'Sales'],
        ['9:45 AM', 'Physical cash count — match with Cash Book', 'Reports → Cash Book', 'Accounts'],
        ['10:00 AM', 'Review stock levels for popular varieties', 'Inventory', 'Yard'],
      ]},
      { type: 'h3', text: '3.2 Sales Invoice (POS)' },
      { type: 'p', text: 'Path: POS' },
      { type: 'ol', items: [
        'Select customer (or "Walk-in"). New walk-in: phone takes a 10-digit number (auto +91 prefix); GSTIN is validated if entered',
        'Add slabs from inventory (search by variety/grade/lot)',
        'Adjust quantity inline in the cart if needed',
        'System auto-calculates: CGST+SGST for TN customers, IGST for out-of-state',
        'Apply discount if applicable',
        'Review total → Create Invoice',
        'Print (A4 tax invoice or 80 mm thermal) / WhatsApp / Email receipt to customer',
      ]},
      { type: 'warn', text: 'E-way bill required if goods value > ₹50,000 (inter-state). Walk-in sales: collect full payment before goods leave yard.' },
      { type: 'h3', text: '3.3 Payment Collection Entry' },
      { type: 'p', text: 'Path: Accounts → Payments → New Receipt' },
      { type: 'ol', items: [
        'Select payment mode: Cash / NEFT / RTGS / Cheque / UPI',
        'Link to invoice(s) being settled',
        'Enter UTR / cheque number for non-cash',
        'Amount received',
      ]},
      { type: 'tip', text: 'For cheques received: also enter in PDC → New PDC (type: Received). Update to "Cleared" when bank statement confirms.' },
      { type: 'h3', text: '3.4 Vendor Payment Entry' },
      { type: 'p', text: 'Path: Accounts → Payments → New Payment' },
      { type: 'ol', items: [
        'Select vendor',
        'Link to PO being settled (critical for MSME tracking)',
        'Enter UTR / cheque number',
        'Amount paid',
      ]},
      { type: 'warn', text: 'MSME Rule: Payments to MSME vendors MUST be made within 45 days of PO date. Check MSME → Outstanding before making any payment.' },
      { type: 'h3', text: '3.5 Purchase Order Entry' },
      { type: 'p', text: 'Path: Purchase → New PO' },
      { type: 'ol', items: [
        'Select vendor (MSME flag shows automatically if registered)',
        'Enter: variety, blocks, cbmt, rate per cbmt',
        'Transport charges (if known)',
        'System calculates GST (12% for granite)',
        'Save as "Draft" → "Approve" when PO sent to quarry',
        'On material receipt: Mark as "Received" — starts 45-day MSME clock',
      ]},
      { type: 'h3', text: '3.6 End-of-Day Checklist' },
      { type: 'checklist', items: [
        'Verify all sales invoices are posted (POS)',
        'Count physical cash; match with Cash Book (Reports)',
        'Verify all receipts are entered (Accounts → Payments)',
        'Note any cheques to be deposited tomorrow (PDC)',
        'Save/export daily sales summary (Reports → Sales)',
      ]},
    ],
  },
  {
    id: 'weekly',
    title: '4. Weekly Operations',
    content: [
      { type: 'h3', text: '4.1 Bank Reconciliation — Every Monday' },
      { type: 'p', text: 'Path: Accounts → Bank Reconciliation' },
      { type: 'ol', items: [
        'Download bank statement (last week) from net banking',
        'Match statement lines with journal entries',
        'Credits in bank not yet entered → raise receipt vouchers',
        'Debits in bank not yet entered → raise payment vouchers',
        'Outstanding cheques not cleared → follow up',
        'Balance should match bank statement closing balance',
      ]},
      { type: 'h3', text: '4.2 AR Outstanding Follow-up — Every Tuesday' },
      { type: 'p', text: 'Path: Reports → AR Aging' },
      { type: 'table', headers: ['Bucket', 'Action'], rows: [
        ['0–30 days', 'Monitor'],
        ['31–60 days', 'Send WhatsApp reminder'],
        ['61–90 days', 'Phone call + written notice'],
        ['91+ days', 'Escalate to management, consider legal'],
      ]},
      { type: 'h3', text: '4.3 PDC Management — Every Wednesday' },
      { type: 'p', text: 'Path: PDC' },
      { type: 'ol', items: [
        'Review cheques due this week (Pending, cheque_date ≤ today + 7)',
        'Deposit received cheques at bank',
        'Update status to "Deposited" after bank deposit',
        'Update to "Cleared" after bank confirms credit (T+1 or T+2)',
        'For returned cheques: update status, follow up, raise debit note',
      ]},
      { type: 'h3', text: '4.4 Stock Verification — Every Friday' },
      { type: 'p', text: 'Path: Inventory' },
      { type: 'ol', items: [
        'Compare system stock with physical count for 2–3 varieties',
        'If discrepancy: raise stock adjustment journal',
        'Damaged/rejected slabs — write off if unrecoverable',
        'Note varieties with low stock for purchase planning',
      ]},
    ],
  },
  {
    id: 'monthly',
    title: '5. Monthly Operations',
    content: [
      { type: 'h3', text: 'Month-End Calendar' },
      { type: 'table', headers: ['Date', 'Task', 'Module', 'Statutory Deadline'], rows: [
        ['1st–3rd', 'Process payroll', 'Payroll', '—'],
        ['7th', 'Deposit TDS (previous month)', 'TDS', '7th (30th for March)'],
        ['11th', 'File GSTR-1', 'Compliance', '11th'],
        ['15th', 'Deposit EPF (previous month)', 'Payroll → EPF Challan', '15th'],
        ['15th', 'Deposit ESI (previous month)', 'Payroll → ESI Challan', '15th'],
        ['20th', 'Deposit PT (TN, previous month)', 'Payroll → PT Challan', '20th'],
        ['20th', 'File GSTR-3B', 'Compliance', '20th'],
        ['20th–25th', 'Bank reconciliation', 'Accounts', '—'],
        ['25th–30th', 'Month-end journal entries', 'Accounts', '—'],
        ['Last day', 'Close month, generate reports', 'Reports', '—'],
      ]},
      { type: 'h3', text: '5.1 Payroll Processing (1st–3rd)' },
      { type: 'p', text: 'Path: Payroll → Runs → Process Payroll' },
      { type: 'ol', items: [
        'Confirm no new joinings/resignations; check leave applications (LOP)',
        'Select month (format: YYYY-MM) and click "Process Payroll"',
        'System auto-calculates EPF, ESI, PT, TDS Sec 192',
        'Review salary slips; flag >10% variance from previous month',
        'Get management approval on payroll statement',
        'Transfer net salary (NEFT batch); mark run as "Paid"',
        'Post journal: Dr Salary Expense / Cr Bank + Cr EPF/ESI/PT Payable',
      ]},
      { type: 'h3', text: '5.2 EPF Rates & Remittance (by 15th)' },
      { type: 'table', headers: ['Component', 'Rate', 'Notes'], rows: [
        ['Employee EPF', '12% of basic', 'Full to EPF if basic ≤ ₹15,000'],
        ['Employer EPS', '8.33% (max ₹1,250/month)', 'Pension scheme'],
        ['Employer EPF', '3.67%', 'Balance after EPS'],
        ['EDLI', '0.5% (max ₹75)', 'Insurance'],
        ['Admin charge', '0.5% (min ₹500)', 'Admin fee'],
      ]},
      { type: 'p', text: 'Portal: unifiedportal-emp.epfindia.gov.in — upload ECR file, generate challan, pay via net banking.' },
      { type: 'h3', text: '5.3 ESI Remittance (by 15th)' },
      { type: 'table', headers: ['Party', 'Rate', 'Applicability'], rows: [
        ['Employee', '0.75% of gross', 'If gross ≤ ₹21,000'],
        ['Employer', '3.25% of gross', 'Same threshold'],
      ]},
      { type: 'p', text: 'Portal: esic.in — upload contribution file, pay via net banking.' },
      { type: 'h3', text: '5.4 Professional Tax — Tamil Nadu (by 20th)' },
      { type: 'table', headers: ['Monthly Gross', 'PT per Month'], rows: [
        ['Up to ₹5,000', 'Nil'],
        ['₹5,001 – ₹7,500', '₹135'],
        ['₹7,501 – ₹10,000', '₹315'],
        ['₹10,001 – ₹12,500', '₹690'],
        ['₹12,501 – ₹20,833', '₹1,025'],
        ['₹20,834 and above', '₹1,250'],
      ]},
      { type: 'p', text: 'Portal: ctd.tn.gov.in — pay and upload Form V (Employer\'s Return).' },
      { type: 'h3', text: '5.5 Labour Welfare Fund — TN (June & December)' },
      { type: 'p', text: 'LWF is collected twice a year (June for H1, December for H2):' },
      { type: 'table', headers: ['Party', 'Amount', 'Due Date'], rows: [
        ['Employee', '₹20 per half-year', '—'],
        ['Employer', '₹40 per half-year', '—'],
        ['H1 remittance', '—', '31st July'],
        ['H2 remittance', '—', '31st January'],
      ]},
      { type: 'h3', text: '5.6 TDS Deposit (by 7th of following month)' },
      { type: 'table', headers: ['Section', 'When', 'Rate'], rows: [
        ['192', 'Salary (monthly)', 'As per slab'],
        ['194C', 'Transport contractor', '1% individual / 2% company'],
        ['194H', 'Commission', '5%'],
        ['194I', 'Rent (>₹2.4L p.a.)', '10%'],
        ['194J', 'Professional fees', '10%'],
      ]},
      { type: 'h3', text: '5.7 GSTR-1 Filing (by 11th)' },
      { type: 'ol', items: [
        'Generate GSTR-1 from Compliance module',
        'Verify B2B (with GSTIN), B2C Large (>₹2.5L), B2C Small, HSN summary',
        'Upload JSON or enter on GST portal (gst.gov.in)',
        'Submit and file with DSC / EVC',
      ]},
      { type: 'h3', text: '5.8 GSTR-3B Filing (by 20th)' },
      { type: 'ol', items: [
        'Generate GSTR-3B summary from Compliance module',
        'Verify outward supplies, ITC available, net GST payable',
        'Pay GST liability via GST portal',
        'File GSTR-3B',
        'Post journal: CGST/SGST Output → CGST/SGST Input (netting) → Cr Bank (cash portion)',
      ]},
      { type: 'h3', text: '5.9 Month-End Journal Entries' },
      { type: 'table', headers: ['Entry', 'Debit', 'Credit'], rows: [
        ['Depreciation', 'Depreciation Expense', 'Accumulated Depreciation'],
        ['Bank charges', 'Bank Charges', 'Bank A/c'],
        ['Interest received', 'Bank A/c', 'Interest Income'],
        ['Prepaid adjustments', 'Expense A/c', 'Prepaid Expense'],
        ['Accruals', 'Expense A/c', 'Accrued Liabilities'],
      ]},
      { type: 'tip', text: 'Run depreciation via Fixed Assets → Run Depreciation (system calculates WDV/SLM automatically).' },
      { type: 'h3', text: '5.10 Month-End Reports' },
      { type: 'table', headers: ['Report', 'Path', 'Purpose'], rows: [
        ['Trial Balance', 'Reports → Balance Sheet', 'Verify all entries balanced'],
        ['P&L', 'Reports → P&L', 'Gross margin, net profit'],
        ['Cash Book', 'Reports → Cash Book', 'Cash position'],
        ['Bank Book', 'Reports → Bank Book', 'Bank position'],
        ['AR Aging', 'Reports → Outstanding → AR', 'Overdue customers'],
        ['AP Aging', 'Reports → Outstanding → AP', 'Overdue vendors (MSME alert)'],
        ['MSME Outstanding', 'MSME → Outstanding + Interest', 'Interest liability'],
      ]},
    ],
  },
  {
    id: 'quarterly',
    title: '6. Quarterly Operations',
    content: [
      { type: 'h3', text: '6.1 TDS Return — Form 26Q' },
      { type: 'table', headers: ['Quarter', 'Period', 'Filing Deadline'], rows: [
        ['Q1', 'Apr–Jun', '31 July'],
        ['Q2', 'Jul–Sep', '31 October'],
        ['Q3', 'Oct–Dec', '31 January'],
        ['Q4', 'Jan–Mar', '31 May'],
      ]},
      { type: 'ol', items: [
        'Generate 26Q report from TDS module',
        'Verify all TDS transactions and deposited challans',
        'Prepare FVU file using NSDL RPU software',
        'Upload to traces.gov.in',
        'Issue Form 16A to vendors within 15 days of filing',
      ]},
      { type: 'h3', text: '6.2 GST Quarterly Review' },
      { type: 'ol', items: [
        'Reconcile GSTR-2B with purchase register',
        'Identify mismatches (suppliers who haven\'t filed)',
        'Follow up with suppliers for missing returns',
        'Reverse ITC for ineligible credits',
      ]},
      { type: 'h3', text: '6.3 Stock Audit (End of Quarter)' },
      { type: 'ol', items: [
        'Full physical count of all slab stock',
        'Compare with system inventory',
        'Adjust for natural wastage, damaged slabs, pilferage',
        'Post stock adjustment journal entry',
        'Revalue stock if material price changes',
      ]},
      { type: 'h3', text: '6.4 Advance Tax' },
      { type: 'table', headers: ['Instalment', 'Due Date', 'Amount'], rows: [
        ['1st', '15 June', '15% of estimated tax'],
        ['2nd', '15 September', '45% of estimated tax'],
        ['3rd', '15 December', '75% of estimated tax'],
        ['4th', '15 March', '100% of estimated tax'],
      ]},
    ],
  },
  {
    id: 'annual',
    title: '7. Annual Operations',
    content: [
      { type: 'h3', text: '7.1 Year-End Closing Checklist (March 31)' },
      { type: 'checklist', items: [
        'Close all pending purchase orders (Purchase)',
        'Finalise all sales invoices (POS)',
        'Complete bank reconciliation (Accounts)',
        'Run annual depreciation (Fixed Assets)',
        'Provision for gratuity (Payroll → Gratuity)',
        'Provision for bonus (Payroll → Bonus)',
        'Provision for doubtful debts (Accounts)',
        'Physical stock count (Inventory)',
        'Verify all statutory payables (EPF/ESI/PT/TDS) are paid',
      ]},
      { type: 'h3', text: '7.2 Bonus Processing (Payment of Bonus Act)' },
      { type: 'p', text: 'Path: Payroll → Bonus → New Run' },
      { type: 'ul', items: [
        'Eligible: employees with basic ≤ ₹21,000/month',
        'Minimum: 8.33% of annual basic',
        'Maximum: 20% of annual basic',
        'Payment deadline: 30 November (within 8 months of FY close)',
      ]},
      { type: 'h3', text: '7.3 Gratuity Provisioning' },
      { type: 'p', text: 'Path: Payroll → Gratuity' },
      { type: 'ul', items: [
        'Applicable: employees with ≥ 5 years of continuous service',
        'Formula: (15/26) × Last Basic × Years of Service',
        'Maximum: ₹20 lakh',
        'Post annual provision: Dr Gratuity Expense / Cr Gratuity Reserve',
        'Actual payment on resignation: Dr Gratuity Reserve / Cr Bank',
      ]},
      { type: 'h3', text: '7.4 Form 16 — TDS on Salary (by 15 June)' },
      { type: 'p', text: 'Path: Payroll → Form 16 — generate Part A (TDS deposited) + Part B (salary breakup) for each employee.' },
      { type: 'h3', text: '7.5 GSTR-9 Annual Return (by 31 December)' },
      { type: 'ol', items: [
        'Compile all 12 months of GSTR-1 and GSTR-3B',
        'Reconcile with books of accounts',
        'File GSTR-9 on GST portal',
        'If turnover > ₹5 Cr: also file GSTR-9C (CA certified)',
      ]},
      { type: 'h3', text: '7.6 MSME Form I — Half-Yearly Return' },
      { type: 'table', headers: ['Period', 'Due Date'], rows: [
        ['H1 (Apr–Sep)', '31 October'],
        ['H2 (Oct–Mar)', '30 April'],
      ]},
      { type: 'warn', text: 'Penalty for non-filing: ₹25,000 per return. Filing is required even if NIL outstanding.' },
      { type: 'p', text: 'Path: MSME → Form I tab → Generate → File on MCA portal.' },
      { type: 'h3', text: '7.7 Annual Report Package' },
      { type: 'checklist', items: [
        'Profit & Loss Statement (full year)',
        'Balance Sheet (as on March 31)',
        'Cash Flow Statement',
        'Trial Balance (final, post all adjustments)',
        'Fixed Asset Schedule (additions, deletions, depreciation)',
        'Tax Computation (profit → taxable income adjustments)',
        'GST Reconciliation (books vs returns)',
        'Statutory Compliance Certificate (EPF/ESI/PT/TDS all paid)',
      ]},
    ],
  },
  {
    id: 'gst',
    title: '8. GST Compliance',
    content: [
      { type: 'h3', text: 'GST Filing Calendar' },
      { type: 'table', headers: ['Return', 'Frequency', 'Due Date', 'Who Files'], rows: [
        ['GSTR-1', 'Monthly', '11th', 'Accounts'],
        ['GSTR-3B', 'Monthly', '20th', 'Accounts'],
        ['GSTR-2B', 'Auto', '—', 'System (reconcile)'],
        ['GSTR-9', 'Annual', '31 Dec', 'Accounts / CA'],
        ['GSTR-9C', 'Annual (>₹5 Cr)', '31 Dec', 'CA'],
      ]},
      { type: 'h3', text: 'HSN-wise Tax Rates (Granite)' },
      { type: 'table', headers: ['HSN', 'Product', 'GST Rate', 'CGST', 'SGST', 'IGST'], rows: [
        ['2515', 'Marble & Travertine', '12%', '6%', '6%', '12%'],
        ['2516', 'Granite (rough/dressed)', '12%', '6%', '6%', '12%'],
        ['2517', 'Chips, Gravel, Pebbles', '5%', '2.5%', '2.5%', '5%'],
      ]},
      { type: 'tip', text: 'Charge CGST+SGST when buyer is in Tamil Nadu. Charge IGST when buyer is in any other state.' },
    ],
  },
  {
    id: 'payroll-compliance',
    title: '9. Payroll Compliance',
    content: [
      { type: 'h3', text: 'Payroll Statutory Calendar' },
      { type: 'table', headers: ['Compliance', 'Due Date', 'Portal'], rows: [
        ['Salary disbursement', '7th of month', 'Internal'],
        ['EPF challan', '15th of month', 'unifiedportal-emp.epfindia.gov.in'],
        ['ESI challan', '15th of month', 'esic.in'],
        ['PT return (TN Form V)', '20th of month', 'ctd.tn.gov.in'],
        ['TDS deposit (Sec 192)', '7th of following month', 'tin.tin.nsdl.com'],
        ['LWF (TN)', '31 Jul (H1) / 31 Jan (H2)', 'TN Labour Board'],
        ['Form 24Q (TDS return)', '31 Jul / 31 Oct / 31 Jan / 31 May', 'traces.gov.in'],
        ['Form 16 (TDS certificate)', '15 June', 'Issue to employee'],
        ['Bonus payment', '30 November', 'Internal'],
      ]},
    ],
  },
  {
    id: 'msme',
    title: '10. MSME Compliance',
    content: [
      { type: 'h3', text: 'Statutory Framework' },
      { type: 'table', headers: ['Section', 'Provision'], rows: [
        ['Section 15', 'Payment to MSME supplier within agreed period or 45 days'],
        ['Section 16', 'Interest on delayed payment at 3× RBI bank rate = 27% p.a.'],
        ['Section 22', 'Half-yearly return (Form I) mandatory for all buyers'],
        ['Section 23', 'Interest paid is NOT deductible as business expense'],
      ]},
      { type: 'h3', text: 'MSME Interest Formula' },
      { type: 'code', text: 'PO Date + 45 days = Last payment date\n\nInterest = Principal × 27% × (Overdue Days / 365)\n\nThis interest CANNOT be claimed as business expense.' },
      { type: 'h3', text: 'Daily MSME Monitoring' },
      { type: 'p', text: 'Path: MSME → Outstanding + Interest — check every morning:' },
      { type: 'ul', items: [
        'Any PO crossing 30-day mark → arrange payment this week',
        'Any PO crossing 45-day mark → OVERDUE, interest accruing at 27% p.a.',
      ]},
      { type: 'warn', text: 'MSME interest is non-deductible for income tax. Avoid delays — the penalty compounds daily.' },
      { type: 'h3', text: 'Form I Half-Yearly Filing' },
      { type: 'table', headers: ['Period', 'Due Date', 'Penalty for non-filing'], rows: [
        ['H1 (Apr–Sep)', '31 October', '₹25,000'],
        ['H2 (Oct–Mar)', '30 April', '₹25,000'],
      ]},
      { type: 'tip', text: 'Filing is required even if the outstanding amount is NIL.' },
    ],
  },
  {
    id: 'backup',
    title: '11. Backup & Recovery',
    content: [
      { type: 'h3', text: 'Automated Backups' },
      { type: 'p', text: 'A backup runs automatically every night at 2:00 AM IST. Each backup is a gzip-compressed, SHA-256-verified snapshot of the database uploaded to Azure Blob Storage (container "backups", path modernex/daily/…). Additional snapshots are taken on key events and after migrations.' },
      { type: 'warn', text: 'Backups upload only when AZURE_STORAGE_CONNECTION_STRING is set in Azure App Settings. If it is unset, the nightly job runs as a dry-run and NOTHING is saved — confirm this setting exists in production.' },
      { type: 'h3', text: 'Manual Backup' },
      { type: 'p', text: 'UI: System → Backup → Create Backup Now. Each run is recorded in the backup registry with its status and blob path.' },
      { type: 'h3', text: 'Backup Verification (Weekly — Every Monday)' },
      { type: 'checklist', items: [
        'System → Backup: confirm a recent successful (non dry-run) entry',
        'Azure Portal → Storage account → Containers → backups → modernex/daily: confirm a fresh .db.gz of non-zero size',
        'Periodically restore the latest snapshot to a test environment to verify integrity',
      ]},
      { type: 'h3', text: 'Recovery Procedure (Azure App Service)' },
      { type: 'ol', items: [
        'Stop the app: az webapp stop --name modernex-prod -g modernex-rg',
        'Download the chosen snapshot from the backups container and gunzip it',
        'Upload it as /home/data/modernex.db via Kudu, replacing the existing file',
        'Start the app: az webapp start --name modernex-prod -g modernex-rg',
      ]},
      { type: 'warn', text: 'Demo / Clean Reset destroys ALL data. Never run in production: npm run demo:reset' },
    ],
  },
  {
    id: 'users',
    title: '12. User Management',
    content: [
      { type: 'h3', text: 'Adding a New User' },
      { type: 'p', text: 'Path: Users → Add User' },
      { type: 'ol', items: [
        'Enter username, full name, role',
        'Set temporary password',
        'Instruct user to change password on first login',
      ]},
      { type: 'h3', text: 'Role Assignment Guidelines' },
      { type: 'table', headers: ['Role', 'Assign to'], rows: [
        ['admin', 'Business owner, senior manager only'],
        ['accounts', 'Accountant, accounts executive'],
        ['sales', 'Sales staff, front desk'],
        ['yard', 'Yard supervisor, store keeper'],
      ]},
      { type: 'tip', text: 'Fine-grained access is configured under System → Roles & Permissions, where each role maps to per-module read/write permissions.' },
      { type: 'h3', text: 'Password Policy' },
      { type: 'ul', items: [
        'Minimum 8 characters',
        'Change default password immediately on first login',
        'Change every 90 days',
        'Never share passwords',
      ]},
      { type: 'h3', text: 'Disabling a User (when employee leaves)' },
      { type: 'ol', items: [
        'Users → Edit User → Deactivate',
        'Do NOT delete — preserves audit trail',
        'If admin leaves: change all system passwords immediately',
      ]},
    ],
  },
  {
    id: 'troubleshoot',
    title: '13. Troubleshooting',
    content: [
      { type: 'h3', text: 'Invoice not showing in GSTR-1' },
      { type: 'ul', items: [
        'Verify customer GSTIN is entered correctly',
        'Check that supply type is correct (B2B needs valid GSTIN)',
        'Regenerate GSTR-1 after correction',
      ]},
      { type: 'h3', text: 'Bank Reconciliation Difference' },
      { type: 'ol', items: [
        'Check for duplicate entries',
        'Check for entries in wrong month',
        'Verify bank charges not yet entered',
        'Check for uncleared cheques',
      ]},
      { type: 'h3', text: 'EPF Portal Rejecting ECR' },
      { type: 'ul', items: [
        'Check UAN is correct for each employee',
        'Verify PF wages do not exceed ₹15,000 for restricted employees',
        'Ensure establishment code is correct in ECR header',
      ]},
      { type: 'h3', text: 'Payroll Calculation Mismatch' },
      { type: 'ul', items: [
        'ESI: applicable only if gross ≤ ₹21,000 (if promoted, ESI continues till end of contribution period)',
        'EPF ceiling: ₹15,000 for new members; optional for those earning above',
        'PT: based on gross of current month only',
      ]},
      { type: 'h3', text: 'MSME Interest Discrepancy' },
      { type: 'ul', items: [
        'System uses 27% p.a. (3 × 9% RBI repo rate)',
        'If RBI changes rate, update MSME_INTEREST_RATE_PCT env variable',
        'Interest accrues from Day 46 after PO date, not invoice date',
      ]},
      { type: 'h3', text: 'System Performance' },
      { type: 'code', text: '# Optimize SQLite database\ncd packages/api\nnode -e "import(\'./src/db/connection.js\').then(({getDb}) => { const db = getDb(); db.exec(\'VACUUM; ANALYZE;\'); console.log(\'Done\'); })"' },
      { type: 'h3', text: 'Getting Support' },
      { type: 'ol', items: [
        'Health check (production): https://modernex-prod.azurewebsites.net/api/health',
        'Server logs: Azure Portal → modernex-prod → Log stream (or Kudu → LogFiles)',
        'Browser console: F12 → Console tab',
        'Raise issue with: screenshot, steps to reproduce, server log excerpt',
      ]},
      { type: 'h3', text: 'Key Statutory Reference Dates' },
      { type: 'table', headers: ['Compliance', 'Frequency', 'Due Date'], rows: [
        ['GSTR-1', 'Monthly', '11th'],
        ['GSTR-3B', 'Monthly', '20th'],
        ['TDS Deposit', 'Monthly', '7th (30th for March)'],
        ['EPF Challan', 'Monthly', '15th'],
        ['ESI Challan', 'Monthly', '15th'],
        ['PT (TN)', 'Monthly', '20th'],
        ['LWF (TN)', 'Half-yearly', '31 Jul / 31 Jan'],
        ['TDS Return 26Q', 'Quarterly', '31 Jul / 31 Oct / 31 Jan / 31 May'],
        ['Advance Tax', 'Quarterly', '15 Jun / 15 Sep / 15 Dec / 15 Mar'],
        ['MSME Form I', 'Half-yearly', '31 Oct / 30 Apr'],
        ['Form 16', 'Annual', '15 June'],
        ['GSTR-9', 'Annual', '31 December'],
        ['Bonus Payment', 'Annual', '30 November'],
      ]},
    ],
  },
];

// ── Renderer ──────────────────────────────────────────────────────────────────

function highlight(text: string, q: string): string {
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function BlockRenderer({ block, q }: { block: ContentBlock; q: string }) {
  const hl = (t: string) => ({ __html: highlight(t, q) });

  switch (block.type) {
    case 'p':
      return <p style={{ marginBottom: 8, lineHeight: 1.6 }} dangerouslySetInnerHTML={hl(block.text)} />;
    case 'h3':
      return <h3 style={{ marginTop: 20, marginBottom: 8, fontSize: 13, fontWeight: 700, color: 'var(--t1)', borderBottom: '1px solid var(--border)', paddingBottom: 4 }} dangerouslySetInnerHTML={hl(block.text)} />;
    case 'h4':
      return <h4 style={{ marginTop: 14, marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }} dangerouslySetInnerHTML={hl(block.text)} />;
    case 'ul':
      return (
        <ul style={{ marginBottom: 10, paddingLeft: 20 }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ marginBottom: 3, lineHeight: 1.5 }} dangerouslySetInnerHTML={hl(item)} />
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol style={{ marginBottom: 10, paddingLeft: 22 }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ marginBottom: 3, lineHeight: 1.5 }} dangerouslySetInnerHTML={hl(item)} />
          ))}
        </ol>
      );
    case 'checklist':
      return (
        <ul style={{ marginBottom: 10, paddingLeft: 4, listStyle: 'none' }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ marginBottom: 4, display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--t1)', flexShrink: 0, marginTop: 1 }}>☐</span>
              <span dangerouslySetInnerHTML={hl(item)} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div style={{ overflowX: 'auto', marginBottom: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '6px 10px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}
                    dangerouslySetInnerHTML={hl(h)} />
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: '5px 10px', verticalAlign: 'top', lineHeight: 1.5 }}
                      dangerouslySetInnerHTML={hl(cell)} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'code':
      return (
        <pre style={{
          background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4,
          padding: '10px 14px', marginBottom: 12, fontSize: 10.5, overflowX: 'auto',
          lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {block.text}
        </pre>
      );
    case 'warn':
      return (
        <div style={{
          background: 'rgba(220,60,60,0.08)', border: '1px solid rgba(220,60,60,0.3)',
          borderRadius: 4, padding: '8px 12px', marginBottom: 10, fontSize: 11, lineHeight: 1.5,
          color: 'var(--t1)',
        }}>
          <strong>⚠ </strong><span dangerouslySetInnerHTML={hl(block.text)} />
        </div>
      );
    case 'tip':
      return (
        <div style={{
          background: 'rgba(60,180,60,0.08)', border: '1px solid rgba(60,180,60,0.3)',
          borderRadius: 4, padding: '8px 12px', marginBottom: 10, fontSize: 11, lineHeight: 1.5,
        }}>
          <strong>💡 </strong><span dangerouslySetInnerHTML={hl(block.text)} />
        </div>
      );
    default:
      return null;
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function HelpPage() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const q = search.trim().toLowerCase();

  const visibleSections = useMemo(() => {
    if (!q) return SECTIONS;
    return SECTIONS.filter((sec) => {
      const inTitle = sec.title.toLowerCase().includes(q);
      const inContent = sec.content.some((block) => {
        switch (block.type) {
          case 'p': case 'h3': case 'h4': case 'warn': case 'tip': case 'code':
            return block.text.toLowerCase().includes(q);
          case 'ul': case 'ol': case 'checklist':
            return block.items.some((i) => i.toLowerCase().includes(q));
          case 'table':
            return block.headers.some((h) => h.toLowerCase().includes(q)) ||
              block.rows.some((r) => r.some((c) => c.toLowerCase().includes(q)));
          default: return false;
        }
      });
      return inTitle || inContent;
    });
  }, [q]);

  const active = visibleSections.find((s) => s.id === activeId) ?? visibleSections[0];

  const handleNav = (id: string) => {
    setActiveId(id);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, gap: 0 }}>
      {/* ── Sidebar ── */}
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', background: 'var(--bg2)',
      }}>
        <div style={{ padding: '12px 12px 8px' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--t1)', marginBottom: 8 }}>
            ❓ Operating Handbook
          </div>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '5px 8px', fontSize: 11, border: '1px solid var(--border)',
              borderRadius: 4, background: 'var(--bg1)', color: 'var(--t1)',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
          {visibleSections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => handleNav(sec.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 14px', fontSize: 11, cursor: 'pointer',
                background: active?.id === sec.id ? 'var(--t1)' : 'transparent',
                color: active?.id === sec.id ? 'var(--bg1)' : 'var(--t2)',
                border: 'none', borderRadius: 0, lineHeight: 1.4,
              }}
            >
              {sec.title}
            </button>
          ))}
          {visibleSections.length === 0 && (
            <div style={{ padding: '20px 14px', color: 'var(--t3)', fontSize: 11 }}>
              No results for "{search}"
            </div>
          )}
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', color: 'var(--t3)', fontSize: 10 }}>
          FY 2026-27 · v1.1
        </div>
      </div>

      {/* ── Content ── */}
      <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {active ? (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'var(--t1)' }}>
              {active.title}
            </h2>
            {active.content.map((block, i) => (
              <BlockRenderer key={i} block={block} q={search.trim()} />
            ))}
          </>
        ) : (
          <div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 40, textAlign: 'center' }}>
            No results. Try a different search term.
          </div>
        )}
      </div>
    </div>
  );
}
