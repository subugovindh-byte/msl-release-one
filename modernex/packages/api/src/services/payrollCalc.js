// Statutory payroll maths. Every amount in and out is in paise; rupee slabs are
// converted once, here, so callers never mix the two.

import { today as todayIST } from './dates.js';


const R = 100; // paise per rupee

// ── Tamil Nadu Professional Tax ──────────────────────────────────────────────
// TN PT is levied per half-year on half-yearly income. We project the half-year
// from this month's gross and deduct one sixth of the half-yearly tax each month,
// so a year never exceeds the ₹2,500 constitutional cap (Art. 276).
const PT_HALF_YEARLY = [          // [half-yearly income up to ₹, half-yearly tax ₹]
  [21000, 0], [30000, 135], [45000, 315], [60000, 690], [75000, 1025], [Infinity, 1250],
];
export function calcPT(grossMonthlyPaise) {
  const halfYear = (grossMonthlyPaise * 6) / R;
  const [, tax] = PT_HALF_YEARLY.find(([upTo]) => halfYear <= upTo);
  return Math.round((tax * R) / 6);
}

// ── EPF / EPS (EPF & MP Act 1952) ────────────────────────────────────────────
// Employee: 12% on basic (capped ₹15,000); Employer: 3.67% EPF + 8.33% EPS
export function calcPF(basicPaise, applicable) {
  if (!applicable) return { employee: 0, employer: 0, eps: 0, edli: 0, admin: 0 };
  const capped = Math.min(basicPaise, 15000 * R);
  const employee = Math.round(capped * 0.12);
  const eps      = Math.round(capped * 0.0833);
  const epf_er   = Math.round(capped * 0.0367);
  const edli     = Math.round(capped * 0.005);
  const admin    = Math.round(capped * 0.005);
  return { employee, employer: epf_er + eps, eps, edli, admin };
}

// ── ESI (ESI Act 1948) ───────────────────────────────────────────────────────
// Employee 0.75%, Employer 3.25%; applicable if gross ≤ ₹21,000/month
export function calcESI(grossPaise, applicable) {
  if (!applicable || grossPaise > 21000 * R) return { employee: 0, employer: 0 };
  return { employee: Math.round(grossPaise * 0.0075), employer: Math.round(grossPaise * 0.0325) };
}

// ── TN Labour Welfare Fund (TN LWF Act 1982) ─────────────────────────────────
// ₹20 employee + ₹40 employer per half-year (June & December)
export function lwfAmount() {
  return { employee: 20 * R, employer: 40 * R };
}

// ── Gratuity (Payment of Gratuity Act 1972) ──────────────────────────────────
// 15/26 × last monthly basic × completed years, a part-year over six months
// counting as a full year (s.4(2)); ceiling ₹20 lakh.
export function calcGratuity(basicPaise, joiningDate, exitDate = todayIST()) {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsService = (new Date(exitDate) - new Date(joiningDate)) / msPerYear;
  if (yearsService < 5) return { eligible: false, yearsService, gratuityPaise: 0 };
  const whole = Math.floor(yearsService);
  const countedYears = yearsService - whole > 0.5 ? whole + 1 : whole;
  const raw = Math.round((basicPaise / 26) * 15 * countedYears);
  return { eligible: true, yearsService, countedYears, gratuityPaise: Math.min(raw, 2000000 * R) };
}

// ── Bonus (Payment of Bonus Act 1965) ────────────────────────────────────────
// Eligible if basic ≤ ₹21,000/month; min 8.33%, max 20%
export function calcBonus(annualBasicPaise, ratePct = 8.33) {
  const eligible = annualBasicPaise / 12 <= 21000 * R;
  if (!eligible) return { eligible: false, bonusPaise: 0 };
  const rate = Math.min(Math.max(ratePct, 8.33), 20);
  return { eligible: true, bonusPaise: Math.round(annualBasicPaise * rate / 100) };
}

// ── HRA exemption (s.10(13A)) ────────────────────────────────────────────────
// Least of: HRA received, 50% / 40% of basic, rent paid less 10% of basic —
// all three over the same period, so pass basic, HRA and rent for that period.
export function calcHRAExemption(basicPaise, hraPaise, rentPaidPaise, isMetro = false) {
  const b = Math.round(basicPaise * (isMetro ? 0.5 : 0.4));
  const c = Math.max(0, rentPaidPaise - Math.round(basicPaise * 0.1));
  return Math.max(0, Math.min(hraPaise, b, c));
}

// ── Income tax on salary (s.192) ─────────────────────────────────────────────
// New regime (the default since FY 2023-24; slabs from FY 2025-26): no HRA or
// Chapter VI-A deductions, ₹75,000 standard deduction, 87A rebate up to ₹12 lakh
// with marginal relief. Old regime (employee opts in): ₹50,000 standard
// deduction, HRA, 80C / 80CCD(1B) / 80D / 24(b) within their limits, PT,
// 87A rebate up to ₹5 lakh.
const NEW_SLABS = [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15],
                   [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]];
const OLD_SLABS = [[250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]];

function slabTax(income, slabs) {
  let tax = 0, from = 0;
  for (const [upTo, rate] of slabs) {
    if (income > from) tax += (Math.min(income, upTo) - from) * rate;
    from = upTo;
  }
  return tax;
}

export function calcTDSSalary({ grossAnnual, regime = 'new', hraExemption = 0, professionalTax = 0,
                                sec80c = 0, sec80dSelf = 0, sec80dParents = 0, sec80ccd1b = 0,
                                housingLoanInterest = 0, otherIncome = 0 }) {
  const gross = (grossAnnual + otherIncome) / R;   // rupees from here on
  let taxable, tax;
  if (regime === 'old') {
    const deductions = 50000 + hraExemption / R + professionalTax / R
      + Math.min(sec80c / R, 150000) + Math.min(sec80ccd1b / R, 50000)
      + Math.min(sec80dSelf / R, 25000) + Math.min(sec80dParents / R, 50000)
      + Math.min(housingLoanInterest / R, 200000);
    taxable = Math.max(0, Math.round(gross - deductions));
    tax = slabTax(taxable, OLD_SLABS);
    if (taxable <= 500000) tax = 0;
  } else {
    taxable = Math.max(0, Math.round(gross - 75000));
    tax = slabTax(taxable, NEW_SLABS);
    if (taxable <= 1200000) tax = 0;
    else tax = Math.min(tax, taxable - 1200000);   // marginal relief on the rebate
  }
  const annualTax = Math.round(tax * 1.04) * R;     // 4% health & education cess
  return { regime, taxableIncome: taxable * R, annualTax, monthlyTDS: Math.round(annualTax / 12) };
}
