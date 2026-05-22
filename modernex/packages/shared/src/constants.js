// ══════════════════════════════════════════════════════
// SHARED CONSTANTS — used by both API and Web
// ══════════════════════════════════════════════════════

const runtimeEnv = (() => {
  const env = {};
  if (typeof process !== 'undefined' && process?.env) Object.assign(env, process.env);
  if (typeof import.meta !== 'undefined' && import.meta.env) Object.assign(env, import.meta.env);
  return env;
})();

function readRateEnv(keys, fallback) {
  for (const key of keys) {
    const rawValue = runtimeEnv[key];
    if (rawValue == null || rawValue === '') continue;
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function formatPercent(rate) {
  const percent = Number(rate) * 100;
  if (Number.isInteger(percent)) return String(percent);
  return percent.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

const DEFAULT_GST_RATE = readRateEnv(['VITE_GST_RATE', 'GST_RATE'], 0.18);
const DEFAULT_CGST_RATE = readRateEnv(['VITE_CGST_RATE', 'CGST_RATE'], DEFAULT_GST_RATE / 2);
const DEFAULT_SGST_RATE = readRateEnv(['VITE_SGST_RATE', 'SGST_RATE'], DEFAULT_GST_RATE / 2);
const DEFAULT_IGST_RATE = readRateEnv(['VITE_IGST_RATE', 'IGST_RATE'], DEFAULT_CGST_RATE + DEFAULT_SGST_RATE);

// ─── HSN codes for granite (Chapter 25) ───
// Granite crosses three HSN codes under the GST schedule. Each has its own rate
// (2515/2516 are configurable here; 2517 aggregates stays at 5% unless overridden separately in code).
export const HSN_CODES = {
  BLOCK:  { code: '2515', rate: DEFAULT_GST_RATE, label: 'Monumental/building stone — blocks, slabs (rough)' },
  WORKED: { code: '2516', rate: DEFAULT_GST_RATE, label: 'Granite, cut/polished — slabs, tiles, cut-to-size' },
  CHIPS:  { code: '2517', rate: 0.05, label: 'Pebbles, gravel, chips, aggregates' },
};

// Legacy — most code paths default to the common worked-granite rate
export const HSN_CODE = HSN_CODES.WORKED.code;  // '2516'
export const GST_RATE = HSN_CODES.WORKED.rate;
export const CGST_RATE = DEFAULT_CGST_RATE;
export const SGST_RATE = DEFAULT_SGST_RATE;
export const IGST_RATE = DEFAULT_IGST_RATE;
export const GST_RATE_LABEL = formatPercent(GST_RATE);
export const CGST_RATE_LABEL = formatPercent(CGST_RATE);
export const SGST_RATE_LABEL = formatPercent(SGST_RATE);
export const IGST_RATE_LABEL = formatPercent(IGST_RATE);

// HOME_STATE drives CGST+SGST vs IGST logic. Reads from env so the same
// shared constants work if the business moves or multi-branch is added.
// In production set HOME_STATE / VITE_HOME_STATE in the .env file.
// Runtime always falls back to company_details.home_state from the DB.
export const HOME_STATE = runtimeEnv['VITE_HOME_STATE'] || runtimeEnv['HOME_STATE'] || 'Tamil Nadu';

export const MSME_PAYMENT_DAYS = 45;
export const MSME_INTEREST_MULTIPLIER = 3;

// These are fallback defaults only. Actual thresholds are read from
// company_details.eway_threshold_paise / einvoice_threshold_paise in the API.
export const EWAYBILL_THRESHOLD = Number(runtimeEnv['VITE_EWAY_THRESHOLD'] || runtimeEnv['EWAY_THRESHOLD'] || 5000000);
export const EINVOICE_THRESHOLD = Number(runtimeEnv['VITE_EINVOICE_THRESHOLD'] || runtimeEnv['EINVOICE_THRESHOLD'] || 0);

// ─── Product kinds ───
// 10 kinds covering the full operational range of a granite quarry+processing business.
// Each kind has a default UOM, default HSN, and a signature set of dimensions.
export const PRODUCT_KINDS = {
  block: {
    label: 'Block',
    uom: 'cft',
    hsn: HSN_CODES.BLOCK.code,
    dimensions: ['length_m', 'width_m', 'height_m'],     // stored in metres
    needs_grade: false,
    description: 'Raw/rough-sawn block from the quarry',
  },
  slab: {
    label: 'Slab',
    uom: 'sqft',
    hsn: HSN_CODES.WORKED.code,
    dimensions: ['size_lw', 'thickness_mm'],             // size_lw like "2600×1600" in mm
    needs_grade: true,
    description: 'Cut and polished slab — main product',
  },
  tile: {
    label: 'Tile',
    uom: 'pc',
    hsn: HSN_CODES.WORKED.code,
    dimensions: ['size_lw', 'thickness_mm', 'pieces_per_box'],
    needs_grade: true,
    description: 'Cut-to-size floor/wall tiles (e.g. 600×600)',
  },
  cts: {
    label: 'Cut-to-Size',
    uom: 'sqft',
    hsn: HSN_CODES.WORKED.code,
    dimensions: ['length_mm', 'width_mm', 'thickness_mm'],
    needs_grade: true,
    description: 'Custom countertops, vanity tops, bespoke cuts',
  },
  strip: {
    label: 'Strip',
    uom: 'rft',                                           // running feet
    hsn: HSN_CODES.WORKED.code,
    dimensions: ['length_mm', 'width_mm', 'thickness_mm'],
    needs_grade: true,
    description: 'Skirting, stair risers, borders',
  },
  kerb: {
    label: 'Kerb Stone',
    uom: 'pc',
    hsn: HSN_CODES.WORKED.code,
    dimensions: ['profile', 'length_mm', 'height_mm', 'width_mm'],
    needs_grade: false,
    description: 'Landscaping and road kerbs',
  },
  cobble: {
    label: 'Cobblestone / Sett',
    uom: 'pc',
    hsn: HSN_CODES.WORKED.code,
    dimensions: ['cobble_type', 'length_mm', 'width_mm', 'height_mm'],
    needs_grade: false,
    description: 'Setts, Belgian blocks, cobbles for paving',
  },
  chips: {
    label: 'Chips / Aggregate',
    uom: 'tonne',
    hsn: HSN_CODES.CHIPS.code,
    dimensions: ['mesh_size_mm', 'bulk_density'],
    needs_grade: false,
    description: 'Crushed waste for terrazzo, flooring, roads',
  },
  dust: {
    label: 'Dust / Powder',
    uom: 'tonne',
    hsn: HSN_CODES.CHIPS.code,
    dimensions: [],
    needs_grade: false,
    description: 'Quarry byproduct — fillers, flooring compound',
  },
  monument: {
    label: 'Monument',
    uom: 'pc',
    hsn: HSN_CODES.WORKED.code,
    dimensions: ['monument_type', 'length_mm', 'width_mm', 'thickness_mm'],
    needs_grade: false,
    description: 'Headstones, markers, memorials (industry-standard specs)',
  },
};

export const PRODUCT_KIND_KEYS = Object.keys(PRODUCT_KINDS);

// ─── Industry-standard specifications ───
// Pickable defaults in the UI. Operators can always override with "Custom…".
export const STANDARD_SPECS = {
  slab: {
    thicknesses_mm: [18, 20, 30, 40],            // 18=domestic, 20=standard export,
                                                  // 30=premium (US/EU preferred), 40=heavy-duty
    sizes_mm: [
      { lw: '3048×914', label: "10′×3′"                },
      { lw: '2743×914', label: "9′×3′"                 },
      { lw: '2438×914', label: "8′×3′"                 },
      { lw: '2134×914', label: "7′×3′"                 },
      { lw: '2600×1600', label: "Standard gang-sawn" },
      { lw: '2700×1800', label: "Large gang-sawn"    },
      { lw: '3000×1800', label: "Export jumbo"       },
      { lw: '3000×2000', label: "XL export"          },
    ],
  },
  tile: {
    thicknesses_mm: [10, 12, 15, 18, 20],
    sizes_mm: [
      { lw: '300×300', label: "12″×12″ (1′×1′)"  },  // entry, bathroom floors
      { lw: '400×400', label: "16″×16″"          },  // India domestic
      { lw: '600×300', label: "24″×12″ (2′×1′)" },  // bathroom/kitchen walls
      { lw: '600×600', label: "24″×24″ (2′×2′)" },  // most common global
      { lw: '800×800', label: "32″×32″"          },  // premium residential
      { lw: '305×305', label: "US 12″ precise"   },  // export to US
    ],
    pieces_per_box: {
      '300×300': 10, '400×400': 8, '600×300': 8,
      '600×600': 4,  '800×800': 2, '305×305': 10,
    },
  },
  cts: {
    thicknesses_mm: [20, 30, 40],
    common_uses: ['Kitchen counter', 'Vanity top', 'Reception desk', 'Island top', 'Staircase tread'],
  },
  cobble: {
    // Standard European cobblestone specs
    types: [
      { key: 'small',       label: "Small cobble",    lw: '100×100', h: 50,  uom: 'pc' },
      { key: 'cube',        label: "Cube sett",       lw: '100×100', h: 100, uom: 'pc' },
      { key: 'standard',    label: "Standard sett",   lw: '200×100', h: 100, uom: 'pc' },
      { key: 'paving',      label: "Paving cobble",   lw: '100×200', h: 50,  uom: 'pc' },
      { key: 'random',      label: "Random split",    lw: 'varies',  h: 50,  uom: 'pc' },
    ],
  },
  kerb: {
    // Standard kerb profiles
    profiles: [
      { key: 'CC-Type-1', label: "CC Type-1 (straight)",     length: 900,  height: 300, width: 150 },
      { key: 'CC-Type-2', label: "CC Type-2 (half-battered)", length: 900, height: 300, width: 150 },
      { key: 'HB-450',    label: "Half-batter 450mm",        length: 900,  height: 450, width: 150 },
      { key: 'BullNose',  label: "Bull-nose edge",           length: 900,  height: 250, width: 125 },
      { key: 'Dropper',   label: "Dropper kerb",             length: 900,  height: 180, width: 150 },
    ],
  },
  monument: {
    // Industry-standard memorial/monument products
    thicknesses_mm: [50, 75, 100, 110, 150, 200],
    types: [
      // Flat markers / ledgers
      { key: 'flat_marker_24x12',  label: "Flat marker 24″×12″×4″",     l: 610,   w: 305,  t: 100 },
      { key: 'flat_marker_36x12',  label: "Flat marker 36″×12″×4″",     l: 915,   w: 305,  t: 100 },
      { key: 'ledger_110',         label: "Ledger stone 110mm",          l: 1830,  w: 760,  t: 110 },
      // Bevel markers
      { key: 'bevel_24x14',        label: "Bevel marker 24″×14″",        l: 610,   w: 355,  t: 100 },
      { key: 'bevel_36x14',        label: "Bevel marker 36″×14″",        l: 915,   w: 355,  t: 100 },
      // Slant
      { key: 'slant_24x20',        label: "Slant memorial 24″×20″",      l: 610,   w: 510,  t: 200 },
      { key: 'slant_36x20',        label: "Slant memorial 36″×20″",      l: 915,   w: 510,  t: 200 },
      // Upright dies + bases
      { key: 'upright_24x24',      label: "Upright die 24″×24″",         l: 610,   w: 610,  t: 150 },
      { key: 'upright_36x24',      label: "Upright die 36″×24″",         l: 915,   w: 610,  t: 150 },
      { key: 'upright_48x24',      label: "Upright die 48″×24″",         l: 1220,  w: 610,  t: 150 },
      { key: 'base_36x12',         label: "Base 36″×12″",                l: 915,   w: 305,  t: 100 },
      { key: 'base_48x14',         label: "Base 48″×14″",                l: 1220,  w: 355,  t: 150 },
      // Columbarium / vault
      { key: 'columbarium_12x12',  label: "Columbarium 12″×12″",         l: 305,   w: 305,  t: 25 },
      { key: 'columbarium_12x24',  label: "Columbarium 12″×24″",         l: 610,   w: 305,  t: 25 },
      // Mausoleum
      { key: 'mausoleum_3x8',      label: "Mausoleum slab 3′×8′",        l: 2440,  w: 915,  t: 100 },
    ],
    // Typical varieties used for monument work in export markets (India→US/UK/EU)
    common_varieties: ['Absolute Black', 'Imperial Red', 'Paradiso Classic', 'Kashmir White', 'Bahama Blue'],
  },
};

export const UOM_LABELS = {
  cft:   'CFT',         // cubic feet
  sqft:  'sq.ft',
  rft:   'rft',         // running feet
  pc:    'pc',          // piece
  tonne: 'MT',          // metric tonne
  bag:   'bag',
  kg:    'kg',
};

/** Get HSN + GST rate for a product kind (fallback to worked-granite default). */
export function hsnForKind(kind) {
  return PRODUCT_KINDS[kind]?.hsn || HSN_CODE;
}

export function gstRateForHSN(hsn) {
  for (const v of Object.values(HSN_CODES)) {
    if (v.code === hsn) return v.rate;
  }
  return GST_RATE;
}

// Granite varieties operationally sold from Chendarapalli quarry belt
export const VARIETIES = [
  'Paradiso Classic',
  'Paradiso Extra',
  'Multicolour Red',
  'Tan Brown',
  'Black Galaxy',
  'Vizag Blue',
  'Steel Grey',
  'Absolute Black',
  'Kashmir White',
  'Colombo Juparana',
];

export const GRADES = ['A+', 'A', 'B'];

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Puducherry', 'Chandigarh', 'Jammu and Kashmir', 'Ladakh',
];

export const GSTIN_STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export const ROLES = ['admin', 'accounts', 'yard', 'sales'];

// Production stages now apply to BLOCK→SLAB transformations specifically.
// Other transformations (SLAB→TILE, SLAB→CTS) have their own stage taxonomy.
export const PRODUCTION_STAGES = ['split', 'cut', 'polish', 'done'];

export const PAYMENT_MODES = ['Cash', 'NEFT', 'RTGS', 'UPI', 'Cheque', 'Manual'];

export const INVOICE_STATUS = ['draft', 'pending', 'paid', 'overdue', 'cancelled'];
