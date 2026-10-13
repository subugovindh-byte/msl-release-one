import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error.js';
import { nextEmployeeId, nextPayrollRunId } from '../services/idGenerator.js';
import { calcPT, calcPF, calcESI, lwfAmount, calcGratuity, calcBonus, calcHRAExemption, calcTDSSalary }
  from '../services/payrollCalc.js';
import { today as todayIST } from '../services/dates.js';

export const payrollRouter = Router();
payrollRouter.use(authenticate);

// ─── GET /payroll/employees ──────────────────────────────────────────────────
payrollRouter.get('/employees', (req, res) => {
  const { active } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM employees WHERE 1=1';
  const params = [];
  if (active !== undefined) { sql += ' AND active = ?'; params.push(active === 'false' ? 0 : 1); }
  sql += ' ORDER BY name';
  res.json({ employees: db.prepare(sql).all(...params) });
});

// ─── POST /payroll/employees ─────────────────────────────────────────────────
payrollRouter.post('/employees', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { name, designation, department, joining_date, pan, uan, esic_no,
            bank_account, bank_ifsc, salary_type, basic_salary_paise,
            hra_paise, conveyance_paise, other_allowance_paise,
            pf_applicable, esi_applicable, pt_applicable } = req.body;
    if (!name || !joining_date || !basic_salary_paise)
      return res.status(400).json({ error: 'name, joining_date, basic_salary_paise required' });

    const id = nextEmployeeId();
    db.prepare(`
      INSERT INTO employees
        (id, name, designation, department, joining_date, pan, uan, esic_no,
         bank_account, bank_ifsc, salary_type, basic_salary_paise, hra_paise,
         conveyance_paise, other_allowance_paise, pf_applicable, esi_applicable, pt_applicable)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, name, designation || null, department || 'General', joining_date,
           pan || null, uan || null, esic_no || null, bank_account || null, bank_ifsc || null,
           salary_type || 'monthly', basic_salary_paise, hra_paise || 0, conveyance_paise || 0,
           other_allowance_paise || 0, pf_applicable !== false ? 1 : 0,
           esi_applicable ? 1 : 0, pt_applicable !== false ? 1 : 0);

    // Initialise leave balances for current year
    const year = new Date().getFullYear();
    const leaveTypes = db.prepare('SELECT code, annual_quota FROM leave_types WHERE active=1').all();
    const insLB = db.prepare(`INSERT OR IGNORE INTO leave_balances (employee_id, leave_code, year, opening, accrued) VALUES (?,?,?,0,?)`);
    for (const lt of leaveTypes) insLB.run(id, lt.code, year, lt.annual_quota);

    res.status(201).json({ employee: db.prepare('SELECT * FROM employees WHERE id = ?').get(id) });
  } catch (err) { next(err); }
});

// ─── PATCH /payroll/employees/:id ───────────────────────────────────────────
payrollRouter.patch('/employees/:id', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!emp) throw new NotFoundError('Employee not found');
    const fields = ['name','designation','department','pan','uan','esic_no','bank_account','bank_ifsc',
                    'salary_type','basic_salary_paise','hra_paise','conveyance_paise','other_allowance_paise',
                    'pf_applicable','esi_applicable','pt_applicable','active','leaving_date'];
    const sets = [], params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    db.prepare(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ employee: db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id) });
  } catch (err) { next(err); }
});

// ─── GET /payroll/runs ────────────────────────────────────────────────────────
payrollRouter.get('/runs', requireRole('admin', 'accounts'), (req, res) => {
  const db = getDb();
  res.json({ runs: db.prepare('SELECT * FROM payroll_runs ORDER BY month DESC').all() });
});

// ─── POST /payroll/runs ── process payroll for a month ───────────────────────
payrollRouter.post('/runs', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { month, overrides } = req.body;
    if (!month) return res.status(400).json({ error: 'month required (YYYY-MM)' });

    const existing = db.prepare('SELECT id FROM payroll_runs WHERE month = ?').get(month);
    if (existing) return res.status(409).json({ error: 'Payroll run already exists for this month' });

    const employees = db.prepare('SELECT * FROM employees WHERE active = 1').all();
    if (!employees.length) return res.status(400).json({ error: 'No active employees' });

    const runId = nextPayrollRunId(month);
    const entries = [];
    let totalGross = 0, totalPfEmp = 0, totalPfEr = 0, totalEsiEmp = 0, totalEsiEr = 0, totalPt = 0, totalNet = 0;

    db.transaction(() => {
      db.prepare(`INSERT INTO payroll_runs (id, month) VALUES (?,?)`).run(runId, month);

      for (const emp of employees) {
        const daysWorked = overrides?.[emp.id]?.days_worked ?? 26;
        const workRatio = daysWorked / 26;

        const basic = Math.round(emp.basic_salary_paise * workRatio);
        const hra   = Math.round(emp.hra_paise * workRatio);
        const conv  = Math.round(emp.conveyance_paise * workRatio);
        const other = Math.round(emp.other_allowance_paise * workRatio);
        const gross = basic + hra + conv + other;

        const pf  = calcPF(basic, emp.pf_applicable);
        const esi = calcESI(gross, emp.esi_applicable);
        const pt  = emp.pt_applicable ? calcPT(gross) : 0;

        // TDS on salary (monthly): everyone is taxed, on the new regime unless their
        // declaration opts for the old one; projected from this month's pay.
        const fy = (() => {
          const [y, m] = month.split('-').map(Number);
          const fyStart = m >= 4 ? y : y - 1;
          return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
        })();
        const decl = db.prepare('SELECT * FROM employee_tax_declarations WHERE employee_id=? AND fy=?').get(emp.id, fy);
        const tds = calcTDSSalary({
          grossAnnual: gross * 12,
          regime: decl?.tax_regime || 'new',
          hraExemption: decl ? calcHRAExemption(basic * 12, hra * 12, decl.hra_rent_paid_annual,
                                                decl.hra_city_type === 'metro') : 0,
          professionalTax: pt * 12,
          sec80c: decl?.sec_80c_paise, sec80dSelf: decl?.sec_80d_self_paise,
          sec80dParents: decl?.sec_80d_parents_paise, sec80ccd1b: decl?.sec_80ccd1b_paise,
          housingLoanInterest: decl?.housing_loan_interest_paise, otherIncome: decl?.other_income_paise,
        }).monthlyTDS;

        const deductions = pf.employee + esi.employee + pt + tds;
        const net = gross - deductions;

        db.prepare(`
          INSERT INTO payroll_entries
            (run_id, employee_id, days_worked, basic_paise, hra_paise, conveyance_paise,
             other_allowance_paise, gross_paise, pf_employee_paise, pf_employer_paise,
             esi_employee_paise, esi_employer_paise, pt_paise, tds_paise,
             total_deductions_paise, net_paise)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(runId, emp.id, daysWorked, basic, hra, conv, other, gross,
               pf.employee, pf.employer, esi.employee, esi.employer, pt, tds, deductions, net);

        totalGross += gross; totalPfEmp += pf.employee; totalPfEr += pf.employer;
        totalEsiEmp += esi.employee; totalEsiEr += esi.employer; totalPt += pt; totalNet += net;
        entries.push({ employee_id: emp.id, name: emp.name, gross, net, pfEmp: pf.employee, pt, tds });
      }

      db.prepare(`
        UPDATE payroll_runs SET
          status = 'processed', total_gross_paise = ?, total_pf_employee_paise = ?,
          total_pf_employer_paise = ?, total_esi_employee_paise = ?, total_esi_employer_paise = ?,
          total_pt_paise = ?, total_net_paise = ?
        WHERE id = ?
      `).run(totalGross, totalPfEmp, totalPfEr, totalEsiEmp, totalEsiEr, totalPt, totalNet, runId);
    })();

    res.status(201).json({
      run: db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId),
      entries,
    });
  } catch (err) { next(err); }
});

