import { describe, it, expect } from 'vitest';
import { calcPT, calcGratuity, calcHRAExemption, calcTDSSalary } from '../src/services/payrollCalc.js';

const rs = (rupees) => Math.round(rupees * 100);

describe('TN professional tax', () => {
  it('is nil when half-yearly income is ₹21,000 or less', () => {
    expect(calcPT(rs(3000))).toBe(0);
  });
  it('spreads the half-yearly slab over six months', () => {
    expect(calcPT(rs(4500))).toBe(rs(22.5));        // ₹27,000 a half-year → ₹135 / 6
  });
  it('never exceeds ₹2,500 a year', () => {
    expect(calcPT(rs(30000)) * 12).toBeLessThanOrEqual(rs(2500));
    expect(calcPT(rs(30000))).toBe(20833);          // ₹1,250 / 6
  });
});

describe('TDS on salary — new regime', () => {
  it('is nil up to ₹12 lakh taxable (87A rebate)', () => {
    expect(calcTDSSalary({ grossAnnual: rs(1000000) }).annualTax).toBe(0);
  });
  it('applies marginal relief just above ₹12 lakh', () => {
    // ₹13L − ₹75,000 = ₹12.25L taxable; slab tax ₹63,750 capped at the ₹25,000 excess, + 4% cess
    expect(calcTDSSalary({ grossAnnual: rs(1300000) }).annualTax).toBe(rs(26000));
  });
  it('uses the FY 2025-26 slabs', () => {
    // ₹19.25L taxable: 20,000 + 40,000 + 60,000 + 65,000 = 1,85,000 + 4% cess
    const r = calcTDSSalary({ grossAnnual: rs(2000000) });
    expect(r.taxableIncome).toBe(rs(1925000));
    expect(r.annualTax).toBe(rs(192400));
    expect(r.monthlyTDS).toBe(rs(16033.33));
  });
  it('ignores old-regime deductions', () => {
    expect(calcTDSSalary({ grossAnnual: rs(2000000), sec80c: rs(150000), hraExemption: rs(100000) }).annualTax)
      .toBe(rs(192400));
  });
});

describe('TDS on salary — old regime', () => {
  it('allows 80C (capped at ₹1.5 lakh) and the ₹50,000 standard deduction', () => {
    // ₹8L − 50,000 − 1,50,000 = ₹6L: 12,500 + 20,000 = 32,500 + 4% cess
    expect(calcTDSSalary({ grossAnnual: rs(800000), regime: 'old', sec80c: rs(200000) }).annualTax).toBe(rs(33800));
  });
  it('is nil up to ₹5 lakh taxable', () => {
    expect(calcTDSSalary({ grossAnnual: rs(550000), regime: 'old' }).annualTax).toBe(0);
  });
});

describe('HRA exemption', () => {
  it('is the least of HRA, 50% of basic and rent less 10% of basic', () => {
    expect(calcHRAExemption(rs(600000), rs(240000), rs(300000), true)).toBe(rs(240000));
    expect(calcHRAExemption(rs(600000), rs(240000), rs(100000), true)).toBe(rs(40000));
  });
});

describe('Gratuity', () => {
  it('is 15/26 × basic × completed years', () => {
    expect(calcGratuity(rs(45000), '2018-06-01', '2026-06-01').gratuityPaise).toBe(rs(207692.31));
  });
  it('counts a part-year over six months as a full year', () => {
    expect(calcGratuity(rs(45000), '2018-06-01', '2026-01-15').countedYears).toBe(8);
    expect(calcGratuity(rs(45000), '2018-06-01', '2025-10-15').countedYears).toBe(7);
  });
  it('is capped at ₹20 lakh', () => {
    expect(calcGratuity(rs(500000), '1990-01-01', '2026-01-01').gratuityPaise).toBe(rs(2000000));
  });
  it('needs five years', () => {
    expect(calcGratuity(rs(45000), '2023-01-01', '2026-01-01').eligible).toBe(false);
  });
});
