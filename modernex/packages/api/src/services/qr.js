import QRCode from 'qrcode';
import { fromPaise } from '@modernex/shared';
import { logger } from '../utils/logger.js';

/**
 * QR code generation service.
 *
 * Four QR types:
 *   1. UPI payment QR   — scannable by any UPI app (GPay, PhonePe, Paytm, etc.)
 *   2. IRN signed QR    — mandated by GST e-invoice; renders the IRP signed JWT
 *   3. Slab label QR    — deep-link to /trace/product/<id> for yard scanning
 *   4. Invoice link QR  — deep-link to /invoices/<id> for delivery slip
 *
 * Renderers available:
 *   toDataURL(...)  — PNG data URL suitable for <img src="..."> or PDF embed
 *   toBuffer(...)   — raw PNG Buffer
 *   toString(...)   — SVG string or UTF-8 ASCII art
 */

// ─── UPI QR ───

/**
 * Build a UPI payment URI per NPCI spec.
 * Scanning this in any UPI app opens a pre-filled payment screen.
 *
 * Spec:   https://www.npci.org.in/PDF/npci/upi/Unified-Payment-Interface-UPI-FAQs.pdf
 * Format: upi://pay?pa=<vpa>&pn=<name>&am=<amount>&tr=<txn_ref>&tn=<note>&cu=INR
 */
export function buildUPIUri({
  upiId, payeeName, amountPaise, invoiceId, note,
}) {
  if (!upiId) throw new Error('upiId required');
  const params = new URLSearchParams();
  params.set('pa', upiId);
  if (payeeName) params.set('pn', payeeName);
  if (amountPaise != null) {
    params.set('am', fromPaise(amountPaise).toFixed(2));
  }
  if (invoiceId) params.set('tr', invoiceId);          // transaction reference
  if (note) params.set('tn', note.slice(0, 50));
  params.set('cu', 'INR');
  return 'upi://pay?' + params.toString();
}

/**
 * UPI QR as a PNG data URL. Use in PDFs and web pages.
 */
export async function upiQRDataURL(upiArgs, options = {}) {
  const uri = buildUPIUri(upiArgs);
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: options.width || 256,
    color: {
      dark: options.dark || '#000000',
      light: options.light || '#ffffff',
    },
  });
}