// ─── GET /payroll/runs/:id ────────────────────────────────────────────────────
payrollRouter.get('/runs/:id', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(req.params.id);
    if (!run) throw new NotFoundError('Payroll run not found');
    const entries = db.prepare(`
      SELECT pe.*, e.name AS employee_name, e.designation, e.pan, e.uan, e.bank_account, e.bank_ifsc
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      WHERE pe.run_id = ?
      ORDER BY e.name
    `).all(req.params.id);
    res.json({ run, entries });
  } catch (err) { next(err); }
});

// ─── PATCH /payroll/runs/:id/mark-paid ───────────────────────────────────────
payrollRouter.patch('/runs/:id/mark-paid', requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run('paid', req.params.id);
    db.prepare('UPDATE payroll_entries SET paid = 1 WHERE run_id = ?').run(req.params.id);
    res.json({ run: db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(req.params.id) });
  } catch (err) { next(err); }
});

// ─── GET /payroll/salary-slip/:runId/:empId ───────────────────────────────────
// Returns structured salary slip data (for PDF rendering / print)
payrollRouter.get('/salary-slip/:runId/:empId', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const entry = db.prepare(`
      SELECT pe.*, e.name, e.designation, e.department, e.pan, e.uan, e.esic_no,
             e.bank_account, e.bank_ifsc, e.joining_date
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      WHERE pe.run_id = ? AND pe.employee_id = ?
    `).get(req.params.runId, req.params.empId);
    if (!entry) throw new NotFoundError('Salary slip not found');

    const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(req.params.runId);
    const company = db.prepare('SELECT * FROM company_details WHERE id = 1').get();

    // Split month into display
    const [year, mon] = entry.run_id.replace('PR/', '').split('-');
    const monthName = new Date(Number(year), Number(mon) - 1, 1)
      .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    res.json({
      slip: {
        company: {
          name: company?.name || 'MODERNEX STONES LLP',
          address: company?.address || '',
          gstin: company?.gstin,
          pan: company?.pan,
        },
        employee: {
          id: entry.employee_id,
          name: entry.name,
          designation: entry.designation,
          department: entry.department,
          pan: entry.pan,
          uan: entry.uan,
          esic_no: entry.esic_no,
          bank_account: entry.bank_account,
          bank_ifsc: entry.bank_ifsc,
          joining_date: entry.joining_date,
        },
        period: { month: entry.run_id.replace('PR/', ''), monthName },
        earnings: [
          { label: 'Basic Salary',    paise: entry.basic_paise },
          { label: 'HRA',             paise: entry.hra_paise },
          { label: 'Conveyance',      paise: entry.conveyance_paise },
          { label: 'Other Allowance', paise: entry.other_allowance_paise },
        ].filter(e => e.paise > 0),
        deductions: [
          { label: 'EPF (Employee)',  paise: entry.pf_employee_paise },
          { label: 'ESI (Employee)',  paise: entry.esi_employee_paise },
          { label: 'Prof. Tax (TN)',  paise: entry.pt_paise },
          { label: 'TDS (Sec 192)',   paise: entry.tds_paise },
        ].filter(d => d.paise > 0),
        employer_contributions: [
          { label: 'EPF (Employer)',  paise: entry.pf_employer_paise },
          { label: 'ESI (Employer)',  paise: entry.esi_employer_paise },
        ].filter(d => d.paise > 0),
        totals: {
          grossPaise: entry.gross_paise,
          totalDeductionsPaise: entry.total_deductions_paise,
          netPayPaise: entry.net_paise,
          daysWorked: entry.days_worked,
        },
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /payroll/epf-ecr/:month ─────────────────────────────────────────────
// EPF Electronic Challan cum Return format (for EPFO portal upload)
payrollRouter.get('/epf-ecr/:month', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const entries = db.prepare(`
      SELECT pe.*, e.name, e.uan, e.pan
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      WHERE pe.run_id = ?
        AND pe.pf_employee_paise > 0
      ORDER BY e.name
    `).all(`PR/${req.params.month}`);

    if (!entries.length) return res.status(404).json({ error: 'No EPF entries for this month' });

    // ECR format: UAN, MEMBER_NAME, GROSS_WAGES, EPF_WAGES, EPS_WAGES, EDLI_WAGES,
    //             EE_SHARE, ER_SHARE, EPS_ER, EDLI_ER, NCP_DAYS, REFUND_OF_ADVANCES
    const rows = entries.map(e => {
      const cappedWage = Math.min(e.basic_paise, 1500000);
      const epsWage    = Math.min(e.basic_paise, 1500000);
      const eps        = Math.round(epsWage * 0.0833);
      const epf_er     = Math.round(cappedWage * 0.0367);
      const edli       = Math.round(cappedWage * 0.005);
      return {
        uan:       e.uan || '',
        name:      e.name,
        grossWage: e.gross_paise,
        epfWage:   cappedWage,
        epsWage,
        edliWage:  cappedWage,
        eeShare:   e.pf_employee_paise,
        erShare:   epf_er,
        epsEr:     eps,
        edliEr:    edli,
        ncpDays:   26 - e.days_worked,
        refund:    0,
      };
    });

    const totals = rows.reduce((acc, r) => {
      acc.grossWage += r.grossWage; acc.eeShare += r.eeShare;
      acc.erShare += r.erShare; acc.epsEr += r.epsEr; acc.edliEr += r.edliEr;
      return acc;
    }, { grossWage: 0, eeShare: 0, erShare: 0, epsEr: 0, edliEr: 0 });

    res.json({ month: req.params.month, rows, totals, memberCount: rows.length });
  } catch (err) { next(err); }
});

// ─── GET /payroll/pt-challan/:month ──────────────────────────────────────────
// Professional Tax challan data (Tamil Nadu)
payrollRouter.get('/pt-challan/:month', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const entries = db.prepare(`
      SELECT pe.*, e.name, e.pan
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      WHERE pe.run_id = ? AND pe.pt_paise > 0
      ORDER BY e.name
    `).all(`PR/${req.params.month}`);

    // PT slab breakdown
    const slabMap = { '0': 0, '135': 0, '315': 0, '690': 0, '1025': 0, '1250': 0 };
    for (const e of entries) {
      const rupees = Math.round(e.pt_paise / 100);
      const k = String(rupees);
      if (slabMap[k] !== undefined) slabMap[k]++;
    }

    const totalPt = entries.reduce((s, e) => s + e.pt_paise, 0);
    const existing = db.prepare('SELECT * FROM pt_challans_tn WHERE month = ?').get(req.params.month);

    res.json({
      month: req.params.month,
      employeeCount: entries.length,
      totalPt_paise: totalPt,
      slabBreakdown: slabMap,
      employees: entries.map(e => ({ name: e.name, pan: e.pan, pt_paise: e.pt_paise })),
      challan: existing || null,
    });
  } catch (err) { next(err); }
});

