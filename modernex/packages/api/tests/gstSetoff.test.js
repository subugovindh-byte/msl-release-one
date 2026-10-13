import { describe, it, expect } from 'vitest';
import { setOffITC } from '../src/routes/reports.js';

describe('GSTR-3B ITC set-off (rule 88A)', () => {
  it('uses IGST credit first, across IGST then CGST then SGST', () => {
    const r = setOffITC({ igst: 100, cgst: 300, sgst: 300 }, { igst: 500, cgst: 0, sgst: 0 });
    expect(r.cash).toEqual({ igst: 0, cgst: 0, sgst: 200 });
    expect(r.credit_carried_forward.igst).toBe(0);
  });
  it('never sets CGST credit against SGST', () => {
    const r = setOffITC({ igst: 0, cgst: 100, sgst: 400 }, { igst: 0, cgst: 400, sgst: 100 });
    expect(r.cash).toEqual({ igst: 0, cgst: 0, sgst: 300 });
    expect(r.credit_carried_forward.cgst).toBe(300);
  });
  it('lets CGST and SGST credit cover IGST', () => {
    const r = setOffITC({ igst: 300, cgst: 0, sgst: 0 }, { igst: 0, cgst: 200, sgst: 200 });
    expect(r.cash.igst).toBe(0);
    expect(r.credit_carried_forward).toEqual({ igst: 0, cgst: 0, sgst: 100 });
  });
});
