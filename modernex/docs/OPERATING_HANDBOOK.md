# MODERNEX STONES LLP — Operating Handbook
## Granite ERP — Standard Operating Procedures

**Version:** 1.0 · **Effective:** FY 2025-26
**System:** Modernex ERP (Node + SQLite · React)
**Support:** System Administrator

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [First-Time Setup](#2-first-time-setup)
3. [Daily Operations](#3-daily-operations)
4. [Weekly Operations](#4-weekly-operations)
5. [Monthly Operations](#5-monthly-operations)
6. [Quarterly Operations](#6-quarterly-operations)
7. [Annual Operations](#7-annual-operations)
8. [GST Compliance Calendar](#8-gst-compliance-calendar)
9. [Payroll Compliance Calendar](#9-payroll-compliance-calendar)
10. [MSME Compliance](#10-msme-compliance)
11. [Backup & Recovery](#11-backup--recovery)
12. [User Management](#12-user-management)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. System Overview

### Modules

| Module | Purpose | Primary Users |
|--------|---------|--------------|
| **POS** | Walk-in and credit sales invoicing | Sales, Admin |
| **Inventory** | Slab stock tracking by variety/grade/lot | Yard, Admin |
| **Purchase** | Purchase orders from quarries | Admin, Accounts |
| **Production** | Gang-saw / polishing job tracking | Yard |
| **Accounts** | Journal vouchers, cash/bank books | Accounts |
| **Chart of Accounts** | Ledger, trial balance, P&L | Accounts |
| **Reports** | Balance sheet, ratio analysis, cash flow | Admin, Accounts |
| **Payroll** | Salary processing, EPF/ESI/PT/LWF | Admin, Accounts |
| **TDS** | Tax deduction at source, challans | Accounts |
| **PDC** | Post-dated cheque register | Accounts |
| **Fixed Assets** | Asset register, depreciation | Accounts |
| **MSME** | 45-day payment tracking, Form I | Accounts |
| **Compliance** | GST, GSTR-1/3B/9 | Accounts |
| **Masters** | Customers, vendors, varieties | Admin |

### User Roles

| Role | Access |
|------|--------|
| `admin` | Full access — all modules, user management, system settings |
| `accounts` | Finance: invoices, payments, purchases, vendors, payroll, TDS, PDC, fixed assets, MSME, bank recon, collection accounts, reports |
| `sales` | Sales: create invoices, manage customers, view payments & credit/debit notes, PDC read |
| `yard` | Operations: inventory, production jobs, slab photos, purchase orders (read), GRNs (read) |

#### Detailed Permission Matrix

| Module / Action | admin | accounts | sales | yard |
|---|:---:|:---:|:---:|:---:|
| **User Management** | ✓ | ✗ | ✗ | ✗ |
| **Company Settings** (read) | ✓ | ✓ | ✓ | ✓ |
| **Company Settings** (write) | ✓ | ✗ | ✗ | ✗ |
| **Customers** (read) | ✓ | ✓ | ✓ | ✓ |
| **Customers** (create/edit) | ✓ | ✓ | ✓ | ✗ |
| **Customers** (delete) | ✓ | ✗ | ✗ | ✗ |
| **Vendors** (read) | ✓ | ✓ | ✓ | ✓ |
| **Vendors** (create/edit) | ✓ | ✓ | ✗ | ✗ |
| **Vendors** (delete) | ✓ | ✗ | ✗ | ✗ |
| **Products / Slabs** (read) | ✓ | ✓ | ✓ | ✓ |
| **Products** (create/edit) | ✓ | ✗ | ✗ | ✓ |
| **Products** (move location) | ✓ | ✗ | ✓ | ✓ |
| **Products** (bulk rate / delete) | ✓ | ✗ | ✗ | ✗ |
| **Slab Photos** (upload) | ✓ | ✗ | ✓ | ✓ |
| **Slab Photos** (delete) | ✓ | ✗ | ✗ | ✓ |
| **Variety Defaults** (read) | ✓ | ✓ | ✓ | ✓ |
| **Variety Defaults / Master** (write) | ✓ | ✗ | ✗ | ✗ |
| **Production** (read) | ✓ | ✓ | ✓ | ✓ |
| **Production** (create/update) | ✓ | ✗ | ✗ | ✓ |
| **Invoices** (read) | ✓ | ✓ | ✓ | ✓ |
| **Invoices** (create) | ✓ | ✓ | ✓ | ✗ |
| **Invoices** (mark paid / edit items) | ✓ | ✓ | ✗ | ✗ |
| **Delivery Challans** | ✓ | ✓ | ✓ | ✗ |
| **Payments** (read) | ✓ | ✓ | ✓ | ✗ |
| **Payments** (create) | ✓ | ✓ | ✗ | ✗ |
| **Purchase Orders** (read) | ✓ | ✓ | ✗ | ✓ |
| **Purchase Orders** (create/edit) | ✓ | ✓ | ✗ | ✗ |
| **GRN** (read) | ✓ | ✓ | ✓ | ✓ |
| **GRN** (create/verify) | ✓ | ✓ | ✗ | ✗ |
| **Debit/Credit Notes** (read) | ✓ | ✓ | ✓ | ✗ |
| **Debit/Credit Notes** (create/confirm) | ✓ | ✓ | ✗ | ✗ |
| **Debit/Credit Notes** (cancel) | ✓ | ✗ | ✗ | ✗ |
| **PDC** (read) | ✓ | ✓ | ✓ | ✗ |
| **PDC** (create/update) | ✓ | ✓ | ✗ | ✗ |
| **Collection Accounts** (read) | ✓ | ✓ | ✓ | ✓ |
| **Collection Accounts** (create/edit/set-default) | ✓ | ✓ | ✗ | ✗ |
| **Collection Accounts** (delete) | ✓ | ✗ | ✗ | ✗ |
| **Chart of Accounts** (read) | ✓ | ✓ | ✗ | ✗ |
| **Chart of Accounts** (create/edit) | ✓ | ✓ | ✗ | ✗ |
| **Journal Vouchers** | ✓ | ✓ | ✗ | ✗ |
| **Bank Reconciliation** | ✓ | ✓ | ✗ | ✗ |
| **Fixed Assets** (read) | ✓ | ✓ | ✗ | ✗ |
| **Fixed Assets** (create/edit) | ✓ | ✓ | ✗ | ✗ |
| **Fixed Assets** (dispose) | ✓ | ✗ | ✗ | ✗ |
| **Depreciation Run** | ✓ | ✓ | ✗ | ✗ |
| **MSME Compliance** | ✓ | ✓ | ✗ | ✗ |
| **TDS** | ✓ | ✓ | ✗ | ✗ |
| **Payroll** (process/view) | ✓ | ✓ | ✗ | ✗ |
| **Payroll** (mark paid / gratuity / leave accrue) | ✓ | ✗ | ✗ | ✗ |
| **Reports** (P&L, Balance Sheet, GST, etc.) | ✓ | ✓ | ✗ | ✗ |
| **GST Compliance Calendar** | ✓ | ✓ | ✗ | ✗ |
| **Backups** | ✓ | ✗ | ✗ | ✗ |
| **QR Codes** | ✓ | ✓ | ✓ | ✓ |

---

## 2. First-Time Setup

### 2.1 Initial Server Setup

```bash
# Install dependencies
cd modernex && npm install

# Start the API server (creates DB + admin user on first run)
cd packages/api && npm run dev

# Start the frontend
cd packages/web && npm run dev
```

On first start, the system creates a default admin user:
- **Username:** `admin`
- **Password:** `admin123` ← **Change immediately**

Set a secure password via `System → Security → Change Password` or set before start:
```bash
ADMIN_PASSWORD=YourSecurePassword123 npm run start
```

### 2.2 Company Setup (Day 1)

**Path:** System → Company Details

Enter:
- Company name, GSTIN, PAN
- HSN code (2516 for granite)
- Registered address
- Bank details for invoice footer
- SMTP settings for email delivery (optional)

### 2.3 Chart of Accounts Setup (Day 1)

**Path:** Chart of Accounts → Accounts

Create minimum accounts:

| Account | Group | Use |
|---------|-------|-----|
| Cash in Hand | Cash-in-Hand | Daily petty cash |
| SBI Current A/c | Bank Accounts | Main operating account |
| Sales – Granite | Income | All granite sales |
| Purchase – Granite | Direct Expenses | Quarry purchases |
| Transport Expense | Direct Expenses | Inward freight |
| Salaries & Wages | Indirect Expenses | Monthly payroll |
| Rent & Rates | Indirect Expenses | Office/yard rent |
| Sundry Debtors | Sundry Debtors | Customer AR |
| Sundry Creditors | Current Liabilities | Vendor AP |
| EPF Payable | Current Liabilities | Monthly EPF |
| ESI Payable | Current Liabilities | Monthly ESI |
| PT Payable | Current Liabilities | Professional Tax |
| TDS Payable | Current Liabilities | TDS liability |
| CGST Input | Duties & Taxes (Asset) | Input GST |
| SGST Input | Duties & Taxes (Asset) | Input GST |
| CGST Output | Duties & Taxes (Liability) | Output GST |
| SGST Output | Duties & Taxes (Liability) | Output GST |
| Partners Capital | Capital Account | Owners equity |

### 2.4 Opening Balances (Day 1)

**Path:** Chart of Accounts → Accounts → Edit → Opening Balance

Enter opening balances as of the start date of the financial year (April 1):
1. Bank balance (confirm with bank statement)
2. Cash on hand (physical count)
3. Customer outstanding (ledger-wise)
4. Vendor outstanding (ledger-wise)
5. Stock value (physical count × last purchase rate)
6. Fixed assets (as per asset register)
7. Loan balances

**Journal entry:** Post one opening balance voucher (type: Journal) to balance debits and credits against Partners Capital.

### 2.5 Masters Setup

#### Customers (Masters → Customers)
For each credit customer:
- Full name, GSTIN, state (for IGST vs CGST/SGST determination)
- Credit days (30/45/60)
- Contact details

#### Vendors (Masters → Vendors)
For each quarry/supplier:
- Name, GSTIN, state
- **MSME: Check "MSME Registered" and enter MSME number** — critical for 45-day compliance
- Type: Quarry / Transporter / Other
- Bank details for payment reference

#### Variety / Product Setup (Inventory)
For each granite variety stocked:
- Add product (kind: slab, variety name, HSN 2516, grade, lot ID)
- Enter opening stock quantity (sqft)
- Set rate per sqft

#### Employees (Payroll → Employees)
For each employee:
- Full name, designation, department, joining date
- PAN, UAN (for EPF), ESIC number
- Bank account + IFSC
- Basic salary, HRA, conveyance, other allowances
- EPF applicable (if basic ≤ ₹15,000 ceiling or by choice)
- ESI applicable (if gross ≤ ₹21,000/month)
- PT applicable (all TN employees)

---

## 3. Daily Operations

### 3.1 Morning Opening Checklist

| Time | Action | Module | By |
|------|--------|--------|----|
| 9:00 AM | Check overnight bank alerts, note any credits | External | Accounts |
| 9:15 AM | Review PDC cheques due today | PDC | Accounts |
| 9:30 AM | Check overdue invoices (>credit days) | Reports → AR Aging | Sales |
| 9:45 AM | Physical cash count — match with system Cash book | Reports → Cash Book | Accounts |
| 10:00 AM | Review stock levels for popular varieties | Inventory | Yard |

### 3.2 Sales Invoice (POS)

**Path:** POS

1. Select customer (or "Walk-in")
2. Add slabs from inventory (search by variety/grade/lot)
3. System auto-calculates:
   - CGST+SGST for TN customers
   - IGST for out-of-state customers
4. Apply discount if applicable
5. Review total → **Create Invoice**
6. Print / WhatsApp / Email receipt to customer

**Rules:**
- Never raise an invoice without recording payment terms
- Walk-in sales: collect full payment before goods leave yard
- Credit sales: verify customer's outstanding doesn't exceed credit limit
- E-way bill required if goods value > ₹50,000 (inter-state)

### 3.3 Payment Collection Entry

**Path:** Accounts → Payments → New Receipt

For every payment received from customer:
1. Select payment mode: Cash / NEFT / RTGS / Cheque / UPI
2. Link to invoice(s) being settled
3. Enter UTR / cheque number for non-cash
4. Amount received

**For cheques received:**
- Also enter in PDC → New PDC (type: Received)
- Status: Pending until cleared by bank
- Update to "Cleared" when bank statement confirms

### 3.4 Vendor Payment Entry

**Path:** Accounts → Payments → New Payment

For every payment made to vendor:
1. Select vendor
2. Link to PO being settled (critical for MSME tracking)
3. Enter UTR / cheque number
4. Amount paid

**MSME Rule:** Payments to MSME vendors MUST be made within 45 days of the PO/invoice date. Check MSME → Outstanding before making any payment to confirm no interest has accrued.

### 3.5 Purchase Order Entry

**Path:** Purchase → New PO

When ordering granite from quarry:
1. Select vendor (MSME flag shows automatically if registered)
2. Enter: variety, number of blocks, CFT, rate per CFT
3. Transport charges (if known)
4. System calculates GST (5% for granite blocks)
5. Save as "Draft" → "Approve" when PO sent to quarry

**On material receipt (GRN):**
- Mark PO as "Received"
- Update stock in Inventory
- This starts the 45-day MSME payment clock

### 3.6 End-of-Day Checklist

| Action | Module | By |
|--------|--------|----|
| Verify all sales invoices are posted | POS | Sales |
| Count physical cash; match with Cash Book | Reports → Cash Book | Accounts |
| Verify all receipts are entered | Accounts → Payments | Accounts |
| Note any cheques to be deposited tomorrow | PDC | Accounts |
| Save/export daily sales summary | Reports → Sales | Admin |

---

## 4. Weekly Operations

### 4.1 Bank Reconciliation (Every Monday)

**Path:** Accounts → Bank Reconciliation

1. Download bank statement (last week) from net banking
2. Import or manually match statement lines with journal entries
3. Identify:
   - Credits in bank not yet entered → raise receipt vouchers
   - Debits in bank not yet entered → raise payment vouchers
   - Outstanding cheques not yet cleared → follow up
4. Balance should match bank statement closing balance

### 4.2 Outstanding Follow-up (Every Tuesday)

**Path:** Reports → AR Aging

Review all outstanding receivables:

| Bucket | Action |
|--------|--------|
| 0–30 days | Monitor |
| 31–60 days | Send WhatsApp reminder |
| 61–90 days | Phone call + written notice |
| 91+ days | Escalate to management, consider legal |

For MSME vendors in AP Aging: check if any overdue and arrange payment.

### 4.3 PDC Management (Every Wednesday)

**Path:** PDC

1. Review cheques due this week (status: Pending, cheque_date ≤ today + 7)
2. Deposit received cheques at bank
3. Update status to "Deposited" after bank deposit
4. Update to "Cleared" after bank confirms credit (usually T+1 or T+2)
5. For returned cheques (bounce): update status, initiate follow-up, raise debit note

### 4.4 Stock Verification (Every Friday)

**Path:** Inventory

1. Compare system stock with yard physical count for 2–3 varieties
2. If discrepancy found: raise stock adjustment journal
3. Check for damaged/rejected slabs — write off if unrecoverable
4. Note varieties with low stock for purchase planning

---

## 5. Monthly Operations

### Month-End Calendar

| Date | Task | Module | Statutory Deadline |
|------|------|--------|--------------------|
| 1st–3rd | Process payroll | Payroll | — |
| 7th | Deposit TDS (previous month) | TDS | 7th (or 30th for March) |
| 10th–11th | File GSTR-1 | Compliance | 11th |
| 15th | Deposit EPF (previous month) | Payroll → EPF Challan | 15th |
| 15th | Deposit ESI (previous month) | Payroll → ESI Challan | 15th |
| 20th | Deposit PT (TN, previous month) | Payroll → PT Challan | 20th |
| 20th | File GSTR-3B | Compliance | 20th |
| 20th–25th | Bank reconciliation | Accounts | — |
| 25th–30th | Month-end journal entries | Accounts | — |
| Last day | Close month, generate reports | Reports | — |

### 5.1 Payroll Processing (1st–3rd of month)

**Path:** Payroll → Runs → Process Payroll

**Step 1: Verify employee data**
- Confirm no new joinings/resignations to update
- Check leave applications for the month (LOP deductions)

**Step 2: Process payroll**
1. Select month (format: YYYY-MM)
2. Click "Process Payroll" — system auto-calculates:
   - Gross = Basic + HRA + Conveyance + Other
   - EPF employee: 12% of basic (capped at ₹15,000)
   - EPF employer: 12% of basic (capped at ₹15,000)
   - ESI employee: 0.75% of gross (if gross ≤ ₹21,000)
   - ESI employer: 3.25% of gross
   - PT (TN slabs): based on gross
   - TDS Sec 192: monthly TDS based on tax declaration
3. Review salary slips for each employee
4. Verify net amounts against previous month (flag >10% variance)

**Step 3: Approve and disburse**
1. Get management approval on payroll statement
2. Transfer net salary to bank accounts (NEFT batch)
3. Mark payroll run as "Paid"
4. Post journal: Dr Salary Expense / Cr Bank (net) + Cr EPF/ESI/PT Payable

### 5.2 EPF Remittance (by 15th)

**Path:** Payroll → Challans → EPF ECR

1. Download ECR (Electronic Challan cum Return) from system
2. Upload to EPFO Unified Portal (unifiedportal-emp.epfindia.gov.in)
3. Verify member-wise contribution
4. Generate challan on portal
5. Pay via net banking
6. Download receipt, update challan details in system
7. Post journal: Dr EPF Payable / Cr Bank

**EPF Rates:**
- Employee: 12% of basic (full to EPF if basic ≤ ₹15,000, else EPS ₹1,250 + balance to EPF)
- Employer EPS: 8.33% (max ₹1,250/month)
- Employer EPF: 3.67% (or full 12% minus EPS)
- EDLI: 0.5% (max ₹75)
- Admin: 0.5% (min ₹500/month for establishment)

### 5.3 ESI Remittance (by 15th)

**Path:** Payroll → Challans → ESI Challan

1. Generate ESI challan from system
2. Login to ESIC portal (esic.in)
3. Upload contribution file
4. Pay via net banking
5. Post journal: Dr ESI Payable / Cr Bank

**ESI Rates:**
- Employee: 0.75% of gross (applicable if gross ≤ ₹21,000)
- Employer: 3.25% of gross

### 5.4 Professional Tax — Tamil Nadu (by 20th)

**Path:** Payroll → Challans → PT Challan

**TN PT Slabs (monthly gross):**

| Gross Salary | PT per Month |
|-------------|-------------|
| Up to ₹5,000 | Nil |
| ₹5,001 – ₹7,500 | ₹135 |
| ₹7,501 – ₹10,000 | ₹315 |
| ₹10,001 – ₹12,500 | ₹690 |
| ₹12,501 – ₹20,833 | ₹1,025 |
| ₹20,834 and above | ₹1,250 |

1. Generate PT challan from system
2. Pay via TN Commercial Taxes portal (ctd.tn.gov.in)
3. Upload Form V (Employer's Return) — due by 20th
4. Post journal: Dr PT Payable / Cr Bank

### 5.5 Labour Welfare Fund — Tamil Nadu (June & December)

**Path:** Payroll → LWF

LWF is collected **twice a year** (June for H1, December for H2):
- Employee contribution: ₹20 per half-year
- Employer contribution: ₹40 per half-year

**Process:**
1. In June (after payroll): Payroll → LWF → Process H1
2. Deduct from June salary
3. Remit to TN Labour Welfare Board by 31st July
4. Repeat for H2 in December → remit by 31st January

### 5.6 TDS Deposit (by 7th of following month)

**Path:** TDS → Transactions

For each TDS transaction posted during the month:
1. Aggregate by section (194C, 194H, 192, etc.)
2. Generate ITNS 281 challan
3. Pay via income tax portal or bank
4. Enter challan details (BSR code, serial no.) in system
5. Mark transactions as "Deposited"
6. Post journal: Dr TDS Payable / Cr Bank

**Common TDS sections for granite business:**
| Section | When | Rate |
|---------|------|------|
| 192 | Salary (monthly) | As per slab |
| 194C | Transport contractor | 1% (individual) / 2% (company) |
| 194H | Commission | 5% |
| 194I | Rent (>₹2.4L p.a.) | 10% |
| 194J | Professional fees | 10% |

### 5.7 GSTR-1 Filing (by 11th of following month)

**Path:** Compliance → GSTR-1

1. Generate GSTR-1 from system
2. Verify:
   - B2B invoices (with GSTIN): all outward supplies to registered dealers
   - B2C Large (>₹2.5L): individual consumers above threshold
   - B2C Small: consolidated by state
   - HSN summary (HSN 2516)
3. Login to GST portal (gst.gov.in)
4. Upload JSON or enter manually
5. Submit and file with DSC / EVC

### 5.8 GSTR-3B Filing (by 20th of following month)

**Path:** Compliance → GSTR-3B

1. Generate GSTR-3B summary
2. Verify:
   - Total outward taxable supplies
   - ITC available (from purchase invoices)
   - ITC eligible after GSTR-2B reconciliation
   - Net GST payable (Output – Input)
3. Pay GST liability via GST portal (cash ledger top-up if needed)
4. File GSTR-3B
5. Post journal:
   - Dr CGST/SGST Output → Cr CGST/SGST Input (netting)
   - Dr GST Payable → Cr Bank (cash portion)

### 5.9 Month-End Journal Entries

Post the following by the last working day of the month:

| Entry | Debit | Credit |
|-------|-------|--------|
| Depreciation | Depreciation Expense | Accumulated Depreciation |
| Bank charges | Bank Charges | Bank A/c |
| Interest received | Bank A/c | Interest Income |
| Prepaid adjustments | Expense A/c | Prepaid Expense |
| Accruals | Expense A/c | Accrued Liabilities |

**Depreciation:** Payroll → Fixed Assets → Run Depreciation (system calculates WDV or SLM automatically).

### 5.10 Month-End Reports to Review

| Report | Path | Purpose |
|--------|------|---------|
| Trial Balance | Reports → Balance Sheet (Trial Balance tab) | Verify all entries balanced |
| P&L | Reports → P&L | Gross margin, net profit |
| Cash Book | Reports → Cash Book | Cash position |
| Bank Book | Reports → Bank Book | Bank position |
| AR Aging | Reports → Outstanding → AR | Overdue customers |
| AP Aging | Reports → Outstanding → AP | Overdue vendors (MSME alert) |
| MSME Outstanding | MSME → Outstanding + Interest | Interest liability |

---

## 6. Quarterly Operations

### 6.1 TDS Return — Form 26Q (by 31st of month after quarter end)

| Quarter | Period | Filing Deadline |
|---------|--------|----------------|
| Q1 | Apr–Jun | 31 July |
| Q2 | Jul–Sep | 31 October |
| Q3 | Oct–Dec | 31 January |
| Q4 | Jan–Mar | 31 May |

**Path:** TDS → 26Q

1. Generate 26Q report from system
2. Verify all TDS transactions for the quarter
3. Confirm all challans are deposited
4. Prepare FVU file using NSDL RPU software
5. Upload to TIN-FC or traces.gov.in
6. Collect Form 16A and issue to vendors (by 15 days after filing)

### 6.2 GST Quarterly Review

1. Reconcile GSTR-2B (auto-populated from suppliers) with purchase register
2. Identify mismatches (suppliers who haven't filed)
3. Follow up with suppliers for missing returns
4. Reverse ITC for ineligible credits

### 6.3 Stock Audit (End of Quarter)

1. Full physical count of all slab stock
2. Compare with system inventory
3. Adjust for:
   - Natural wastage (cutting, polishing losses)
   - Damaged/broken slabs
   - Theft/pilferage
4. Post stock adjustment journal entry
5. Revalue stock if material price changes

### 6.4 Advance Tax (if applicable)

| Instalment | Due Date | Amount |
|------------|---------|--------|
| 1st | 15 June | 15% of estimated tax |
| 2nd | 15 September | 45% of estimated tax |
| 3rd | 15 December | 75% of estimated tax |
| 4th | 15 March | 100% of estimated tax |

Calculate estimated annual profit from P&L and pay advance tax accordingly.

---

## 7. Annual Operations

### 7.1 Year-End Closing Checklist (March 31)

**Financial year: April 1 to March 31**

| Task | Deadline | Module |
|------|---------|--------|
| Close all pending purchase orders | 31 March | Purchase |
| Finalise all sales invoices | 31 March | POS |
| Complete bank reconciliation | 31 March | Accounts |
| Run annual depreciation | 31 March | Fixed Assets |
| Provision for gratuity | 31 March | Payroll → Gratuity |
| Provision for bonus | 31 March | Payroll → Bonus |
| Provision for doubtful debts | 31 March | Accounts |
| Physical stock count | 31 March | Inventory |
| Verify all statutory payables (EPF/ESI/PT/TDS) are paid | 31 March | All |

### 7.2 Bonus Processing (Payment of Bonus Act)

**Path:** Payroll → Bonus → New Run

- Eligible: employees with basic ≤ ₹21,000/month
- Minimum: 8.33% of annual basic
- Maximum: 20% of annual basic
- Allocable surplus: if >8.33%, proportionally distribute up to 20%
- Payment deadline: within 8 months of financial year close (November 30)
- Post journal: Dr Bonus Expense / Cr Bonus Payable → Dr Bonus Payable / Cr Bank

### 7.3 Gratuity Provisioning

**Path:** Payroll → Gratuity

- Applicable: employees with ≥ 5 years of continuous service
- Formula: (15/26) × Last Basic × Years of Service
- Maximum: ₹20 lakh
- Post annual provision: Dr Gratuity Expense / Cr Gratuity Reserve
- Actual payment on resignation/retirement: Dr Gratuity Reserve / Cr Bank

### 7.4 Form 16 — TDS on Salary (by 15 June)

**Path:** Payroll → Form 16

For each employee:
1. Generate Form 16 (Part A + Part B) from system
2. Part A: TDS deducted and deposited quarter-wise
3. Part B: Salary breakup, exemptions (HRA, Sec 10), Chapter VI-A deductions
4. Digital signature if available, else manual signature
5. Issue to employee by 15th June

### 7.5 GSTR-9 Annual Return (by 31 December)

1. Compile all 12 months of GSTR-1 and GSTR-3B
2. Reconcile with books of accounts
3. File GSTR-9 on GST portal
4. If turnover > ₹5 Cr: also file GSTR-9C (reconciliation statement, CA certified)

### 7.6 MSME Form I — Half-Yearly Return (by 31 Oct & 30 Apr)

**Path:** MSME → Form I (Half-Yearly)

**Statutory requirement under MSMED Act 2006, Section 22:**
All companies/LLPs must file a return of outstanding amounts to MSME vendors.

| Period | Due Date |
|--------|---------|
| H1 (Apr–Sep) | 31 October |
| H2 (Oct–Mar) | 30 April |

1. Generate Form I from system (MSME → Form I tab)
2. Select half-year period
3. System lists all MSME vendors with outstanding amounts
4. File on MCA portal (msme.gov.in/samadhaan or udyam portal)
5. **Penalty for non-filing: fine up to ₹25,000**

### 7.7 Annual Report Package

Generate and file for management review:
1. **Profit & Loss Statement** (full year)
2. **Balance Sheet** (as on March 31)
3. **Cash Flow Statement**
4. **Trial Balance** (final, post all adjustments)
5. **Fixed Asset Schedule** (additions, deletions, depreciation)
6. **Tax Computation** (profit → taxable income adjustments)
7. **GST Reconciliation** (books vs returns)
8. **Statutory Compliance Certificate** (EPF/ESI/PT/TDS all paid)

---

## 8. GST Compliance Calendar

| Return | Frequency | Due Date | Who Files |
|--------|-----------|---------|-----------|
| GSTR-1 | Monthly | 11th | Accounts |
| GSTR-3B | Monthly | 20th | Accounts |
| GSTR-2B | Auto | — | System (reconcile) |
| GSTR-9 | Annual | 31 Dec | Accounts / CA |
| GSTR-9C | Annual (>₹5 Cr) | 31 Dec | CA |

### HSN-wise Tax Rates (Granite)

| HSN | Product | GST Rate | CGST | SGST | IGST |
|-----|---------|----------|------|------|------|
| 2515 | Marble & Travertine | 12% | 6% | 6% | 12% |
| 2516 | Granite (rough/dressed) | 12% | 6% | 6% | 12% |
| 2517 | Chips, Gravel, Pebbles | 5% | 2.5% | 2.5% | 5% |

**When to charge CGST+SGST:** Supplier and buyer both in Tamil Nadu.
**When to charge IGST:** Buyer in a different state (Karnataka, Maharashtra, etc.).

---

## 9. Payroll Compliance Calendar

| Compliance | Due Date | Portal |
|-----------|---------|--------|
| Salary disbursement | 7th of month | Internal |
| EPF challan (EPFO) | 15th of month | unifiedportal-emp.epfindia.gov.in |
| ESI challan (ESIC) | 15th of month | esic.in |
| PT return (TN Form V) | 20th of month | ctd.tn.gov.in |
| TDS deposit (Sec 192) | 7th of following month | tin.tin.nsdl.com |
| LWF (TN) | 31 July (H1) / 31 Jan (H2) | TN Labour Board |
| Form 24Q (TDS return) | 31 Jul / 31 Oct / 31 Jan / 31 May | traces.gov.in |
| Form 16 (TDS certificate) | 15 June | Issue to employee |
| Bonus payment | 30 November | Internal |

---

## 10. MSME Compliance

### Statutory Framework
- **Act:** MSMED Act 2006
- **Section 15:** Payment to MSME supplier within agreed period or 45 days
- **Section 16:** Interest on delayed payment at 3× RBI bank rate = **27% p.a.**
- **Section 22:** Half-yearly return (Form I) mandatory for all buyers

### Daily MSME Monitoring

**Path:** MSME → Outstanding + Interest

Check every morning:
- Any PO crossing 30-day mark → arrange payment this week
- Any PO crossing 45-day mark → **OVERDUE, interest accruing at 27% p.a.**
- Interest is non-deductible for income tax purposes (Section 23)

### MSME Payment Rule

```
PO Date + 45 days = Last payment date

If paid after 45 days:
  Interest = Principal × 27% × (Overdue Days / 365)
  This interest CANNOT be claimed as business expense
```

### Form I Filing (Half-Yearly)

Filing is required even if NIL outstanding. Penalty: ₹25,000 per return.

---

## 11. Backup & Recovery

### Automated Backups

The system performs **nightly automatic backup** at 2:00 AM IST:
- Saves to local `./backups/` directory
- Retains last 30 days
- If Azure Blob Storage is configured, also uploads to cloud

### Manual Backup

```bash
cd modernex/packages/api
npm run backup        # creates timestamped .db backup
```

Or via UI: **System → Backup → Create Backup Now**

### Backup Verification (Weekly)

Every Monday:
1. Check `./packages/api/backups/` for recent files
2. Verify file size is not zero
3. Spot-check by restoring to test environment

### Recovery Procedure

```bash
# Stop API server
pm2 stop modernex-api   # or Ctrl+C

# Replace database
cp backups/modernex-2025-05-21.db data/modernex.db

# Restart
pm2 start modernex-api
```

### Demo Reset (Dev/Testing only)

```bash
cd packages/api
npm run demo:reset
```
**WARNING:** This destroys ALL data and replaces with demo data. Never run in production.

---

## 12. User Management

### Adding a New User

**Path:** Users → Add User

1. Enter username, full name, role
2. Set temporary password
3. Instruct user to change password on first login

### Role Assignment Guidelines

| Role | Assign to |
|------|-----------|
| `admin` | Business owner, senior manager only |
| `accounts` | Accountant, accounts executive |
| `sales` | Sales staff, front desk |
| `yard` | Yard supervisor, store keeper |
| `viewer` | Auditors, bankers (read-only) |

### Password Policy

- Minimum 8 characters
- Change default password immediately on first login
- Change every 90 days
- Never share passwords

### Disabling a User

When an employee leaves:
1. Users → Edit User → Deactivate
2. Do NOT delete (preserves audit trail)
3. If admin: change all system passwords immediately

---

## 13. Troubleshooting

### Common Issues

#### Invoice not showing in GSTR-1
- Verify customer GSTIN is entered correctly
- Check that supply type is correct (B2B needs valid GSTIN)
- Regenerate GSTR-1 after correction

#### Bank reconciliation difference
1. Check for duplicate entries
2. Check for entries in wrong month
3. Verify bank charges not yet entered
4. Check for uncleared cheques

#### EPF portal rejecting ECR
- Check UAN is correct for each employee
- Verify PF wages do not exceed ₹15,000 for restricted employees
- Ensure establishment code is correct in ECR header

#### Payroll calculation mismatch
- Verify ESI: applicable only if gross ≤ ₹21,000 (check each month — if promoted, ESI continues till end of contribution period)
- EPF ceiling: ₹15,000 for new members; optional for those earning above
- PT: based on gross of current month only

#### MSME interest discrepancy
- System uses 27% p.a. (3 × 9% RBI repo rate)
- If RBI changes rate, update `MSME_INTEREST_RATE_PCT` env variable
- Interest accrues from Day 46 after PO date, not invoice date

### System Performance

If system is slow:
```bash
# Optimize SQLite database
cd packages/api
node -e "import('./src/db/connection.js').then(({getDb}) => { const db = getDb(); db.exec('VACUUM; ANALYZE;'); console.log('Done'); })"
```

### Getting Support

1. Check server logs: `packages/api/logs/`
2. Browser console: F12 → Console tab
3. Health check: http://localhost:8080/api/health
4. Raise issue at project repository with:
   - Screenshot of error
   - Steps to reproduce
   - Server log excerpt

---

## Appendix: Key Statutory Reference Dates

| Compliance | Frequency | Due |
|-----------|-----------|-----|
| GSTR-1 | Monthly | 11th |
| GSTR-3B | Monthly | 20th |
| TDS Deposit | Monthly | 7th (30th for March) |
| EPF Challan | Monthly | 15th |
| ESI Challan | Monthly | 15th |
| PT (TN) | Monthly | 20th |
| LWF (TN) | Half-yearly | 31 Jul / 31 Jan |
| TDS Return 26Q | Quarterly | 31 Jul / 31 Oct / 31 Jan / 31 May |
| Advance Tax | Quarterly | 15 Jun / 15 Sep / 15 Dec / 15 Mar |
| MSME Form I | Half-yearly | 31 Oct / 30 Apr |
| Form 16 | Annual | 15 June |
| GSTR-9 | Annual | 31 December |
| Bonus Payment | Annual | 30 November |

---

*This handbook is specific to MODERNEX STONES LLP operations. Review and update at the start of each financial year or when statutory rates change.*