// ─── PATCH /payroll/pt-challan/:month/submit ─────────────────────────────────
payrollRouter.patch('/pt-challan/:month/submit', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { challan_no, challan_date } = req.body;
    const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(`PR/${req.params.month}`);
    if (!run) return res.status(404).json({ error: 'No payroll run for this month' });

    db.prepare(`
      INSERT INTO pt_challans_tn (month, challan_no, challan_date, employee_count, total_pt_paise, status)
      VALUES (?, ?, ?, ?, ?, 'paid')
      ON CONFLICT(month) DO UPDATE SET challan_no=excluded.challan_no,
        challan_date=excluded.challan_date, status='paid'
    `).run(req.params.month, challan_no, challan_date, 0, run.total_pt_paise);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── GET /payroll/esi-challan/:month ─────────────────────────────────────────
payrollRouter.get('/esi-challan/:month', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const entries = db.prepare(`
      SELECT pe.*, e.name, e.esic_no
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      WHERE pe.run_id = ? AND pe.esi_employee_paise > 0
    `).all(`PR/${req.params.month}`);

    const totalEmpESI = entries.reduce((s, e) => s + e.esi_employee_paise, 0);
    const totalErESI  = entries.reduce((s, e) => s + e.esi_employer_paise, 0);
    const existing    = db.prepare('SELECT * FROM esi_challans WHERE month = ?').get(req.params.month);

    res.json({
      month: req.params.month,
      employeeCount: entries.length,
      totalEmployee_paise: totalEmpESI,
      totalEmployer_paise: totalErESI,
      total_paise: totalEmpESI + totalErESI,
      employees: entries.map(e => ({ name: e.name, esic_no: e.esic_no,
        employee_paise: e.esi_employee_paise, employer_paise: e.esi_employer_paise })),
      challan: existing || null,
    });
  } catch (err) { next(err); }
});

