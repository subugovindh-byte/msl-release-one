// ════════════════════════════════════════════════════════════════════════
// Global UI tokens — single source of truth for colours & common styles.
//
// Colours resolve to the CSS variables defined in theme.css, so light/dark
// themes are handled automatically. Import these instead of hardcoding hex
// or re-declaring per-page status maps.
//
//   import { TONE, statusTone, ghostBtn, primaryBtn, softChip, dot } from '@/styles/ui';
// ════════════════════════════════════════════════════════════════════════

import type { CSSProperties } from 'react';

// ── Raw palette (theme-aware via CSS vars) ──
export const C = {
  rust:  'var(--rust)',  rustW:  'var(--rustW)',  rustB:  'var(--rustB)',
  sage:  'var(--sage)',  sageW:  'var(--sageW)',  sageB:  'var(--sageB)',
  blue:  'var(--blue)',  blueW:  'var(--blueW)',  blueB:  'var(--blueB)',
  amber: 'var(--amber)', amberW: 'var(--amberW)', amberB: 'var(--amberB)',
  gold:  'var(--gold)',  goldW:  'var(--goldW)',  goldB:  'var(--goldB)',
  red:   'var(--red)',   redW:   'var(--redW)',   redB:   'var(--redB)',
  t1: 'var(--t1)', t2: 'var(--t2)', t3: 'var(--t3)',
  bd: 'var(--bd)', bg0: 'var(--bg0)', bg1: 'var(--bg1)', bg2: 'var(--bg2)', bg3: 'var(--bg3)',
} as const;

// ── Semantic tones: a colour + its soft wash, for badges/chips ──
export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'brand';
export const TONE: Record<Tone, { color: string; bg: string }> = {
  neutral: { color: C.t2,    bg: C.bg3   },
  info:    { color: C.blue,  bg: C.blueW },
  success: { color: C.sage,  bg: C.sageW },
  warn:    { color: C.amber, bg: C.amberW },
  danger:  { color: C.red,   bg: C.redW  },
  brand:   { color: C.rust,  bg: C.rustW },
};

// ── Map common status strings → a semantic tone (used app-wide) ──
const STATUS_TONE: Record<string, Tone> = {
  // positive / settled
  approved: 'success', paid: 'success', active: 'success', confirmed: 'success',
  completed: 'success', cleared: 'success', filed: 'success', po_raised: 'success',
  // in-flight / info
  new: 'info', open: 'info', draft: 'info', submitted: 'info', deposited: 'info',
  // waiting / caution
  pending: 'warn', partial: 'warn', received: 'warn', hold: 'warn', overdue: 'warn', due: 'warn',
  // negative
  cancelled: 'danger', rejected: 'danger', unpaid: 'danger', failed: 'danger', bounced: 'danger', returned: 'danger',
  // terminal neutral
  closed: 'neutral', inactive: 'neutral', archived: 'neutral',
};

export function statusTone(status?: string): { color: string; bg: string } {
  if (!status) return TONE.neutral;
  return TONE[STATUS_TONE[status.toLowerCase()] ?? 'neutral'];
}

// ── Shared component styles ──
export const primaryBtn: CSSProperties = {
  padding: '7px 16px', background: C.rust, color: '#fff', border: 'none',
  borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
export const ghostBtn: CSSProperties = {
  padding: '7px 14px', background: 'transparent', color: C.t2,
  border: `1px solid ${C.bd}`, borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
export const dangerBtn: CSSProperties = { ...ghostBtn, color: C.red };

// Soft neutral chip + coloured status dot — the standard status indicator.
export const softChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 11px',
  borderRadius: 20, fontSize: 11, fontWeight: 700,
  background: C.bg2, color: C.t2, border: `1px solid ${C.bd}`,
};
export const dot = (color: string): CSSProperties => ({
  width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
});

// Convenience: a full status badge (tinted, no dot) — for grids/tables.
export function badge(status?: string): CSSProperties {
  const t = statusTone(status);
  return {
    display: 'inline-block', padding: '2px 9px', borderRadius: 20,
    fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
    color: t.color, background: t.bg,
  };
}
