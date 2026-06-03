// ══════════════════════════════════════════════════════
// ZOD VALIDATION SCHEMAS — single source of truth
// ══════════════════════════════════════════════════════

import { z } from 'zod';
import {
  VARIETIES, GRADES, INDIAN_STATES, ROLES, PRODUCTION_STAGES, PAYMENT_MODES,
  PRODUCT_KIND_KEYS, PRODUCT_KINDS,
} from './constants.js';
import { isValidGSTIN } from './gst.js';

const gstinSchema = z.string().length(15)
  .refine(isValidGSTIN, { message: 'Invalid GSTIN format or checksum' });

const optionalGstin = z.string().optional().nullable()
  .refine(v => !v || isValidGSTIN(v), { message: 'Invalid GSTIN' });

// ─── AUTH ───
export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(200),
});

export const userCreateSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-z0-9_.-]+$/i),
  password: z.string().min(8).max(200),
  role: z.enum(ROLES),
  fullName: z.string().min(1).max(100),
});

// ─── PRODUCT (polymorphic — replaces slabSchema) ───
// Each kind validates the dimension fields it actually needs.

const blockDimsSchema = z.object({
  length_m: z.number().positive(),
  width_m: z.number().positive(),
  height_m: z.number().positive(),
  source_quarry: z.string().max(100).optional(),
});

const slabDimsSchema = z.object({
  size_lw: z.string().max(20),              // e.g. "2600×1600"
  thickness_mm: z.number().int().positive(),
  sqft: z.number().positive(),
});

const tileDimsSchema = z.object({
  size_lw: z.string().max(20),              // e.g. "600×600"
  thickness_mm: z.number().int().positive(),
  sqft_per_tile: z.number().positive(),
  pieces_per_box: z.number().int().positive().optional(),
});

const ctsDimsSchema = z.object({
  customer_spec: z.string().max(200).optional(),
  length_mm: z.number().int().positive(),
  width_mm: z.number().int().positive(),
  thickness_mm: z.number().int().positive(),
  sqft: z.number().positive(),
});

const stripDimsSchema = z.object({
  length_mm: z.number().int().positive(),
  width_mm: z.number().int().positive(),
  thickness_mm: z.number().int().positive(),
  rft_per_piece: z.number().positive(),
});

const kerbDimsSchema = z.object({
  profile: z.string().max(50),
  length_mm: z.number().int().positive(),
  height_mm: z.number().int().positive(),
  width_mm: z.number().int().positive(),
});

const cobbleDimsSchema = z.object({
  cobble_type: z.string().max(30),              // small/cube/standard/paving/random
  length_mm: z.number().int().positive(),
  width_mm: z.number().int().positive(),
  height_mm: z.number().int().positive(),
});

const chipsDimsSchema = z.object({
  mesh_size_mm: z.number().positive(),
  bulk_density: z.number().positive().optional(),
});

const dustDimsSchema = z.object({}).passthrough();    // no required dims

const monumentDimsSchema = z.object({
  monument_type: z.string().max(50),            // flat_marker_24x12, slant_24x20, upright_36x24, …
  length_mm: z.number().int().positive(),
  width_mm: z.number().int().positive(),
  thickness_mm: z.number().int().positive(),
  spec_notes: z.string().max(500).optional(),
});

const DIM_BY_KIND_v6 = {
  block:    blockDimsSchema,
  slab:     slabDimsSchema,
  tile:     tileDimsSchema,
  cts:      ctsDimsSchema,
  strip:    stripDimsSchema,
  kerb:     kerbDimsSchema,
  cobble:   cobbleDimsSchema,
  chips:    chipsDimsSchema,
  dust:     dustDimsSchema,
  monument: monumentDimsSchema,
};

const DIMS_BY_KIND = DIM_BY_KIND_v6;