// ─── GET /payroll/form16/:empId/:fy ──────────────────────────────────────────
// Form 16 Part A (TDS certificate) + Part B (salary breakdown)
payrollRouter.get('/form16/:empId/:fy', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.empId);
    if (!emp) throw new NotFoundError('Employee not found');

    const company = db.prepare('SELECT * FROM company_details WHERE id = 1').get();

    // All payroll entries for this employee in the given FY
    const [fyStart, fyEnd] = req.params.fy.split('-');
    const months = [];
    for (let m = 4; m <= 12; m++) months.push(`PR/${fyStart}-${String(m).padStart(2,'0')}`);
    for (let m = 1; m <= 3; m++)  months.push(`PR/${Number(fyStart)+1}-${String(m).padStart(2,'0')}`);

    const placeholders = months.map(() => '?').join(',');
    const entries = db.prepare(`
      SELECT * FROM payroll_entries
      WHERE employee_id = ? AND run_id IN (${placeholders})
    `).all(emp.id, ...months);

    const totals = entries.reduce((acc, e) => {
      acc.gross           += e.gross_paise;
      acc.basic           += e.basic_paise;
      acc.hra             += e.hra_paise;
      acc.conveyance      += e.conveyance_paise;
      acc.other           += e.other_allowance_paise;
      acc.pfEmployee      += e.pf_employee_paise;
      acc.esiEmployee     += e.esi_employee_paise;
      acc.pt              += e.pt_paise;
      acc.tdsDeducted     += e.tds_paise;
      return acc;
    }, { gross:0, basic:0, hra:0, conveyance:0, other:0, pfEmployee:0, esiEmployee:0, pt:0, tdsDeducted:0 });

    const decl = db.prepare('SELECT * FROM employee_tax_declarations WHERE employee_id=? AND fy=?')
                   .get(emp.id, req.params.fy);
    // The year's actual basic, HRA and rent: no further annualising.
    const regime = decl?.tax_regime || 'new';
    const hraExAnnual = decl && regime === 'old'
      ? calcHRAExemption(totals.basic, totals.hra, decl.hra_rent_paid_annual, decl.hra_city_type === 'metro')
      : 0;
    const stdDeduction = (regime === 'old' ? 50000 : 75000) * 100;
    const sec80c  = regime === 'old' ? Math.min(decl?.sec_80c_paise || 0, 15000000) : 0;
    const sec80d  = regime === 'old' ? Math.min(decl?.sec_80d_self_paise || 0, 2500000)
                                     + Math.min(decl?.sec_80d_parents_paise || 0, 5000000) : 0;
    const sec80ccd1b = regime === 'old' ? Math.min(decl?.sec_80ccd1b_paise || 0, 5000000) : 0;
    const taxCalc = calcTDSSalary({
      grossAnnual: totals.gross, regime, hraExemption: hraExAnnual, professionalTax: totals.pt,
      sec80c: decl?.sec_80c_paise, sec80dSelf: decl?.sec_80d_self_paise, sec80dParents: decl?.sec_80d_parents_paise,
      sec80ccd1b: decl?.sec_80ccd1b_paise, housingLoanInterest: decl?.housing_loan_interest_paise,
      otherIncome: decl?.other_income_paise,
    });

    res.json({
      form16: {
        fy: req.params.fy,
        employer: {
          name: company?.name || 'MODERNEX STONES LLP',
          tan: company?.tan || 'MXXX12345A',
          pan: company?.pan,
          address: company?.address,
          gstin: company?.gstin,
        },
        employee: {
          id: emp.id, name: emp.name, pan: emp.pan, designation: emp.designation,
          department: emp.department, joining_date: emp.joining_date,
        },
        // Part A — TDS summary
        partA: {
          totalTaxDeducted:    totals.tdsDeducted,
          totalTaxDeposited:   totals.tdsDeducted, // assuming deposited = deducted
          quarterBreakdown: [], // TODO: aggregate by quarter
        },
        // Part B — Salary details
        partB: {
          grossSalary:         totals.gross,
          hraReceived:         totals.hra,
          hraExemption:        hraExAnnual,
          standardDeduction:   stdDeduction,
          professionalTax:     regime === 'old' ? totals.pt : 0,   // deductible on the old regime only
          netSalaryAfterExemptions: taxCalc.taxableIncome,
          taxRegime: regime,
          chapterVIA: { sec80c, sec80d, sec80ccd1b },
          taxableIncome:       taxCalc.taxableIncome,
          taxOnIncome:         taxCalc.annualTax,
          totalTaxPayable:     taxCalc.annualTax,
          taxDeducted:         totals.tdsDeducted,
          taxRefund:           Math.max(0, totals.tdsDeducted - taxCalc.annualTax),
          additionalTaxDue:    Math.max(0, taxCalc.annualTax - totals.tdsDeducted),
        },
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /payroll/leave-types ─────────────────────────────────────────────────
payrollRouter.get('/leave-types', (req, res) => {
  res.json({ leaveTypes: getDb().prepare('SELECT * FROM leave_types ORDER BY id').all() });
});

// ─── GET /payroll/leave/:empId ────────────────────────────────────────────────
payrollRouter.get('/leave/:empId', (req, res, next) => {
  try {
    const db = getDb();
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const balances = db.prepare(`
      SELECT lb.*, lt.name AS leave_name, lt.paid, lt.encashable
      FROM leave_balances lb
      JOIN leave_types lt ON lt.code = lb.leave_code
      WHERE lb.employee_id = ? AND lb.year = ?
      ORDER BY lb.leave_code
    `).all(req.params.empId, year);

    const applications = db.prepare(`
      SELECT * FROM leave_applications
      WHERE employee_id = ? AND strftime('%Y', from_date) = ?
      ORDER BY from_date DESC
    `).all(req.params.empId, String(year));

    res.json({ balances, applications });
  } catch (err) { next(err); }
});

// ─── POST /payroll/leave/apply ────────────────────────────────────────────────
payrollRouter.post('/leave/apply', (req, res, next) => {
  try {
    const db = getDb();
    const { employee_id, leave_code, from_date, to_date, reason } = req.body;
    if (!employee_id || !leave_code || !from_date || !to_date)
      return res.status(400).json({ error: 'employee_id, leave_code, from_date, to_date required' });

    const days = Math.round((new Date(to_date) - new Date(from_date)) / 86400000) + 1;
    if (days <= 0) return res.status(400).json({ error: 'to_date must be >= from_date' });

    const year = new Date(from_date).getFullYear();
    const balance = db.prepare('SELECT * FROM leave_balances WHERE employee_id=? AND leave_code=? AND year=?')
                      .get(employee_id, leave_code, year);
    if (balance && balance.closing < days)
      return res.status(400).json({ error: `Insufficient ${leave_code} balance. Available: ${balance.closing} days` });

    const result = db.prepare(`
      INSERT INTO leave_applications (employee_id, leave_code, from_date, to_date, days, reason)
      VALUES (?,?,?,?,?,?)
    `).run(employee_id, leave_code, from_date, to_date, days, reason || null);

    res.status(201).json({ id: result.lastInsertRowid, days });
  } catch (err) { next(err); }
});

// ─── PATCH /payroll/leave/:id/approve ────────────────────────────────────────
payrollRouter.patch('/leave/:id/approve', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const app = db.prepare('SELECT * FROM leave_applications WHERE id = ?').get(req.params.id);
    if (!app) throw new NotFoundError('Leave application not found');
    if (app.status !== 'pending') return res.status(400).json({ error: 'Only pending applications can be approved' });

    const { action, reject_reason } = req.body; // action: 'approve' | 'reject'
    if (action === 'approve') {
      db.transaction(() => {
        db.prepare('UPDATE leave_applications SET status=?, approved_by=?, approved_at=? WHERE id=?')
          .run('approved', req.user?.username, new Date().toISOString(), app.id);
        const year = new Date(app.from_date).getFullYear();
        db.prepare('UPDATE leave_balances SET taken = taken + ? WHERE employee_id=? AND leave_code=? AND year=?')
          .run(app.days, app.employee_id, app.leave_code, year);
      })();
    } else {
      db.prepare('UPDATE leave_applications SET status=?, reject_reason=? WHERE id=?')
        .run('rejected', reject_reason || 'Rejected by admin', app.id);
    }
    res.json({ application: db.prepare('SELECT * FROM leave_applications WHERE id=?').get(req.params.id) });
  } catch (err) { next(err); }
});

// ─── POST /payroll/leave/accrue ───────────────────────────────────────────────
// Year-end / monthly accrual — typically run once per year
payrollRouter.post('/leave/accrue', requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    const year = parseInt(req.body.year) || new Date().getFullYear();
    const employees = db.prepare('SELECT * FROM employees WHERE active = 1').all();
    const leaveTypes = db.prepare('SELECT * FROM leave_types WHERE active = 1').all();
    let created = 0;

    db.transaction(() => {
      for (const emp of employees) {
        for (const lt of leaveTypes) {
          // Carry forward from previous year (EL/PL only, up to carry_forward limit)
          const prev = db.prepare('SELECT closing FROM leave_balances WHERE employee_id=? AND leave_code=? AND year=?')
                         .get(emp.id, lt.code, year - 1);
          const carried = prev ? Math.min(prev.closing, lt.carry_forward) : 0;
          db.prepare(`
            INSERT OR IGNORE INTO leave_balances (employee_id, leave_code, year, opening, accrued)
            VALUES (?, ?, ?, ?, ?)
          `).run(emp.id, lt.code, year, carried, lt.annual_quota);
          created++;
        }
      }
    })();
    res.json({ created, year });
  } catch (err) { next(err); }
});

