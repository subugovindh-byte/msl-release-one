// ══════════════════════════════════════════════════════
// GST HELPERS — pure functions for tax calculation
// All amounts in PAISE (integer ₹ × 100) to avoid float drift.
// ══════════════════════════════════════════════════════

import {
  GST_RATE, CGST_RATE, SGST_RATE, IGST_RATE,
  HOME_STATE, GSTIN_STATE_CODES, HSN_CODE, gstRateForHSN,
} from './constants.js';

// ─── Paise conversion ───
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const fromPaise = (paise) => Number(paise) / 100;

// ─── Format for display ───
export const formatINR = (paise) => {
  const rupees = fromPaise(paise);
  return '₹\u202f' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
};

export const formatINRCompact = (paise) => {
  const r = fromPaise(paise);
  if (r >= 1e7) return '₹' + (r / 1e7).toFixed(2) + 'Cr';
  if (r >= 1e5) return '₹' + (r / 1e5).toFixed(2) + 'L';
  if (r >= 1e3) return '₹' + (r / 1e3).toFixed(1) + 'K';
  return '₹' + r.toFixed(0);
};

// ─── GSTIN validation ───
// Format: 2 digits state + 10 PAN + 1 entity + 1 Z + 1 checksum = 15 chars
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGSTIN(gstin) {
  if (!gstin || typeof gstin !== 'string') return false;
  if (gstin.length !== 15) return false;
  if (!GSTIN_REGEX.test(gstin)) return false;
  return verifyGSTINChecksum(gstin);
}

function verifyGSTINChecksum(gstin) {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const factor = (i % 2 === 0) ? 1 : 2;
    const code = charset.indexOf(gstin[i]);
    const prod = code * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checksum = charset[(36 - (sum % 36)) % 36];
  return checksum === gstin[14];
}

export function stateFromGSTIN(gstin) {
  if (!gstin || gstin.length < 2) return null;
  return GSTIN_STATE_CODES[gstin.slice(0, 2)] || null;
}

// ─── Calculate GST split ───
// Returns integer paise amounts for each component.
// Inter-state (IGST) fires when buyer's state differs from seller's HOME_STATE.
export function calculateGST(taxablePaise, buyerState, rate = GST_RATE) {
  const taxable = Math.round(taxablePaise);
  const totalTax = Math.round(taxable * rate);

  const inter = buyerState && buyerState !== HOME_STATE;
  if (inter) {
    return {
      mode: 'IGST',
      cgst: 0,
      sgst: 0,
      igst: totalTax,
      totalTax,
      grandTotal: taxable + totalTax,
    };
  }

  const cgst = Math.round(taxable * (rate / 2));
  const sgst = totalTax - cgst; // ensures sum matches exactly
  return {
    mode: 'CGST+SGST',
    cgst,
    sgst,
    igst: 0,
    totalTax,
    grandTotal: taxable + totalTax,
  };
}

// ─── Invoice line calculation ───
/**
 * Calculate invoice totals.
 *
 * Each item supports either the legacy sqft shape OR the new polymorphic shape:
 *   Legacy:       { rate_paise, sqft, qty }
 *   Polymorphic:  { rate_paise, qty, uom_qty?, hsn? }
 *
 * `uom_qty` is the quantity in the UOM (sqft for slab/cts, pc for tile/kerb,
 * tonne for chips, rft for strip, cft for block). When absent, falls back to
 * `sqft` for backward compat — existing callers work unchanged.
 *
 * When items carry different HSN codes with different GST rates (e.g. a bill
 * mixing chips at 5% with slabs at 12%), we group by rate and sum tax per group,
 * then aggregate. This is GSTR-1 compliant — each rate is reported separately.
 */
export function calculateInvoice(items, buyerState, discountPct = 0) {
  // ─── 1. Compute gross per-line ───
  const enriched = items.map(it => {
    const uomQty = it.uom_qty != null ? Number(it.uom_qty)
                 : it.sqft != null   ? Number(it.sqft)
                 : 1;
    const qty = Number(it.qty ?? 1);
    const gross = Math.round(it.rate_paise * uomQty * qty);
    const hsn = it.hsn || HSN_CODE;
    return { ...it, uomQty, qty, gross, hsn };
  });

  const grossPaise = enriched.reduce((s, it) => s + it.gross, 0);
  const discountPaise = Math.round(grossPaise * (discountPct / 100));
  const taxable = grossPaise - discountPaise;

  // ─── 2. Group by HSN (and its rate) ───
  // When multi-HSN, we apportion the (gross - discount) by each line's share of gross.
  const hsnGroups = {};
  for (const it of enriched) {
    const share = grossPaise > 0 ? it.gross / grossPaise : 0;
    const lineTaxable = Math.round(taxable * share);
    const rate = gstRateForHSN(it.hsn);
    if (!hsnGroups[it.hsn]) {
      hsnGroups[it.hsn] = { hsn: it.hsn, rate, taxable: 0 };
    }
    hsnGroups[it.hsn].taxable += lineTaxable;
  }

  // ─── 3. Compute tax per group ───
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;
  const groups = Object.values(hsnGroups).map(g => {
    const tax = calculateGST(g.taxable, buyerState, g.rate);
    totalCgst += tax.cgst;
    totalSgst += tax.sgst;
    totalIgst += tax.igst;
    return { ...g, ...tax };
  });

  const totalTax = totalCgst + totalSgst + totalIgst;
  const grandTotal = taxable + totalTax;
  // Mode is 'mixed' if two or more HSN groups exist, else the single mode
  const mode = groups.length === 1 ? groups[0].mode
             : groups.length === 0 ? 'CGST+SGST'
             : 'mixed';

  return {
    grossPaise,
    discountPaise,
    taxable,
    cgst: totalCgst,
    sgst: totalSgst,
    igst: totalIgst,
    totalTax,
    grandTotal,
    mode,
    hsn_groups: groups,   // detailed per-HSN breakdown for GSTR-1
  };
}

// ─── IRN generation (client-side stub for IRP API response) ───
// In production, this comes from einvoice1.gst.gov.in
export function generateIRN() {
  const chars = '0123456789abcdef';
  return Array.from({ length: 32 }, () =>
    chars[Math.floor(Math.random() * 16)]
  ).join('');
}

// ─── e-Way Bill number stub ───
export function generateEWayBill() {
  const year = new Date().getFullYear().toString().slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const day = String(new Date().getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
  return `EWB${year}${month}${day}${seq}`;
}

// ─── Check if e-Way Bill is required ───
export function requiresEWayBill(invoiceTotalPaise) {
  return fromPaise(invoiceTotalPaise) > 50000;
}

export { HSN_CODE };
