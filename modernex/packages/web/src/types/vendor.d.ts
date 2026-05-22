// Ambient type declarations for JS packages without TypeScript types

declare module '@modernex/shared' {
  // Constants from constants.js
  export const HSN_CODE: string;
  export const GST_RATE: number;
  export const CGST_RATE: number;
  export const SGST_RATE: number;
  export const IGST_RATE: number;
  export const GST_RATE_LABEL: string;
  export const CGST_RATE_LABEL: string;
  export const SGST_RATE_LABEL: string;
  export const IGST_RATE_LABEL: string;
  export const HOME_STATE: string;
  export const MSME_PAYMENT_DAYS: number;
  export const MSME_INTEREST_MULTIPLIER: number;
  export const EWAYBILL_THRESHOLD: number;
  export const EINVOICE_THRESHOLD: number;
  export const PAYMENT_MODES: string[];
  export const INVOICE_STATUS: string[];
  export const PRODUCTION_STAGES: string[];
  export const ROLES: string[];
  export const VARIETIES: string[];
  export const GRADES: string[];
  export const INDIAN_STATES: string[];
  export const GSTIN_STATE_CODES: Record<string, string>;
  export const PRODUCT_KIND_KEYS: string[];
  export const UOM_LABELS: Record<string, string>;
  export const HSN_CODES: Record<string, { code: string; rate: number; label: string }>;
  export const PRODUCT_KINDS: Record<string, {
    label: string; uom: string; hsn: string;
    dimensions: string[]; needs_grade: boolean; description: string;
  }>;
  export const STANDARD_SPECS: {
    slab: { thicknesses_mm: number[]; sizes_mm: Array<{ lw: string; label: string }> };
    tile: { thicknesses_mm: number[]; sizes_mm: Array<{ lw: string; label: string }>; pieces_per_box: Record<string, number> };
    cobble: { types: Array<{ key: string; label: string; lw: string; h: number; uom: string }> };
    monument: { thicknesses_mm: number[]; types: Array<{ key: string; label: string; l: number; w: number; t: number }>; common_varieties: string[] };
    cts: { thicknesses_mm: number[]; common_uses: string[] };
    kerb: { profiles: Array<{ key: string; label: string; length: number; height: number; width: number }> };
    strip: Record<string, unknown>;
  };

  // Functions from constants.js
  export function hsnForKind(kind: string): string;
  export function gstRateForHSN(hsn: string): number;

  // GST helpers from gst.js
  export function toPaise(rupees: number): number;
  export function fromPaise(paise: number): number;
  export function formatINR(paise: number): string;
  export function formatINRCompact(paise: number): string;
  export function isValidGSTIN(gstin: string): boolean;
  export function stateFromGSTIN(gstin: string): string | null;
  export function isInterState(customerState: string): boolean;
  export function calculateInvoice(
    items: Array<{ rate_paise: number; uom_qty?: number; qty?: number; hsn?: string; sqft?: number }>,
    buyerState?: string,
    discountPct?: number
  ): {
    grossPaise: number;
    discountPaise: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    grandTotal: number;
    mode: string;
    groups: Array<{ hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>;
  };

  // Schemas from schemas.js
  export const loginSchema: unknown;
}

declare module 'qrcode' {
  export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
  export function toString(text: string, options?: Record<string, unknown>): Promise<string>;
}