// ─── GET /payroll/gratuity/:empId ────────────────────────────────────────────
payrollRouter.get('/gratuity/:empId', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.empId);
    if (!emp) throw new NotFoundError('Employee not found');

    const exitDate = emp.leaving_date || todayIST();
    const calc = calcGratuity(emp.basic_salary_paise, emp.joining_date, exitDate);

    const existing = db.prepare('SELECT * FROM gratuity_records WHERE employee_id = ? ORDER BY calc_date DESC LIMIT 1').get(emp.id);

    res.json({
      employee: { id: emp.id, name: emp.name, joining_date: emp.joining_date, leaving_date: emp.leaving_date },
      calculation: { ...calc, exitDate, basicAtExit: emp.basic_salary_paise },
      existingRecord: existing || null,
    });
  } catch (err) { next(err); }
});

// ─── POST /payroll/gratuity ───────────────────────────────────────────────────
payrollRouter.post('/gratuity', requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    const { employee_id, calc_date, notes } = req.body;
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id);
    if (!emp) throw new NotFoundError('Employee not found');

    const exitDate = calc_date || emp.leaving_date || todayIST();
    const calc = calcGratuity(emp.basic_salary_paise, emp.joining_date, exitDate);
    if (!calc.eligible) return res.status(400).json({ error: 'Employee not eligible (< 5 years service)' });

    const result = db.prepare(`
      INSERT INTO gratuity_records (employee_id, calc_date, joining_date, leaving_date,
        years_service, basic_at_exit, gratuity_paise, status, notes, created_by)
      VALUES (?,?,?,?,?,?,?,'computed',?,?)
    `).run(employee_id, exitDate, emp.joining_date, emp.leaving_date,
           calc.yearsService, emp.basic_salary_paise, calc.gratuityPaise,
           notes || null, req.user?.username);

    res.status(201).json({ id: result.lastInsertRowid, ...calc });
  } catch (err) { next(err); }
});