// Base schema without refinement (needed for .partial() to work)
const productBaseSchema = z.object({
  kind: z.enum(PRODUCT_KIND_KEYS),
  variety: z.string().min(1).max(50),
  hsn: z.string().regex(/^\d{4,8}$/).optional(),    // auto-filled from kind if omitted
  uom: z.enum(['cft', 'sqft', 'rft', 'pc', 'tonne', 'bag', 'kg']).optional(),
  grade: z.enum(GRADES).optional().nullable(),
  lot_id: z.string().max(30).optional(),
  current_location_id: z.string().max(30).optional().nullable(),
  rate_paise: z.number().int().nonnegative(),
  stock: z.number().nonnegative().default(0),       // can be fractional for tonnes
  notes: z.string().max(500).optional(),
  dimensions: z.record(z.unknown()).optional(),     // validated per-kind below
});

// Refinement function for dimension validation
const dimensionRefinement = (val, ctx) => {
  const dimSchema = DIMS_BY_KIND[val.kind];
  if (!dimSchema) return;
  const result = dimSchema.safeParse(val.dimensions || {});
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dimensions', ...issue.path],
        message: issue.message,
      });
    }
  }
};

export const productCreateSchema = productBaseSchema.superRefine(dimensionRefinement);
export const productUpdateSchema = productBaseSchema.partial().superRefine(dimensionRefinement);

// ─── Legacy slabSchema — kept for the read-only slabs_legacy endpoint ───
export const slabSchema = z.object({
  id: z.string().min(1).max(20),
  lot_id: z.string().max(20),
  variety: z.string().min(1).max(50),
  size: z.string().max(20),
  thickness_mm: z.number().int().positive(),
  grade: z.enum(GRADES),
  sqft: z.number().positive(),
  rate_paise: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
});

// ─── CUSTOMER ───
export const customerSchema = z.object({
  name: z.string().min(1).max(100),
  gstin: optionalGstin,
  state: z.enum(INDIAN_STATES),
  address: z.string().max(500).optional(),
  contact: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  credit_days: z.number().int().min(0).max(180).default(0),
});

// ─── VENDOR ───
export const vendorSchema = z.object({
  name: z.string().min(1).max(100),
  gstin: optionalGstin,
  state: z.enum(INDIAN_STATES),
  contact: z.string().max(20).optional(),
  type: z.enum(['Quarry', 'Broker', 'Transporter', 'Other']),
  msme: z.boolean().default(false),
  msme_number: z.string().optional(),
  contact_person: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  pincode: z.string().max(10).optional(),
  email: z.string().email().max(100).optional().or(z.literal('')),
});

// ─── INVOICE (polymorphic line items) ───
export const invoiceItemSchema = z.object({
  product_id: z.string().min(1),
  product_kind: z.enum(PRODUCT_KIND_KEYS).optional(),
  variety: z.string().optional(),
  hsn: z.string().regex(/^\d{4,8}$/).optional(),
  uom: z.string().max(10).optional(),
  uom_qty: z.number().positive(),              // e.g. sqft per piece for slabs, weight for chips
  qty: z.number().positive(),                   // number of pieces/units (fractional OK for tonnes)
  rate_paise: z.number().int().nonnegative(),
  dimension_snapshot: z.record(z.unknown()).optional(),

  // ─── Legacy backward-compat shape ───
  slab_id: z.string().optional(),
  size: z.string().optional(),
  grade: z.string().optional(),
  thickness_mm: z.number().int().optional(),
  sqft: z.number().positive().optional(),
});

export const invoiceCreateSchema = z.object({
  customer_id: z.string().min(1),
  items: z.array(invoiceItemSchema).min(1),
  discount_pct: z.number().min(0).max(30).default(0),
  notes: z.string().max(500).optional(),
  collection_account_id: z.string().max(20).optional(),
});

// ─── PURCHASE ORDER ───
export const poCreateSchema = z.object({
  vendor_id: z.string().min(1),
  variety: z.string().min(1),
  blocks: z.number().int().positive(),
  cft: z.number().positive(),
  rate_per_cft_paise: z.number().int().positive(),
  transport_paise: z.number().int().nonnegative().default(0),
  notes: z.string().max(500).optional(),
});

