"""
sample_tx.py — One sample entry for every module.

Modules covered:
  Production   · Sales (PO/Invoice/Payment/PDC)
  HR/Payroll   · EPF · ESI · PT · Bonus
  Fixed Assets · TDS · GST filing periods
  Bank         · Journal Vouchers

Usage:
    python3 sample_tx.py              # seed everything
    python3 sample_tx.py --purge      # remove SAMPLE-* records only
    python3 sample_tx.py --purge --live  # remove SAMPLE-* AND all live data (confirms)
    python3 sample_tx.py --purgeall   # wipe ALL transactional data (no prompt)
"""

import sqlite3, json, sys
from pathlib import Path
from datetime import date, timedelta

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH    = SCRIPT_DIR.parent / "packages" / "api" / "data" / "modernex.db"

PURGE      = "--purge"    in sys.argv
PURGE_ALL  = "--purgeall" in sys.argv
PURGE_LIVE = "--live"     in sys.argv

def daysAgo(n):   return (date.today() - timedelta(days=n)).isoformat()
def daysAhead(n): return (date.today() + timedelta(days=n)).isoformat()

# Sample month / FY constants
SAMPLE_MONTH   = "2026-04"          # April 2026
SAMPLE_FY      = "2026-27"
SAMPLE_QUARTER = "Q1"

IDS = {
    # ── Production / Sales ──
    "customer" : "SAMPLE-CUST",
    "block"    : "SAMPLE-BLK",       # placeholder; real ID auto-generated
    "po"       : "SAMPLE-PO-001",
    "invoice"  : "SAMPLE-INV-001",
    "rcpt"     : "SAMPLE-PAY-001",   # customer receipt payment
    "pdc"      : "SAMPLE-PDC-001",
    "job"      : "SAMPLE-JOB",       # placeholder; real ID auto-generated
    # ── HR / Payroll ──
    "emp1"     : "SAMPLE-EMP-001",
    "emp2"     : "SAMPLE-EMP-002",
    "payrun"   : "SAMPLE-PAYRUN-001",
    # ── Assets / Bank ──
    "asset"    : "SAMPLE-ASSET-001",
    "bank"     : "SAMPLE-BANK-001",
    # ── Journals ──
    "jv1"      : "SAMPLE-JV-001",    # salary payment
    "jv2"      : "SAMPLE-JV-002",    # customer receipt
    "jv3"      : "SAMPLE-JV-003",    # PF journal
    "jv4"      : "SAMPLE-JV-004",    # salary accrual
    "jv5"      : "SAMPLE-JV-005",    # invoice accrual
    # ── TDS ──
    "tds_tx"   : "SAMPLE-TDS-001",
    "tds_ch"   : "SAMPLE-TDSCHAL-001",
}


# ── PURGE ALL ──────────────────────────────────────────────────────────────────
def purge_all(con):
    print("\n⚠️   Wiping ALL transactional data…")
    print("    (users · locations · COA · variety master · TDS sections preserved)\n")
    con.execute("PRAGMA foreign_keys = OFF")
    tables = [
        "production_job_outputs","production_job_inputs","production_jobs","production_jobs_legacy","inventory_moves",
        "product_blocks","product_slabs","product_tiles","product_cts","product_strips","product_kerbs",
        "product_cobbles","product_chips","product_monuments","product_monuments_legacy","product_spec_templates",
        "slabs_legacy","products",
        "post_dated_cheques","payments","debit_credit_notes","delivery_challan_items","delivery_challans",
        "invoice_items","invoice_items_legacy","invoices","purchase_order_receipts","purchase_orders",
        "customers","vendors",
        "journal_entry_cc","journal_entries","recurring_voucher_lines","recurring_vouchers","journal_vouchers",
        "tds_transactions","tds_challans",
        "gst_filing_periods","itc_ledger","gstr2b_records","gstr2b_imports",
        "interest_calc_log","msme_interest_log",
        "pt_challans_tn","epf_challans","esi_challans","lwf_contributions","lwf_challan_batches",
        "payroll_entries","payroll_runs",
        "bonus_entries","bonus_runs","gratuity_records",
        "leave_applications","leave_balances","employee_tax_declarations","employees",
        "asset_depreciation_log","fixed_assets",
        "bank_statement_lines","bank_accounts_reg","collection_accounts","budgets",
        "audit_log","backups","refresh_tokens",
    ]
    total = 0
    with con:
        for t in tables:
            try:
                n = con.execute(f"DELETE FROM {t}").rowcount
                total += n
                if n: print(f"   ✓ {t:<36} {n} row(s)")
            except Exception as e:
                print(f"   ⚠  {t}: {e}")
    con.execute("PRAGMA foreign_keys = ON")
    if total:
        print(f"\n✅  Wiped {total} row(s). Kept: users · locations · COA · variety master\n")
    else:
        print("\nℹ️   Nothing to delete — database was already clean.\n")