// ─── GET /payroll/bonus/runs ──────────────────────────────────────────────────
payrollRouter.get('/bonus/runs', requireRole('admin', 'accounts'), (req, res) => {
  res.json({ runs: getDb().prepare('SELECT * FROM bonus_runs ORDER BY fy DESC').all() });
});

// ─── POST /payroll/bonus/runs ─────────────────────────────────────────────────
payrollRouter.post('/bonus/runs', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { fy, bonus_rate_pct = 8.33, notes } = req.body;
    if (!fy) return res.status(400).json({ error: 'fy required (e.g. 2025-26)' });

    const existing = db.prepare('SELECT id FROM bonus_runs WHERE fy = ?').get(fy);
    if (existing) return res.status(409).json({ error: 'Bonus run already exists for this FY' });

    const employees = db.prepare('SELECT * FROM employees WHERE active = 1').all();
    if (!employees.length) return res.status(400).json({ error: 'No active employees' });

    const result = db.prepare(`
      INSERT INTO bonus_runs (fy, bonus_rate_pct, status, notes, created_by)
      VALUES (?,?,'draft',?,?)
    `).run(fy, bonus_rate_pct, notes || null, req.user?.username);
    const runId = result.lastInsertRowid;

    let totalBonus = 0;
    db.transaction(() => {
      for (const emp of employees) {
        const annualBasic = emp.basic_salary_paise * 12;
        const b = calcBonus(annualBasic, bonus_rate_pct);
        db.prepare(`
          INSERT INTO bonus_entries (run_id, employee_id, monthly_basic, annual_basic, months_worked, bonus_paise, eligible)
          VALUES (?,?,?,?,12,?,?)
        `).run(runId, emp.id, emp.basic_salary_paise, annualBasic, b.bonusPaise, b.eligible ? 1 : 0);
        if (b.eligible) totalBonus += b.bonusPaise;
      }
      db.prepare('UPDATE bonus_runs SET status=?, total_paise=? WHERE id=?').run('processed', totalBonus, runId);
    })();

    res.status(201).json({
      run: db.prepare('SELECT * FROM bonus_runs WHERE id = ?').get(runId),
      entries: db.prepare(`SELECT be.*, e.name FROM bonus_entries be JOIN employees e ON e.id=be.employee_id WHERE be.run_id=?`).all(runId),
    });
  } catch (err) { next(err); }
});