// ─── PRODUCTION JOB (transformation) ───
// Inputs → outputs with cost apportionment.
export const jobInputSchema = z.object({
  product_id: z.string().min(1),
  qty_consumed: z.number().positive(),          // pieces/tonnes/etc consumed
});

export const jobOutputSchema = z.object({
  kind: z.enum(PRODUCT_KIND_KEYS),
  variety: z.string().min(1),
  grade: z.enum(GRADES).optional().nullable(),
  hsn: z.string().regex(/^\d{4,8}$/).optional(),
  uom: z.string().max(10).optional(),
  rate_paise: z.number().int().nonnegative(),
  qty: z.number().positive(),                   // pieces produced
  dimensions: z.record(z.unknown()).optional(),
});

export const jobCreateSchema = z.object({
  lot_id: z.string().min(1),
  stage: z.enum(PRODUCTION_STAGES),
  inputs: z.array(jobInputSchema).min(1),
  outputs: z.array(jobOutputSchema).min(0),     // can be 0 if job still in progress
  labour_paise: z.number().int().nonnegative(),
  power_paise: z.number().int().nonnegative().default(0),
  consumables_paise: z.number().int().nonnegative().default(0),
  yield_pct: z.number().min(0).max(100).optional(),
  damage_count: z.number().int().nonnegative().default(0),
  wastage_count: z.number().int().nonnegative().default(0),
  notes: z.string().max(500).nullable().optional(),
});

// ─── PAYMENT ───
export const paymentCreateSchema = z.object({
  type: z.enum(['receipt', 'payment']),
  invoice_id: z.string().optional(),
  po_id: z.string().optional(),
  cp_id: z.string().optional(),
  party: z.string().min(1),
  amount_paise: z.number().int().positive(),
  mode: z.enum(PAYMENT_MODES),
  category: z.enum(['general','quarry','transport','invoice','refund','advance']).default('general'),
  utr: z.string().max(30).optional(),
  date: z.string().optional(),
  notes: z.string().max(500).optional(),
  apply_advance_paise: z.number().int().min(0).optional(),
});

// ─── DEBIT / CREDIT NOTE ───
export const debitCreditNoteSchema = z.object({
  type: z.enum(['debit', 'credit']),
  ref_invoice_id: z.string().optional(),
  customer_id: z.string().min(1),
  date: z.string().optional(),
  reason: z.string().min(1).max(200),
  taxable_paise: z.number().int().nonnegative(),
  cgst_paise: z.number().int().nonnegative(),
  sgst_paise: z.number().int().nonnegative(),
  igst_paise: z.number().int().nonnegative(),
  notes: z.string().max(500).optional(),
});