export async function upiQRBuffer(upiArgs, options = {}) {
  const uri = buildUPIUri(upiArgs);
  return QRCode.toBuffer(uri, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: options.width || 400,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

export async function upiQRSVG(upiArgs, options = {}) {
  const uri = buildUPIUri(upiArgs);
  return QRCode.toString(uri, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: options.width || 200,
  });
}

// ─── IRN SIGNED QR ───
// The IRP returns a signed base64 JWT. It must be rendered as-is on the invoice.
// Don't add, remove, or pretty-print it — the signature would break.
export async function signedIRNQRDataURL(signedPayload, options = {}) {
  if (!signedPayload) return null;
  return QRCode.toDataURL(signedPayload, {
    errorCorrectionLevel: 'M',     // GST rules: tolerance enough for dirty print
    margin: 1,
    width: options.width || 180,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

// ─── SLAB LABEL QR ───
// For yard labels — scans to a deep link that opens the slab in the web app
export async function slabQRDataURL(slabId, baseUrl, options = {}) {
  const url = `${baseUrl}/trace/product/${encodeURIComponent(slabId)}`;
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',     // High — labels get dirty on slabs
    margin: 2,
    width: options.width || 300,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

// ─── INVOICE LINK QR ───
export async function invoiceQRDataURL(invoiceId, baseUrl, options = {}) {
  const url = `${baseUrl}/invoices/${encodeURIComponent(invoiceId)}`;
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: options.width || 200,
  });
}

/**
 * Generate a printable slab label HTML page (8 per A4 sheet).
 * Yard staff print this and stick on the slabs for identification.
 */
export async function generateSlabLabelHTML(slabs, baseUrl) {
  const entries = await Promise.all(slabs.map(async slab => {
    const qr = await slabQRDataURL(slab.id, baseUrl);
    return `
      <div class="label">
        <div class="qr"><img src="${qr}" alt="${slab.id}"/></div>
        <div class="meta">
          <div class="id">${slab.id}</div>
          <div class="var">${escapeHtml(slab.variety)}</div>
          <div class="dim">${slab.size || ''}mm · ${slab.thickness_mm || slab.tk || ''}mm · Gr.${slab.grade || ''}</div>
          <div class="lot">Lot ${slab.lot_id || slab.lot || ''} · ${slab.sqft || ''}sqft</div>
        </div>
      </div>`;
  }));
  return `<!DOCTYPE html>
<html><head><style>
  @page { size: A4; margin: 10mm; }
  body { font-family: 'Helvetica', sans-serif; margin: 0; }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .label { border: 1px solid #000; padding: 4mm; display: flex; gap: 4mm; align-items: center; page-break-inside: avoid; }
  .qr img { width: 30mm; height: 30mm; display: block; }
  .meta { flex: 1; }
  .id { font-family: monospace; font-size: 14pt; font-weight: bold; }
  .var { font-size: 12pt; font-weight: 600; margin-top: 2mm; }
  .dim { font-size: 9pt; color: #444; margin-top: 2mm; }
  .lot { font-size: 8pt; color: #666; margin-top: 1mm; font-family: monospace; }
  @media print { .label { break-inside: avoid; } }
</style></head><body><div class="sheet">${entries.join('')}</div></body></html>`;
}

/**
 * Polymorphic label sheet — renders kind-appropriate layout per product.
 *
 * Layouts:
 *   block       — 6 per A4 (large — needs room for L×W×H + CFT + quarry)
 *   slab        — 8 per A4 (2×4 grid, same as generateSlabLabelHTML)
 *   cts         — 8 per A4 (customer spec visible)
 *   tile        — 12 per A4 (3×4 small labels)
 *   kerb        — 6 per A4 (profile + dims)
 *   monument    — 6 per A4 (spec JSON preview)
 *   chips/dust  — 12 per A4 (mesh + tonnes only)
 *
 * When the input mixes kinds, groups each kind onto its own sheet.
 */
export async function generateProductLabelHTML(products, baseUrl) {
  // Group by kind so each kind gets its own optimal layout
  const byKind = {};
  for (const p of products) {
    (byKind[p.kind] ||= []).push(p);
  }

  let sheetsHtml = '';
  for (const [kind, items] of Object.entries(byKind)) {
    sheetsHtml += await renderSheet(kind, items, baseUrl);
  }

  return `<!DOCTYPE html>
<html><head><title>Product Labels</title><style>
  @page { size: A4; margin: 8mm; }
  body { font-family: 'Helvetica', Arial, sans-serif; margin: 0; color: #111; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .grid-2x3 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .grid-2x4 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .grid-3x4 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; }
  .label { border: 1px solid #000; padding: 4mm; page-break-inside: avoid; display: flex; gap: 4mm; align-items: center; }
  .label-compact { border: 1px solid #000; padding: 3mm; page-break-inside: avoid; }
  .qr img { display: block; }
  .qr-lg img { width: 32mm; height: 32mm; }
  .qr-md img { width: 24mm; height: 24mm; }
  .qr-sm img { width: 18mm; height: 18mm; }
  .meta { flex: 1; min-width: 0; }
  .id { font-family: 'Courier New', monospace; font-size: 13pt; font-weight: bold; letter-spacing: 0.5px; }
  .id-sm { font-family: 'Courier New', monospace; font-size: 10pt; font-weight: bold; }
  .kind-badge { display: inline-block; font-size: 7pt; font-weight: 700; letter-spacing: 1px;
                padding: 1pt 4pt; border: 1px solid #000; border-radius: 2pt; margin-bottom: 2mm; }
  .var { font-size: 11pt; font-weight: 600; margin-top: 1mm; }
  .var-sm { font-size: 9pt; font-weight: 600; margin-top: 0.5mm; }
  .dim { font-size: 8.5pt; color: #333; margin-top: 1.5mm; line-height: 1.4; }
  .dim-sm { font-size: 7pt; color: #444; margin-top: 1mm; line-height: 1.3; }
  .lot { font-size: 7pt; color: #666; margin-top: 1mm; font-family: monospace; }
  .hsn { font-size: 6.5pt; color: #888; font-family: monospace; }
  .center { text-align: center; }
  @media print { .label, .label-compact { break-inside: avoid; } }
</style></head><body>${sheetsHtml}</body></html>`;
}

async function renderSheet(kind, items, baseUrl) {
  const layoutMap = {
    block:    { grid: 'grid-2x3', size: 'qr-lg', render: renderBlockLabel },
    slab:     { grid: 'grid-2x4', size: 'qr-md', render: renderSlabLabel },
    cts:      { grid: 'grid-2x4', size: 'qr-md', render: renderCtsLabel },
    tile:     { grid: 'grid-3x4', size: 'qr-sm', render: renderTileLabel },
    kerb:     { grid: 'grid-2x3', size: 'qr-lg', render: renderKerbLabel },
    cobble:   { grid: 'grid-3x4', size: 'qr-sm', render: renderCobbleLabel },
    monument: { grid: 'grid-2x3', size: 'qr-lg', render: renderMonumentLabel },
    chips:    { grid: 'grid-3x4', size: 'qr-sm', render: renderChipsLabel },
    dust:     { grid: 'grid-3x4', size: 'qr-sm', render: renderDustLabel },
    strip:    { grid: 'grid-2x4', size: 'qr-md', render: renderStripLabel },
  };
  const cfg = layoutMap[kind] || layoutMap.slab;

  const entries = await Promise.all(items.map(async p => {
    const qr = await slabQRDataURL(p.id, baseUrl);
    return cfg.render(p, qr, cfg.size);
  }));

  return `<div class="sheet"><div class="${cfg.grid}">${entries.join('')}</div></div>`;
}

function renderSlabLabel(p, qr, qrClass) {
  return `
    <div class="label">
      <div class="qr ${qrClass}"><img src="${qr}" alt="${p.id}"/></div>
      <div class="meta">
        <div class="kind-badge">SLAB</div>
        <div class="id">${p.id}</div>
        <div class="var">${escapeHtml(p.variety)}</div>
        <div class="dim">${p.slab_size || '—'}mm · ${p.slab_tk || ''}mm · Gr.${p.grade || '—'}</div>
        <div class="lot">Lot ${p.lot_id || '—'} · ${p.slab_sqft || '—'} sqft · HSN ${p.hsn}</div>
      </div>
    </div>`;
}

function renderBlockLabel(p, qr, qrClass) {
  const vol = p.cft ? `${p.cft} CFT` : '';
  const dims = [p.length_m, p.width_m, p.height_m].filter(Boolean).join('×') + (p.length_m ? ' m' : '');
  return `
    <div class="label">
      <div class="qr ${qrClass}"><img src="${qr}" alt="${p.id}"/></div>
      <div class="meta">
        <div class="kind-badge">BLOCK</div>
        <div class="id">${p.id}</div>
        <div class="var">${escapeHtml(p.variety)}</div>
        <div class="dim">${dims} · ${vol}</div>
        <div class="lot">Lot ${p.lot_id || '—'} · ${escapeHtml(p.source_quarry || 'Own quarry')}</div>
        <div class="hsn">HSN ${p.hsn} · UOM: CFT</div>
      </div>
    </div>`;
}

function renderCtsLabel(p, qr, qrClass) {
  const spec = p.customer_spec ? escapeHtml(p.customer_spec).slice(0, 60) : '';
  return `
    <div class="label">
      <div class="qr ${qrClass}"><img src="${qr}" alt="${p.id}"/></div>
      <div class="meta">
        <div class="kind-badge">CUT-TO-SIZE</div>
        <div class="id">${p.id}</div>
        <div class="var">${escapeHtml(p.variety)}</div>
        <div class="dim">${p.cts_l || ''}×${p.cts_w || ''}mm · ${p.cts_sqft || ''} sqft · Gr.${p.grade || '—'}</div>
        ${spec ? `<div class="lot">${spec}</div>` : ''}
        <div class="hsn">HSN ${p.hsn}</div>
      </div>
    </div>`;
}

function renderTileLabel(p, qr, qrClass) {
  return `
    <div class="label-compact center">
      <div class="qr ${qrClass}" style="margin:0 auto"><img src="${qr}" alt="${p.id}"/></div>
      <div class="kind-badge" style="margin-top:2mm">TILE</div>
      <div class="id-sm">${p.id}</div>
      <div class="var-sm">${escapeHtml(p.variety)}</div>
      <div class="dim-sm">${p.tile_size || '—'}mm · ${p.sqft_per_tile || ''}sqft</div>
      <div class="dim-sm">${p.pieces_per_box ? p.pieces_per_box + ' per box · ' : ''}Gr.${p.grade || '—'}</div>
    </div>`;
}

function renderKerbLabel(p, qr, qrClass) {
  return `
    <div class="label">
      <div class="qr ${qrClass}"><img src="${qr}" alt="${p.id}"/></div>
      <div class="meta">
        <div class="kind-badge">KERB</div>
        <div class="id">${p.id}</div>
        <div class="var">${escapeHtml(p.variety)}</div>
        <div class="dim">Profile: ${escapeHtml(p.kerb_profile || '—')}</div>
        <div class="dim">Length: ${p.kerb_l || '—'}mm</div>
        <div class="hsn">HSN ${p.hsn} · UOM: piece</div>
      </div>
    </div>`;
}

function renderMonumentLabel(p, qr, qrClass) {
  const dims = [p.mon_l, p.mon_w, p.mon_t].filter(Boolean).join('×') + (p.mon_l ? 'mm' : '');
  return `
    <div class="label">
      <div class="qr ${qrClass}"><img src="${qr}" alt="${p.id}"/></div>
      <div class="meta">
        <div class="kind-badge">MONUMENT</div>
        <div class="id">${p.id}</div>
        <div class="var">${escapeHtml(p.variety)}</div>
        <div class="dim">${escapeHtml(p.monument_type || '—')}</div>
        <div class="dim">${dims}</div>
        ${p.spec_notes ? `<div class="lot">${escapeHtml(p.spec_notes).slice(0, 50)}</div>` : ''}
        <div class="hsn">HSN ${p.hsn}</div>
      </div>
    </div>`;
}

function renderCobbleLabel(p, qr, qrClass) {
  const dims = [p.cobble_l, p.cobble_w, p.cobble_h].filter(Boolean).join('×') + 'mm';
  return `
    <div class="label-compact center">
      <div class="qr ${qrClass}" style="margin:0 auto"><img src="${qr}" alt="${p.id}"/></div>
      <div class="kind-badge" style="margin-top:2mm">COBBLE</div>
      <div class="id-sm">${p.id}</div>
      <div class="var-sm">${escapeHtml(p.variety)}</div>
      <div class="dim-sm">${escapeHtml(p.cobble_type || '—')}</div>
      <div class="dim-sm">${dims}</div>
    </div>`;
}

function renderChipsLabel(p, qr, qrClass) {
  return `
    <div class="label-compact center">
      <div class="qr ${qrClass}" style="margin:0 auto"><img src="${qr}" alt="${p.id}"/></div>
      <div class="kind-badge" style="margin-top:2mm">CHIPS</div>
      <div class="id-sm">${p.id}</div>
      <div class="var-sm">${escapeHtml(p.variety)}</div>
      <div class="dim-sm">${p.mesh_size_mm || '—'}mm mesh</div>
      <div class="dim-sm">HSN ${p.hsn} · tonne</div>
    </div>`;
}

function renderDustLabel(p, qr, qrClass) {
  return `
    <div class="label-compact center">
      <div class="qr ${qrClass}" style="margin:0 auto"><img src="${qr}" alt="${p.id}"/></div>
      <div class="kind-badge" style="margin-top:2mm">DUST</div>
      <div class="id-sm">${p.id}</div>
      <div class="var-sm">${escapeHtml(p.variety)}</div>
      <div class="dim-sm">HSN ${p.hsn} · tonne</div>
    </div>`;
}

function renderStripLabel(p, qr, qrClass) {
  return `
    <div class="label">
      <div class="qr ${qrClass}"><img src="${qr}" alt="${p.id}"/></div>
      <div class="meta">
        <div class="kind-badge">STRIP</div>
        <div class="id">${p.id}</div>
        <div class="var">${escapeHtml(p.variety)}</div>
        <div class="dim">${p.cts_l || ''}×${p.cts_w || ''}mm · Gr.${p.grade || '—'}</div>
        <div class="hsn">HSN ${p.hsn} · UOM: rft</div>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Re-export QRCode in case other modules want direct access
export { QRCode };