// ─── GET /payroll/lwf ────────────────────────────────────────────────────────
payrollRouter.get('/lwf', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { half_year } = req.query;
    let sql = `
      SELECT lc.*, e.name AS employee_name
      FROM lwf_contributions lc
      JOIN employees e ON e.id = lc.employee_id
    `;
    const params = [];
    if (half_year) { sql += ' WHERE lc.half_year = ?'; params.push(half_year); }
    sql += ' ORDER BY lc.half_year DESC, e.name';
    res.json({ contributions: db.prepare(sql).all(...params) });
  } catch (err) { next(err); }
});

// ─── POST /payroll/lwf/process ────────────────────────────────────────────────
// Process LWF for a half-year (TN: deduct in June & December salary)
payrollRouter.post('/lwf/process', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { half_year } = req.body; // e.g. '2025-H1' or '2025-H2'
    if (!half_year) return res.status(400).json({ error: 'half_year required (e.g. 2025-H1)' });

    const employees = db.prepare('SELECT * FROM employees WHERE active = 1 AND pt_applicable = 1').all();
    const { employee: empAmt, employer: erAmt } = lwfAmount();
    let created = 0;

    db.transaction(() => {
      for (const emp of employees) {
        const r = db.prepare(`
          INSERT OR IGNORE INTO lwf_contributions (half_year, employee_id, employee_paise, employer_paise)
          VALUES (?,?,?,?)
        `).run(half_year, emp.id, empAmt, erAmt);
        if (r.changes) created++;
      }
    })();

    const total = db.prepare('SELECT SUM(employee_paise) as emp, SUM(employer_paise) as er FROM lwf_contributions WHERE half_year=?').get(half_year);
    res.json({ half_year, created, totalEmployee_paise: total.emp, totalEmployer_paise: total.er });
  } catch (err) { next(err); }
});

