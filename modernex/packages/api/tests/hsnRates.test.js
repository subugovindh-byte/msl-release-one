import { describe, it, expect } from 'vitest';
import { gstRateForHSN, hsnForKind, BLOCK_GST_RATE } from '@modernex/shared';

// Notification 9/2025-Central Tax (Rate), in force 22-09-2025.
describe('GST rate by HSN', () => {
  it('granite and marble blocks are 5%', () => {
    expect(gstRateForHSN('2516')).toBe(0.05);
    expect(gstRateForHSN('25161100')).toBe(0.05);
    expect(gstRateForHSN('25151210')).toBe(0.05);
    expect(BLOCK_GST_RATE).toBe(0.05);
  });
  it('granite and marble other than blocks are 18%', () => {
    expect(gstRateForHSN('25161200')).toBe(0.18);
    expect(gstRateForHSN('2516 12 00')).toBe(0.18);
    expect(gstRateForHSN('25151220')).toBe(0.18);
  });
  it('a block is 5% even when coded 2516 12 00 (dressed rectangular block)', () => {
    expect(gstRateForHSN('25161200', 'block')).toBe(0.05);
    expect(gstRateForHSN('25161200', 'slab')).toBe(0.18);
  });
  it('worked stone and setts are 18%; chips 5%', () => {
    expect(gstRateForHSN('6802')).toBe(0.18);
    expect(gstRateForHSN('68029300')).toBe(0.18);
    expect(gstRateForHSN('6801')).toBe(0.18);
    expect(gstRateForHSN('2517')).toBe(0.05);
  });
  it('each product kind gets the right code', () => {
    expect(hsnForKind('block')).toBe('2516');
    expect(hsnForKind('slab')).toBe('6802');
    expect(hsnForKind('kerb')).toBe('6801');
    expect(hsnForKind('chips')).toBe('2517');
  });
});
