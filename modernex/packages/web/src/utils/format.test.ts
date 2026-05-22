// ══════════════════════════════════════════════════════
// Format Utilities Tests
// ══════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  parseCurrency,
  truncate,
  capitalize,
  getInitials,
  formatFileSize,
  isEmpty,
  generateId,
  isValidGSTIN,
  getStateFromGSTIN,
} from './format';

describe('formatCurrency', () => {
  it('should format paise to rupees', () => {
    expect(formatCurrency(125000)).toBe('₹1,250.00');
    expect(formatCurrency(100)).toBe('₹1.00');
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  it('should format without symbol', () => {
    expect(formatCurrency(125000, { withSymbol: false })).toBe('1,250.00');
  });

  it('should handle negative values', () => {
    expect(formatCurrency(-50000)).toBe('₹-500.00');
  });
});

describe('formatNumber', () => {
  it('should format numbers with Indian locale', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
    expect(formatNumber(1234567.89)).toBe('12,34,567.89');
  });

  it('should respect decimal places', () => {
    expect(formatNumber(123.456, 0)).toBe('123');
    expect(formatNumber(123.456, 3)).toBe('123.456');
  });
});

describe('parseCurrency', () => {
  it('should parse currency string to paise', () => {
    expect(parseCurrency('₹1,250.00')).toBe(125000);
    expect(parseCurrency('1250')).toBe(125000);
    expect(parseCurrency('1,250.50')).toBe(125050);
  });

  it('should handle invalid input', () => {
    expect(parseCurrency('abc')).toBe(0);
    expect(parseCurrency('')).toBe(0);
  });
});

describe('formatDate', () => {
  it('should format date in short format', () => {
    const date = new Date('2024-01-15');
    const formatted = formatDate(date, 'short');
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('2024');
  });

  it('should format date in long format', () => {
    const date = new Date('2024-01-15');
    const formatted = formatDate(date, 'long');
    expect(formatted).toContain('January');
    expect(formatted).toContain('2024');
  });

  it('should handle string dates', () => {
    const formatted = formatDate('2024-01-15');
    expect(formatted).toContain('2024');
  });
});

describe('truncate', () => {
  it('should truncate long text', () => {
    expect(truncate('This is a very long text', 10)).toBe('This is...');
  });

  it('should not truncate short text', () => {
    expect(truncate('Short', 10)).toBe('Short');
  });

  it('should handle exact length', () => {
    expect(truncate('Exact', 5)).toBe('Exact');
  });
});

describe('capitalize', () => {
  it('should capitalize first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('HELLO')).toBe('Hello');
  });

  it('should handle empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('getInitials', () => {
  it('should get initials from name', () => {
    expect(getInitials('John Doe')).toBe('JD');
    expect(getInitials('Jane Mary Smith')).toBe('JM');
  });

  it('should handle single name', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('should limit to 2 characters', () => {
    expect(getInitials('A B C D')).toBe('AB');
  });
});

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1.00 KB');
    expect(formatFileSize(1048576)).toBe('1.00 MB');
    expect(formatFileSize(1073741824)).toBe('1.00 GB');
  });
});

describe('isEmpty', () => {
  it('should detect empty values', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty({})).toBe(true);
  });

  it('should detect non-empty values', () => {
    expect(isEmpty('hello')).toBe(false);
    expect(isEmpty([1, 2])).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should use custom prefix', () => {
    const id = generateId('custom');
    expect(id).toContain('custom_');
  });
});

describe('isValidGSTIN', () => {
  it('should validate correct GSTIN', () => {
    expect(isValidGSTIN('33ACGFM7745J1ZW')).toBe(true);
    expect(isValidGSTIN('27AAPFU0939F1ZV')).toBe(true);
  });

  it('should reject invalid GSTIN', () => {
    expect(isValidGSTIN('33AABFM1234A1Z')).toBe(false); // Too short
    expect(isValidGSTIN('33AABFM1234A1Z77')).toBe(false); // Too long
    expect(isValidGSTIN('33aabfm1234a1z7')).toBe(false); // Lowercase
    expect(isValidGSTIN('XX ABFM1234A1Z7')).toBe(false); // Invalid format
    expect(isValidGSTIN('')).toBe(false);
  });
});

describe('getStateFromGSTIN', () => {
  it('should extract state from GSTIN', () => {
    expect(getStateFromGSTIN('33ACGFM7745J1ZW')).toBe('Tamil Nadu');
    expect(getStateFromGSTIN('27AAPFU0939F1ZV')).toBe('Maharashtra');
    expect(getStateFromGSTIN('29AAPFU0939F1ZV')).toBe('Karnataka');
  });

  it('should return null for invalid GSTIN', () => {
    expect(getStateFromGSTIN('INVALID')).toBeNull();
    expect(getStateFromGSTIN('')).toBeNull();
  });

  it('should return null for unknown state code', () => {
    expect(getStateFromGSTIN('99AABFM1234A1Z7')).toBeNull();
  });
});