// ─── PATCH /payroll/lwf/submit ────────────────────────────────────────────────
payrollRouter.patch('/lwf/submit', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { half_year, challan_no, challan_date } = req.body;
    if (!half_year) return res.status(400).json({ error: 'half_year required' });

    const totals = db.prepare('SELECT SUM(employee_paise) as emp, SUM(employer_paise) as er, COUNT(*) as cnt FROM lwf_contributions WHERE half_year=?').get(half_year);

    db.prepare(`
      INSERT INTO lwf_challan_batches (half_year, challan_no, challan_date, total_employee_paise, total_employer_paise, status)
      VALUES (?,?,?,?,?,'paid')
      ON CONFLICT(half_year) DO UPDATE SET challan_no=excluded.challan_no,
        challan_date=excluded.challan_date, status='paid'
    `).run(half_year, challan_no, challan_date, totals.emp || 0, totals.er || 0);

    db.prepare('UPDATE lwf_contributions SET paid=1, paid_date=? WHERE half_year=?').run(challan_date, half_year);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── GET/POST /payroll/employees/:id/tax-declaration ─────────────────────────
payrollRouter.get('/employees/:id/tax-declaration', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fy = req.query.fy || `${fyStart}-${String(fyStart + 1).slice(-2)}`;
    const decl = db.prepare('SELECT * FROM employee_tax_declarations WHERE employee_id=? AND fy=?').get(req.params.id, fy);
    res.json({ declaration: decl || null, fy });
  } catch (err) { next(err); }
});

payrollRouter.post('/employees/:id/tax-declaration', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fy = req.body.fy || `${fyStart}-${String(fyStart + 1).slice(-2)}`;

    const {
      hra_city_type = 'non-metro', hra_rent_paid_annual = 0,
      sec_80c_paise = 0, sec_80ccd1b_paise = 0,
      sec_80d_self_paise = 0, sec_80d_parents_paise = 0,
      sec_80e_paise = 0, sec_80g_paise = 0, sec_80tta_paise = 0,
      housing_loan_interest_paise = 0, other_income_paise = 0, tax_regime = 'new',
    } = req.body;
    if (!['new', 'old'].includes(tax_regime)) return res.status(400).json({ error: "tax_regime must be 'new' or 'old'" });

    db.prepare(`
      INSERT INTO employee_tax_declarations
        (employee_id, fy, hra_city_type, hra_rent_paid_annual,
         sec_80c_paise, sec_80ccd1b_paise, sec_80d_self_paise, sec_80d_parents_paise,
         sec_80e_paise, sec_80g_paise, sec_80tta_paise, housing_loan_interest_paise,
         other_income_paise, tax_regime, total_declared_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(employee_id, fy) DO UPDATE SET
        hra_city_type=excluded.hra_city_type, hra_rent_paid_annual=excluded.hra_rent_paid_annual,
        sec_80c_paise=excluded.sec_80c_paise, sec_80ccd1b_paise=excluded.sec_80ccd1b_paise,
        sec_80d_self_paise=excluded.sec_80d_self_paise, sec_80d_parents_paise=excluded.sec_80d_parents_paise,
        sec_80e_paise=excluded.sec_80e_paise, sec_80g_paise=excluded.sec_80g_paise,
        sec_80tta_paise=excluded.sec_80tta_paise,
        housing_loan_interest_paise=excluded.housing_loan_interest_paise,
        other_income_paise=excluded.other_income_paise, tax_regime=excluded.tax_regime,
        total_declared_at=datetime('now'), updated_at=datetime('now')
    `).run(req.params.id, fy, hra_city_type, hra_rent_paid_annual,
           sec_80c_paise, sec_80ccd1b_paise, sec_80d_self_paise, sec_80d_parents_paise,
           sec_80e_paise, sec_80g_paise, sec_80tta_paise, housing_loan_interest_paise, other_income_paise,
           tax_regime);

    res.json({ declaration: db.prepare('SELECT * FROM employee_tax_declarations WHERE employee_id=? AND fy=?').get(req.params.id, fy) });
  } catch (err) { next(err); }
});