# ── PURGE SAMPLE only ─────────────────────────────────────────────────────────
def purge(con):
    print("\n🗑  Purging SAMPLE-* records…")
    con.execute("PRAGMA foreign_keys = OFF")
    with con:
        def d(stmt, *params):
            n = con.execute(stmt, params if params else []).rowcount
            if n: print(f"   ✓ {stmt.split()[2]}: {n} row(s)")

        # Compliance
        d("DELETE FROM tds_challans       WHERE id = ?",             IDS["tds_ch"])
        d("DELETE FROM tds_transactions   WHERE id = ?",             IDS["tds_tx"])
        d("DELETE FROM gst_filing_periods WHERE filed_by = ?",       "sample-tx")
        d(f"DELETE FROM pt_challans_tn    WHERE month = ?",          SAMPLE_MONTH)
        d(f"DELETE FROM esi_challans      WHERE month = ?",          SAMPLE_MONTH)
        d(f"DELETE FROM epf_challans      WHERE month = ?",          SAMPLE_MONTH)
        # Bank
        d("DELETE FROM bank_statement_lines WHERE bank_account_id LIKE ?", "SAMPLE-%")
        d("DELETE FROM bank_accounts_reg    WHERE id = ?",           IDS["bank"])
        # Fixed assets
        d("DELETE FROM asset_depreciation_log WHERE asset_id = ?",  IDS["asset"])
        d("DELETE FROM fixed_assets           WHERE id = ?",        IDS["asset"])
        # Journals
        d("DELETE FROM journal_entries  WHERE voucher_id LIKE ?",   "SAMPLE-%")
        d("DELETE FROM journal_vouchers WHERE id         LIKE ?",   "SAMPLE-%")
        # HR / Payroll
        d("DELETE FROM employee_tax_declarations WHERE employee_id LIKE ?", "SAMPLE-%")
        d("DELETE FROM gratuity_records          WHERE employee_id LIKE ?", "SAMPLE-%")
        d("DELETE FROM lwf_contributions         WHERE employee_id LIKE ?", "SAMPLE-%")
        d("DELETE FROM leave_applications        WHERE employee_id LIKE ?", "SAMPLE-%")
        d("DELETE FROM leave_balances            WHERE employee_id LIKE ?", "SAMPLE-%")
        d("DELETE FROM payroll_entries           WHERE run_id      LIKE ?", "SAMPLE-%")
        d("DELETE FROM payroll_runs              WHERE id = ?",     IDS["payrun"])
        d("DELETE FROM bonus_entries WHERE run_id IN (SELECT id FROM bonus_runs WHERE created_by='sample-tx')")
        d("DELETE FROM bonus_runs    WHERE created_by = ?",         "sample-tx")
        d("DELETE FROM employees     WHERE id LIKE ?",              "SAMPLE-%")
        # Production
        d("DELETE FROM inventory_moves        WHERE job_id     IN (SELECT id FROM production_jobs WHERE created_by='sample-tx')")
        d("DELETE FROM production_job_outputs WHERE job_id     IN (SELECT id FROM production_jobs WHERE created_by='sample-tx')")
        d("DELETE FROM production_job_inputs  WHERE job_id     IN (SELECT id FROM production_jobs WHERE created_by='sample-tx')")
        d("DELETE FROM production_jobs        WHERE created_by = ?", "sample-tx")
        # Sales — all invoices / POs for sample customer
        d("DELETE FROM debit_credit_notes    WHERE customer_id = ?",          IDS["customer"])
        d("DELETE FROM delivery_challan_items WHERE challan_id IN (SELECT id FROM delivery_challans WHERE customer_id = ?)", IDS["customer"])
        d("DELETE FROM delivery_challans     WHERE customer_id = ?",          IDS["customer"])
        d("DELETE FROM gstr2b_records        WHERE matched_po_id = ?",        IDS["po"])
        d("DELETE FROM purchase_order_receipts WHERE po_id = ?",              IDS["po"])
        d("DELETE FROM payments              WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id = ?)", IDS["customer"])
        d("DELETE FROM payments              WHERE po_id = ?",                IDS["po"])
        d("DELETE FROM post_dated_cheques    WHERE customer_id = ?",          IDS["customer"])
        d("DELETE FROM invoice_items         WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id = ?)", IDS["customer"])
        d("DELETE FROM invoices              WHERE customer_id = ?",          IDS["customer"])
        d("DELETE FROM purchase_orders       WHERE id = ?",                   IDS["po"])
        d("DELETE FROM customers             WHERE id = ?",                   IDS["customer"])
        # Products — all referencing tables then the products themselves
        d("DELETE FROM inventory_moves        WHERE product_id IN (SELECT id FROM products WHERE created_by='sample-tx')")
        d("DELETE FROM delivery_challan_items  WHERE product_id IN (SELECT id FROM products WHERE created_by='sample-tx')")
        d("DELETE FROM invoice_items           WHERE product_id IN (SELECT id FROM products WHERE created_by='sample-tx')")
        d("DELETE FROM production_job_inputs   WHERE product_id IN (SELECT id FROM products WHERE created_by='sample-tx')")
        d("DELETE FROM production_job_outputs  WHERE product_id IN (SELECT id FROM products WHERE created_by='sample-tx')")
        for vt in ("product_blocks","product_slabs","product_tiles","product_cts",
                   "product_strips","product_kerbs","product_cobbles","product_chips",
                   "product_monuments","product_monuments_legacy"):
            d(f"DELETE FROM {vt} WHERE product_id IN (SELECT id FROM products WHERE created_by='sample-tx')")
        d("DELETE FROM products WHERE created_by = ?", "sample-tx")
        # Vendor created by seed (must come after PO / TDS / asset are gone)
        d("DELETE FROM vendors WHERE created_by = ?", "sample-tx")
    con.execute("PRAGMA foreign_keys = ON")
    print("\n✅  Sample records purged. Live data untouched.\n")


