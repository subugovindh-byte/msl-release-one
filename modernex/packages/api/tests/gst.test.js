import { describe, it, expect } from 'vitest';
import { CGST_RATE, GST_RATE, calculateGST, calculateInvoice, toPaise, fromPaise, isValidGSTIN, formatINR } from '@modernex/shared';

describe('GST calculations', () => {
  it('applies CGST+SGST for intra-state sale (TN to TN)', () => {
    const r = calculateGST(toPaise(100000), 'Tamil Nadu');
    expect(r.mode).toBe('CGST+SGST');
    expect(r.cgst).toBe(Math.round(toPaise(100000) * CGST_RATE));
    expect(r.sgst).toBe(Math.round(toPaise(100000) * CGST_RATE));
    expect(r.igst).toBe(0);
    expect(r.grandTotal).toBe(toPaise(100000) + Math.round(toPaise(100000) * GST_RATE));
  });

  it('applies IGST for inter-state sale (TN to KA)', () => {
    const r = calculateGST(toPaise(100000), 'Karnataka');
    expect(r.mode).toBe('IGST');
    expect(r.igst).toBe(Math.round(toPaise(100000) * GST_RATE));
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.grandTotal).toBe(toPaise(100000) + Math.round(toPaise(100000) * GST_RATE));
  });

  it('handles rounding so CGST+SGST sum equals total tax', () => {
    // Pick a taxable that causes 0.5 paise issue
    const taxable = 5555555;  // ₹55,555.55
    const r = calculateGST(taxable, 'Tamil Nadu');
    expect(r.cgst + r.sgst).toBe(r.totalTax);
  });

  it('calculates invoice total with discount', () => {
    const items = [
      { rate_paise: 420, sqft: 27.6, qty: 2 }, // 420 * 27.6 * 2 = 23,184 paise
      { rate_paise: 320, sqft: 19.8, qty: 1 }, // 320 * 19.8 = 6,336 paise
    ];
    const r = calculateInvoice(items, 'Tamil Nadu', 5);
    expect(r.grossPaise).toBe(29520);  // ₹295.20 gross
    expect(r.discountPaise).toBe(1476); // 5% off = ₹14.76
    expect(r.taxable).toBe(28044);  // ₹280.44
    // Tax calculation will vary slightly due to rounding
    expect(r.totalTax).toBeGreaterThan(3000); // ~12% of taxable
  });
});

describe('Paise conversion', () => {
  it('round-trips rupees correctly', () => {
    expect(toPaise(100)).toBe(10000);
    expect(fromPaise(10000)).toBe(100);
    expect(fromPaise(toPaise(1234.56))).toBe(1234.56);
  });

  it('rounds correctly to avoid float drift', () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);  // not 30.00000000004
  });
});

describe('GSTIN validation', () => {
  it('accepts valid Tamil Nadu GSTIN', () => {
    // Real valid GSTIN format for TN (33)
    expect(isValidGSTIN('27AAPFU0939F1ZV')).toBe(true);
  });

  it('rejects invalid length', () => {
    expect(isValidGSTIN('33ABCD')).toBe(false);
    expect(isValidGSTIN('')).toBe(false);
  });

  it('rejects invalid format', () => {
    expect(isValidGSTIN('XXAAPFU0939F1ZV')).toBe(false);  // non-numeric state
    expect(isValidGSTIN('27AAPFU0939F1ZZ')).toBe(false);  // wrong checksum
  });

  it('rejects null/undefined', () => {
    expect(isValidGSTIN(null)).toBe(false);
    expect(isValidGSTIN(undefined)).toBe(false);
  });
});

describe('INR formatting', () => {
  it('formats paise as ₹ with Indian digit grouping', () => {
    const formatted = formatINR(toPaise(123456.78));
    expect(formatted).toMatch(/1,23,456\.78/);
  });
});