// ─── VARIETY MASTER ───
export const varietyMasterSchema = z.object({
  variety_name: z.string().min(1).max(100),
  region: z.enum(['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Rajasthan', 'Other']).default('Other'),
  hsn_default: z.string().regex(/^\d{4,8}$/).default('2516'),
  uom_default: z.enum(['cft', 'sqft', 'rft', 'pc', 'tonne', 'bag', 'kg']).default('sqft'),
  kind_default: z.string().default('slab'),
  typical_grades: z.string().max(50).default('A,A+'),
  photo_url: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(500).optional(),
  active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

// ─── TRANSPORT BILL (update on PO) ───
export const transportUpdateSchema = z.object({
  transport_vendor_id: z.string().optional(),
  transport_bill_no: z.string().max(50).optional(),
  transport_bill_date: z.string().optional(),
  transport_paise: z.number().int().nonnegative().optional(),
  vehicle_no: z.string().max(20).optional(),
  lr_no: z.string().max(30).optional(),
  delivered_at_site: z.boolean().optional(),
  delivered_date: z.string().optional(),
});

// ─── GOODS RECEIPT NOTE ───
export const grnSchema = z.object({
  po_id: z.string().min(1),
  date: z.string().optional(),
  blocks_received: z.number().int().positive(),
  cft_received: z.number().positive(),
  condition_note: z.string().max(500).optional(),
  qc_pass: z.boolean().default(true),
  qc_notes: z.string().max(500).optional(),
  vehicle_no: z.string().max(20).optional(),
  lr_no: z.string().max(30).optional(),
});

// ─── DELIVERY CHALLAN ───
export const deliveryChallanSchema = z.object({
  invoice_id: z.string().optional(),
  customer_id: z.string().min(1),
  delivery_address: z.string().max(500).optional(),
  date: z.string().optional(),
  vehicle_no: z.string().max(20).optional(),
  driver_name: z.string().max(100).optional(),
  driver_phone: z.string().max(15).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(z.object({
    product_id: z.string().optional(),
    description: z.string().min(1).max(200),
    qty: z.number().positive(),
    uom: z.string().max(10).default('sqft'),
    notes: z.string().max(200).optional(),
  })).min(1),
});

// ─── GST FILING PERIOD ───
export const gstFilingUpdateSchema = z.object({
  filed_date: z.string(),
  status: z.enum(['pending', 'filed', 'revised', 'nil']),
  notes: z.string().max(500).optional(),
});

// ─── EMPLOYEE ───
export const employeeSchema = z.object({
  name: z.string().min(1).max(100),
  designation: z.string().max(80).optional(),
  department: z.string().max(80).default('General'),
  joining_date: z.string(),
  pan: z.string().length(10).optional().or(z.literal('')),
  uan: z.string().max(12).optional(),
  esic_no: z.string().max(17).optional(),
  bank_account: z.string().max(20).optional(),
  bank_ifsc: z.string().max(11).optional(),
  salary_type: z.enum(['monthly', 'daily']).default('monthly'),
  basic_salary_paise: z.number().int().positive(),
  hra_paise: z.number().int().default(0),
  conveyance_paise: z.number().int().default(0),
  other_allowance_paise: z.number().int().default(0),
  pf_applicable: z.boolean().default(true),
  esi_applicable: z.boolean().default(false),
  pt_applicable: z.boolean().default(true),
});

// ─── FIXED ASSET ───
export const fixedAssetSchema = z.object({
  name: z.string().min(1).max(150),
  category: z.enum(['Plant & Machinery', 'Vehicles', 'Land & Building', 'Furniture & Fixtures', 'Computer & Peripherals', 'Other']),
  purchase_date: z.string(),
  purchase_cost_paise: z.number().int().positive(),
  description: z.string().max(500).optional(),
  vendor_id: z.string().optional(),
  location: z.string().max(100).optional(),
  serial_no: z.string().max(50).optional(),
  depreciation_method: z.enum(['WDV', 'SLM']).default('WDV'),
  depreciation_rate_pct: z.number().min(0).max(100).default(15.0),
  account_id: z.string().optional(),
});

// ─── PDC ───
export const pdcSchema = z.object({
  type: z.enum(['received', 'issued']),
  cheque_no: z.string().min(1).max(20),
  bank_name: z.string().min(1).max(100),
  branch: z.string().max(100).optional(),
  amount_paise: z.number().int().positive(),
  cheque_date: z.string(),
  customer_id: z.string().optional(),
  vendor_id: z.string().optional(),
  invoice_id: z.string().optional(),
  po_id: z.string().optional(),
  notes: z.string().max(300).optional(),
});

// ─── JOURNAL VOUCHER ───
export const journalVoucherSchema = z.object({
  date: z.string(),
  narration: z.string().min(1).max(500),
  voucher_type: z.enum(['journal', 'contra', 'payment', 'receipt', 'sales', 'purchase', 'debit_note', 'credit_note']),
  ref_id: z.string().optional(),
  ref_type: z.string().optional(),
  entries: z.array(z.object({
    account_id: z.string().min(1),
    debit_paise: z.number().int().default(0),
    credit_paise: z.number().int().default(0),
    narration: z.string().max(200).optional(),
  })).min(2),
});