# ── SEED ───────────────────────────────────────────────────────────────────────
def seed(con):
    print("\n🌱  Seeding one sample entry per module…\n")

    vendor = con.execute("SELECT id FROM vendors WHERE id='V001'").fetchone()
    if not vendor:
        con.execute("""
            INSERT INTO vendors (id, name, gstin, state, address, contact, email, type, created_by)
            VALUES ('V001','M/s. VATSIN GRANITE','33AABCV1234A1Z5','Tamil Nadu',
                    'Survey No. 42, Hosur Road, Krishnagiri - 635001',
                    '9994561230','vatsin.granite@example.com','Quarry','sample-tx')
        """)
        print("   ✓ Vendor      V001  VATSIN GRANITE (re-created)")

    if con.execute("SELECT 1 FROM customers WHERE id=?", (IDS["customer"],)).fetchone():
        print("⚠️  Sample data already exists. Run with --purge first.\n"); sys.exit(0)

    # auto-ID helpers
    def next_prod_id():
        r = con.execute("SELECT id FROM products WHERE id LIKE 'PRD-%' ORDER BY id DESC LIMIT 1").fetchone()
        return f"PRD-{int(r[0][4:])+1:06d}" if r else "PRD-000001"

    def next_job_id():
        r = con.execute("SELECT id FROM production_jobs WHERE id LIKE 'JOB-%' ORDER BY id DESC LIMIT 1").fetchone()
        return f"JOB-{int(r[0][4:])+1:06d}" if r else "JOB-000001"

    # ══════════════════════════════════════════════════════════════
    # SECTION A — PRODUCTION
    # ══════════════════════════════════════════════════════════════
    print("  ── Production ──")

    # A1. Raw block at Raw Yard  (2440×1220×1220 mm, ≈44.3 CFT)
    block_id = next_prod_id()
    L, W, H  = 2.440, 1.220, 1.220
    block_cft = round(L * W * H * 35.3147, 2)
    con.execute("""
        INSERT INTO products
          (id, kind, variety, hsn, uom, lot_id, current_location_id,
           rate_paise, stock, active, created_by)
        VALUES (?, 'block','Paradiso Classic','2516','cft',
                'LOT-001','RAW_YARD', 50000, 1, 1, 'sample-tx')
    """, (block_id,))
    con.execute(
        "INSERT INTO product_blocks (product_id, length_m, width_m, height_m, cft) VALUES (?,?,?,?,?)",
        (block_id, L, W, H, block_cft))
    print(f"   ✓ Block       {block_id}  Paradiso Classic  {int(L*1000)}×{int(W*1000)}×{int(H*1000)} mm  ({block_cft} CFT)  @ Raw Yard")

    # A2. Cut job → 15 slabs → Gangsaw Out
    job_id  = next_job_id()
    slab_id = next_prod_id()
    SQFT = 44.78; RATE_PS = 42000; SLABS = 15
    con.execute("""
        INSERT INTO production_jobs
          (id, lot_id, stage, status, date, labour_paise, power_paise,
           consumables_paise, created_by)
        VALUES (?, 'LOT-001','cut','Complete', ?, 150000, 50000, 0, 'sample-tx')
    """, (job_id, daysAgo(10)))
    con.execute("UPDATE products SET stock = stock - 1 WHERE id=?", (block_id,))
    con.execute(
        "INSERT INTO production_job_inputs (job_id, product_id, qty_consumed, unit_cost_paise) VALUES (?,?,1,50000)",
        (job_id, block_id))
    con.execute("""
        INSERT INTO products
          (id, kind, variety, hsn, uom, grade, lot_id, current_location_id,
           rate_paise, stock, source_job_id, source_product_id, active, created_by)
        VALUES (?, 'slab','Paradiso Classic','2516','sqft','A','LOT-001',
                'GANGSAW_OUT', ?, ?, ?, ?, 1, 'sample-tx')
    """, (slab_id, RATE_PS, SLABS, job_id, block_id))
    con.execute(
        "INSERT INTO product_slabs (product_id, size_lw, thickness_mm, sqft) VALUES (?,'2600×1600',20,?)",
        (slab_id, SQFT))
    con.execute(
        "INSERT INTO production_job_outputs (job_id, product_id, qty_produced, unit_cost_paise) VALUES (?,?,?,0)",
        (job_id, slab_id, SLABS))
    print(f"   ✓ Cut Job     {job_id}  1 block → {SLABS} slabs @ Gangsaw Out")

    # ══════════════════════════════════════════════════════════════
    # SECTION B — SALES  (PO · Invoice · Payment · PDC)
    # ══════════════════════════════════════════════════════════════
    print("\n  ── Sales ──")

    # B1. Customer
    con.execute("""
        INSERT INTO customers
          (id, name, gstin, state, address, contact, email, credit_days, created_by)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (IDS["customer"], "Rajan Tiles & Marbles", "33AABCR1234A1Z5",
          "Tamil Nadu", "12 Gandhi Nagar, Krishnagiri 635001",
          "9876543210", "rajan.tiles@example.com", 30, "sample-tx"))
    print(f"   ✓ Customer    {IDS['customer']}  Rajan Tiles & Marbles")

    # B2. Purchase Order  (4 blocks 200 CFT @ ₹500/CFT)
    PO_TAXABLE = 200 * 50000; PO_GST = round(PO_TAXABLE * 0.05)
    PO_TOTAL   = PO_TAXABLE + 400000 + PO_GST   # +transport ₹4,000
    con.execute("""
        INSERT INTO purchase_orders
          (id, date, vendor_id, variety, blocks, cft, rate_per_cft_paise,
           transport_paise, taxable_paise, gst_paise, total_paise,
           status, notes, created_by)
        VALUES (?,?,'V001','Paradiso Classic',4,200,50000,400000,?,?,?,
                'received','Sample PO','sample-tx')
    """, (IDS["po"], daysAgo(25), PO_TAXABLE, PO_GST, PO_TOTAL))
    print(f"   ✓ PO          {IDS['po']}  200 CFT @ ₹500  Total ₹{PO_TOTAL//100:,}")

    # B3. Slab product for invoice (already at Finished Yard)
    inv_prod = next_prod_id()
    con.execute("""
        INSERT INTO products
          (id, kind, variety, hsn, uom, grade, lot_id, current_location_id,
           rate_paise, stock, active, created_by)
        VALUES (?, 'slab','Paradiso Classic','2516','sqft','A',
                'LOT-001','FINISHED_YARD', ?, 10, 1, 'sample-tx')
    """, (inv_prod, RATE_PS))
    con.execute(
        "INSERT INTO product_slabs (product_id, size_lw, thickness_mm, sqft) VALUES (?,'2600×1600',18,?)",
        (inv_prod, SQFT))

    # B4. Invoice (3 slabs, TN→TN CGST+SGST 6%+6%)
    QTY = 3; LINE = round(SQFT * QTY * RATE_PS)
    CGST = round(LINE * 0.06); SGST = round(LINE * 0.06)
    INV_TOTAL = LINE + CGST + SGST
    con.execute("""
        INSERT INTO invoices
          (id, date, customer_id, customer_name, customer_state, customer_gstin,
           gross_paise, discount_paise, taxable_paise,
           cgst_paise, sgst_paise, igst_paise, total_paise,
           paid, due_date, notes, created_by)
        VALUES (?,?,?,'Rajan Tiles & Marbles','Tamil Nadu','33AABCR1234A1Z5',
                ?,0,?,?,?,0,?,0,?,'Sample invoice','sample-tx')
    """, (IDS["invoice"], daysAgo(20), IDS["customer"],
          LINE, LINE, CGST, SGST, INV_TOTAL, daysAhead(10)))
    con.execute("""
        INSERT INTO invoice_items
          (invoice_id, line_no, product_id, product_kind, variety, hsn, uom,
           uom_qty, qty, rate_paise, line_total_paise, dimension_snapshot, grade)
        VALUES (?,1,?,'slab','Paradiso Classic','2516','sqft',?,?,?,?,?,'A')
    """, (IDS["invoice"], inv_prod, SQFT, QTY, RATE_PS, LINE,
          json.dumps({"size": "2600×1600", "thickness_mm": 18})))
    print(f"   ✓ Invoice     {IDS['invoice']}  3 slabs  Total ₹{INV_TOTAL//100:,}")

    # B5. Partial payment ₹50,000 NEFT
    PAY = 5_000_000
    con.execute("""
        INSERT INTO payments
          (id, date, type, invoice_id, party, amount_paise, mode, utr, notes, created_by)
        VALUES (?,?,'receipt',?,'Rajan Tiles & Marbles',?,'NEFT',
                'SBIN0SAMPLE001','Part payment','sample-tx')
    """, (IDS["rcpt"], daysAgo(5), IDS["invoice"], PAY))
    print(f"   ✓ Payment     {IDS['rcpt']}  ₹50,000 NEFT")

    # B6. PDC for balance
    PDC = INV_TOTAL - PAY
    con.execute("""
        INSERT INTO post_dated_cheques
          (id, type, cheque_no, bank_name, branch, amount_paise, cheque_date,
           customer_id, invoice_id, status, notes, created_by)
        VALUES (?,  'received','CHQ-SAMPLE-001','Canara Bank','Krishnagiri',
                ?,?,?,?,'pending','Balance cheque','sample-tx')
    """, (IDS["pdc"], PDC, daysAhead(15), IDS["customer"], IDS["invoice"]))
    print(f"   ✓ PDC         {IDS['pdc']}  ₹{PDC//100:,} due {daysAhead(15)}")

    # ══════════════════════════════════════════════════════════════
    # SECTION C — HR / PAYROLL
    # ══════════════════════════════════════════════════════════════
    print("\n  ── HR & Payroll ──")

    # C1. Employees
    con.execute("""
        INSERT INTO employees
          (id, name, designation, department, joining_date,
           pan, uan, bank_account, bank_ifsc,
           basic_salary_paise, hra_paise, conveyance_paise, other_allowance_paise,
           pf_applicable, esi_applicable, pt_applicable, active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,1,1)
    """, (IDS["emp1"], "Arun Kumar", "Production Manager", "Production",
          "2023-06-01", "ABCPA1234D", "101234567890",
          "30291234567", "SBIN0001234",
          2_500_000, 1_000_000, 200_000, 0))
    con.execute("""
        INSERT INTO employees
          (id, name, designation, department, joining_date,
           pan, uan, esic_no, bank_account, bank_ifsc,
           basic_salary_paise, hra_paise, conveyance_paise, other_allowance_paise,
           pf_applicable, esi_applicable, pt_applicable, active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,1)
    """, (IDS["emp2"], "Ravi Kumar", "Machine Operator", "Production",
          "2024-01-10", "BCDPB5678E", "201234567890", "ESI-SAMPLE-001",
          "30297654321", "SBIN0001234",
          1_200_000, 400_000, 0, 0))
    print(f"   ✓ Employee    {IDS['emp1']}  Arun Kumar  (Manager, Basic ₹25,000)")
    print(f"   ✓ Employee    {IDS['emp2']}  Ravi Kumar  (Operator, Basic ₹12,000)")

    # Leave balances (current calendar year)
    yr = date.today().year
    for emp, (el, cl) in [(IDS["emp1"], (15, 8)), (IDS["emp2"], (12, 6))]:
        for code, quota in [("EL", el), ("CL", cl)]:
            con.execute("""
                INSERT INTO leave_balances
                  (employee_id, leave_code, year, opening, accrued, taken, encashed)
                VALUES (?,?,?,0,?,0,0)
            """, (emp, code, yr, quota))

    # Leave application (Ravi took 2 EL days)
    con.execute("""
        INSERT INTO leave_applications
          (employee_id, leave_code, from_date, to_date, days,
           reason, status, approved_by, approved_at)
        VALUES (?,  'EL', ?, ?, 2,
                'Personal work', 'approved', 'admin',
                datetime('now','-5 days'))
    """, (IDS["emp2"], daysAgo(15), daysAgo(14)))
    con.execute("UPDATE leave_balances SET taken = taken + 2 WHERE employee_id=? AND leave_code='EL' AND year=?",
                (IDS["emp2"], yr))
    print(f"   ✓ Leave       {IDS['emp2']} — 2 EL days approved")

    # C2. Payroll Run for SAMPLE_MONTH
    # Emp1: gross 37L paise, pf 3L, pt 20000, net 34.8L
    G1 = 3_700_000; PF1E = 300_000; PF1R = 300_000; PT1 = 20_000
    D1 = PF1E + PT1; N1 = G1 - D1
    # Emp2: gross 16L, pf 1.44L, esi 12000, pt 15000, net ~14.29L
    G2 = 1_600_000; PF2E = 144_000; PF2R = 144_000
    ESI2E = 12_000; ESI2R = 52_000; PT2 = 15_000
    D2 = PF2E + ESI2E + PT2; N2 = G2 - D2

    con.execute("""
        INSERT INTO payroll_runs
          (id, month, status, total_gross_paise,
           total_pf_employee_paise, total_pf_employer_paise,
           total_esi_employee_paise, total_esi_employer_paise,
           total_pt_paise, total_net_paise)
        VALUES (?,?,  'processed', ?,  ?,?,  ?,?,  ?,?)
    """, (IDS["payrun"], SAMPLE_MONTH,
          G1+G2, PF1E+PF2E, PF1R+PF2R, ESI2E, ESI2R, PT1+PT2, N1+N2))

    con.execute("""
        INSERT INTO payroll_entries
          (run_id, employee_id, days_worked,
           basic_paise, hra_paise, conveyance_paise, other_allowance_paise, gross_paise,
           pf_employee_paise, pf_employer_paise, pt_paise, total_deductions_paise, net_paise, paid)
        VALUES (?,?,26, ?,?,?,?,?,  ?,?,?,?,?,1)
    """, (IDS["payrun"], IDS["emp1"],
          2_500_000, 1_000_000, 200_000, 0, G1,
          PF1E, PF1R, PT1, D1, N1))
    con.execute("""
        INSERT INTO payroll_entries
          (run_id, employee_id, days_worked,
           basic_paise, hra_paise, conveyance_paise, other_allowance_paise, gross_paise,
           pf_employee_paise, pf_employer_paise,
           esi_employee_paise, esi_employer_paise,
           pt_paise, total_deductions_paise, net_paise, paid)
        VALUES (?,?,26, ?,?,?,?,?,  ?,?,  ?,?,  ?,?,?,1)
    """, (IDS["payrun"], IDS["emp2"],
          1_200_000, 400_000, 0, 0, G2,
          PF2E, PF2R, ESI2E, ESI2R, PT2, D2, N2))
    print(f"   ✓ Payroll     {IDS['payrun']}  {SAMPLE_MONTH}  Gross ₹{(G1+G2)//100:,}  Net ₹{(N1+N2)//100:,}")

    # C3. EPF Challan
    WAGES_PF = 2_500_000 + 1_200_000    # basic wages for PF
    EMP_PF   = PF1E + PF2E              # employee share
    EPS      = round(WAGES_PF * 0.0833) # employer EPS 8.33%
    EPF_ER   = round(WAGES_PF * 0.0367) # employer EPF 3.67%
    EDLI     = round(WAGES_PF * 0.005)
    ADMIN    = round(WAGES_PF * 0.005)
    EPF_TOTAL = EMP_PF + EPS + EPF_ER + EDLI + ADMIN
    con.execute("""
        INSERT INTO epf_challans
          (month, trrn, challan_date,
           total_wages_paise, employee_pf_paise,
           employer_epf_paise, eps_paise, edli_paise, admin_charge_paise,
           total_paise, status)
        VALUES (?,  'TRRN-SAMPLE-001', ?,
                ?,  ?,
                ?,?,?,?,
                ?, 'paid')
    """, (SAMPLE_MONTH, daysAgo(5),
          WAGES_PF, EMP_PF, EPF_ER, EPS, EDLI, ADMIN, EPF_TOTAL))
    print(f"   ✓ EPF Challan {SAMPLE_MONTH}  Employee PF ₹{EMP_PF//100:,}  Total ₹{EPF_TOTAL//100:,}")

    # C4. ESI Challan
    ESI_WAGES = G2  # only Emp2 is ESI applicable
    ESI_TOTAL = ESI2E + ESI2R
    con.execute("""
        INSERT INTO esi_challans
          (month, challan_no, challan_date,
           total_wages_paise, employee_esi_paise, employer_esi_paise,
           total_paise, status)
        VALUES (?, 'ESI-SAMPLE-001', ?,  ?,?,?,?, 'paid')
    """, (SAMPLE_MONTH, daysAgo(5), ESI_WAGES, ESI2E, ESI2R, ESI_TOTAL))
    print(f"   ✓ ESI Challan {SAMPLE_MONTH}  Total ₹{ESI_TOTAL//100:,}")

    # C5. PT Challan (Tamil Nadu)
    con.execute("""
        INSERT INTO pt_challans_tn
          (month, challan_no, challan_date, employee_count, total_pt_paise, status)
        VALUES (?, 'PT-SAMPLE-001', ?, 2, ?, 'paid')
    """, (SAMPLE_MONTH, daysAgo(5), PT1+PT2))
    print(f"   ✓ PT Challan  {SAMPLE_MONTH}  ₹{(PT1+PT2)//100:,}")

    # C6. Bonus Run (FY 2025-26)
    BONUS_RATE = 8.33
    B1 = round(2_500_000 * 12 * BONUS_RATE / 100)
    B2 = round(1_200_000 * 12 * BONUS_RATE / 100)
    bonus_run = con.execute("""
        INSERT INTO bonus_runs
          (fy, bonus_rate_pct, calc_basis, status, total_paise, notes, created_by)
        VALUES ('2025-26', 8.33, 'basic', 'processed', ?,
                'Sample bonus run FY 2025-26', 'sample-tx')
        RETURNING id
    """, (B1+B2,)).fetchone()
    run_id = bonus_run[0]
    for emp, anb, bonus in [(IDS["emp1"], 2_500_000*12, B1),
                             (IDS["emp2"], 1_200_000*12, B2)]:
        con.execute("""
            INSERT INTO bonus_entries
              (run_id, employee_id, monthly_basic, annual_basic, months_worked, bonus_paise, eligible, paid)
            VALUES (?,?,?,?,12,?,1,1)
        """, (run_id, emp, 2_500_000 if emp == IDS["emp1"] else 1_200_000, anb, bonus))
    print(f"   ✓ Bonus Run   FY 2025-26  8.33%  Total ₹{(B1+B2)//100:,}")

    # ══════════════════════════════════════════════════════════════
    # SECTION D — FIXED ASSETS
    # ══════════════════════════════════════════════════════════════
    print("\n  ── Fixed Assets ──")
    con.execute("""
        INSERT INTO fixed_assets
          (id, name, category, it_block, purchase_date, purchase_cost_paise,
           description, vendor_id, location, serial_no,
           depreciation_method, depreciation_rate_pct, account_id, disposed)
        VALUES (?,?,  'Plant & Machinery','Plant & Machinery',
                ?, 150_000_000,
                'Multi-wire gangsaw for cutting granite blocks',
                'V001', 'Production Floor', 'GS-2024-001',
                'WDV', 15.0, 'ACC-PLANT', 0)
    """, (IDS["asset"], "Multi-Wire Gangsaw Machine", daysAgo(365)))
    print(f"   ✓ Fixed Asset {IDS['asset']}  Gangsaw Machine  ₹15,00,000  WDV 15%")

    # ══════════════════════════════════════════════════════════════
    # SECTION E — BANK
    # ══════════════════════════════════════════════════════════════
    print("\n  ── Bank ──")
    con.execute("""
        INSERT INTO bank_accounts_reg
          (id, name, account_no, ifsc, bank_name, branch,
           opening_balance_paise, opening_date, account_id, active)
        VALUES (?,  'SBI Current A/c – Production',
                '30291234567', 'SBIN0001234', 'State Bank of India', 'Krishnagiri',
                5_000_000_00, ?,  'ACC-BANK1', 1)
    """, (IDS["bank"], f"{date.today().year}-04-01"))
    # Two statement lines
    con.execute("""
        INSERT INTO bank_statement_lines
          (bank_account_id, txn_date, value_date, description, ref_no,
           credit_paise, running_balance_paise, reconciled)
        VALUES (?,?,?,  'NEFT Cr — Rajan Tiles', 'SBIN0SAMPLE001',
                5_000_000, 50_000_000, 1)
    """, (IDS["bank"], daysAgo(5), daysAgo(5)))
    con.execute("""
        INSERT INTO bank_statement_lines
          (bank_account_id, txn_date, value_date, description, ref_no,
           debit_paise, running_balance_paise, reconciled)
        VALUES (?,?,?,  'NEFT Dr — Salary Apr-2026', 'SAL-APR26',
                ?, ?, 0)
    """, (IDS["bank"], daysAgo(2), daysAgo(2), N1+N2, 50_000_000-(N1+N2)))
    print(f"   ✓ Bank Acct   {IDS['bank']}  SBI Current + 2 statement lines")

    # ══════════════════════════════════════════════════════════════
    # SECTION F — JOURNAL VOUCHERS
    # ══════════════════════════════════════════════════════════════
    print("\n  ── Journal Vouchers ──")

    def jv(jv_id, vtype, narration, lines):
        con.execute("""
            INSERT INTO journal_vouchers (id, date, narration, voucher_type, created_by)
            VALUES (?,?,?,?,'sample-tx')
        """, (jv_id, daysAgo(2), narration, vtype))
        for acc, dr, cr in lines:
            con.execute("""
                INSERT INTO journal_entries (voucher_id, account_id, debit_paise, credit_paise)
                VALUES (?,?,?,?)
            """, (jv_id, acc, dr, cr))

    # JV1 — Salary payment (bank → salary payable)
    jv(IDS["jv1"], "payment", f"Salary payment {SAMPLE_MONTH}", [
        ("ACC-SALP", N1+N2, 0),
        ("ACC-BANK1", 0,    N1+N2),
    ])
    print(f"   ✓ JV-001      Payment  Salary {SAMPLE_MONTH}  ₹{(N1+N2)//100:,}")

    # JV2 — Customer receipt (bank ← debtors)
    jv(IDS["jv2"], "receipt", "NEFT receipt — Rajan Tiles SAMPLE-INV-001", [
        ("ACC-BANK1", PAY, 0),
        ("ACC-DEB",   0,   PAY),
    ])
    print(f"   ✓ JV-002      Receipt  Customer NEFT  ₹{PAY//100:,}")

    # JV3 — Employer PF provision
    jv(IDS["jv3"], "journal", f"PF employer provision {SAMPLE_MONTH}", [
        ("ACC-PFEX", PF1R+PF2R, 0),
        ("ACC-PFP",  0,          PF1R+PF2R),
    ])
    print(f"   ✓ JV-003      Journal  PF provision  ₹{(PF1R+PF2R)//100:,}")

    # JV4 — Salary accrual (expense → payable + deductions)
    jv(IDS["jv4"], "journal", f"Salary accrual {SAMPLE_MONTH}", [
        ("ACC-SAL",  G1+G2, 0),            # DR Salaries expense (gross)
        ("ACC-SALP", 0,     N1+N2),        # CR Salary payable (net take-home)
        ("ACC-PFP",  0,     PF1E+PF2E),   # CR PF payable (employee deduction)
        ("ACC-ESIP", 0,     ESI2E),        # CR ESI payable (employee deduction)
        ("ACC-PTP",  0,     PT1+PT2),      # CR PT payable
    ])
    print(f"   ✓ JV-004      Journal  Salary accrual  gross ₹{(G1+G2)//100:,}  net ₹{(N1+N2)//100:,}")

    # JV5 — Invoice accrual (debtors ← sales + GST payable)
    jv(IDS["jv5"], "journal", f"Invoice accrual {IDS['invoice']}", [
        ("ACC-DEB",   INV_TOTAL, 0),       # DR Sundry Debtors
        ("ACC-SALES", 0,         LINE),    # CR Sales (taxable)
        ("ACC-CGST",  0,         CGST),    # CR CGST Payable
        ("ACC-SGST",  0,         SGST),    # CR SGST Payable
    ])
    print(f"   ✓ JV-005      Journal  Invoice accrual  ₹{INV_TOTAL//100:,}  (debtors outstanding ₹{(INV_TOTAL-PAY)//100:,})")

    # ══════════════════════════════════════════════════════════════
    # SECTION G — TDS
    # ══════════════════════════════════════════════════════════════
    print("\n  ── TDS ──")
    TDS_GROSS = 10_000_000    # ₹1,00,000 contractor payment
    TDS_AMT   = round(TDS_GROSS * 0.02)   # 2% under 194C

    con.execute("""
        INSERT INTO tds_transactions
          (id, vendor_id, po_id, section,
           payment_date, gross_amount_paise, tds_rate_pct, tds_amount_paise,
           deposited, fy, quarter, notes, created_by)
        VALUES (?,  'V001', ?,  '194C',
                ?,  ?,  2.0,  ?,
                1,  ?,  ?,  'TDS on contractor payment — VATSIN GRANITE', 'sample-tx')
    """, (IDS["tds_tx"], IDS["po"],
          daysAgo(20), TDS_GROSS, TDS_AMT,
          SAMPLE_FY, SAMPLE_QUARTER))
    con.execute("""
        INSERT INTO tds_challans
          (id, challan_date, bsr_code, challan_serial_no,
           section, amount_paise, fy, quarter)
        VALUES (?,  ?,  '0002560', 'CHL-SAMPLE-001',
                '194C', ?,  ?,  ?)
    """, (IDS["tds_ch"], daysAgo(15), TDS_AMT, SAMPLE_FY, SAMPLE_QUARTER))
    print(f"   ✓ TDS         {IDS['tds_tx']}  194C  ₹{TDS_GROSS//100:,} → TDS ₹{TDS_AMT//100:,}")
    print(f"   ✓ TDS Challan {IDS['tds_ch']}  Deposited ₹{TDS_AMT//100:,}")

    # ══════════════════════════════════════════════════════════════
    # SECTION H — GST COMPLIANCE
    # ══════════════════════════════════════════════════════════════
    print("\n  ── GST Compliance ──")
    gst_periods = [
        ("2026-27", "Apr-2026", "GSTR1",  "2026-05-11", daysAgo(12), "filed"),
        ("2026-27", "Apr-2026", "GSTR3B", "2026-05-20", daysAgo(2),  "filed"),
        ("2026-27", "May-2026", "GSTR1",  "2026-06-11", None,        "pending"),
        ("2026-27", "May-2026", "GSTR3B", "2026-06-20", None,        "pending"),
    ]
    for fy, period, rtype, due, filed, status in gst_periods:
        con.execute("""
            INSERT OR IGNORE INTO gst_filing_periods
              (fy, period, return_type, due_date, filed_date, filed_by, status)
            VALUES (?,?,?,?,?,?,?)
        """, (fy, period, rtype, due, filed, "sample-tx", status))
        mark = "✓ filed" if filed else "⏳ pending"
        print(f"   {mark}  {period} {rtype} (due {due})")

    print()
    print("✅  All modules seeded.\n")


# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode = WAL")

    if PURGE_ALL:
        purge_all(con)
    elif PURGE:
        con.execute("PRAGMA foreign_keys = ON")
        purge(con)
        if PURGE_LIVE:
            print("⚠️   --live flag detected. This will wipe ALL live transactional data.")
            print("    Master data (users · locations · COA · variety master) is preserved.")
            ans = input("    Type YES to confirm: ").strip()
            if ans == "YES":
                purge_all(con)
            else:
                print("    Aborted — live data untouched.")
    else:
        con.execute("PRAGMA foreign_keys = ON")
        with con:
            seed(con)

    con.close()


if __name__ == "__main__":
    main()
