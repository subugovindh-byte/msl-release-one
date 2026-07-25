import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { NotFoundError, AppError } from '../middleware/error.js';
import {
  upiQRBuffer, signedIRNQRDataURL,
  slabQRDataURL, invoiceQRDataURL, generateSlabLabelHTML, generateProductLabelHTML,
} from '../services/qr.js';

export const qrRouter = Router();
qrRouter.use(authenticate);

/**
 * Resolve the UPI context for an invoice:
 *   1. Prefer the invoice's collection_account_id
 *   2. Fall back to the default collection account
 *   3. Fall back to config.company.upi (legacy)
 */
function resolveInvoiceUPI(invoice) {
  const db = getDb();
  let account = null;
  if (invoice.collection_account_id) {
    account = db.prepare(
      'SELECT * FROM collection_accounts WHERE id = ? AND active = 1'
    ).get(invoice.collection_account_id);
  }
  if (!account) {
    account = db.prepare(
      'SELECT * FROM collection_accounts WHERE is_default = 1 AND active = 1'
    ).get();
  }
  if (account && (account.kind === 'upi' || account.kind === 'both')) {
    return {
      upiId: account.upi_id,
      payeeName: account.upi_name || config.company.name,
      account,
    };
  }
  // Legacy fallback
  return {
    upiId: config.company.upi,
    payeeName: config.company.name,
    account: null,
  };
}

// ─── GET /qr/upi/invoice/:id ───
qrRouter.get('/upi/invoice/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const invoice = db.prepare(
      'SELECT id, total_paise, customer_name, collection_account_id FROM invoices WHERE id = ?'
    ).get(req.params.id);
    if (!invoice) throw new NotFoundError('Invoice not found');

    const { upiId, payeeName } = resolveInvoiceUPI(invoice);
    if (!upiId) throw new AppError('No UPI account configured', 400);

    const buffer = await upiQRBuffer({
      upiId, payeeName,
      amountPaise: invoice.total_paise,
      invoiceId: invoice.id,
      note: `${payeeName} · ${invoice.id}`,
    }, { width: Number(req.query.size) || 400 });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) { next(err); }
});

// ─── GET /qr/upi/ad-hoc?upi=...&amount=...&ref=... ───
// For on-screen ad-hoc collections (not tied to an invoice yet)
qrRouter.get('/upi/ad-hoc', async (req, res, next) => {
  try {
    const { upi, amount, ref, name, account_id } = req.query;
    let upiId = upi;
    let payeeName = name;

    if (account_id) {
      const db = getDb();
      const a = db.prepare(
        'SELECT * FROM collection_accounts WHERE id = ? AND active = 1'
      ).get(account_id);
      if (!a) throw new NotFoundError('Account not found');
      if (a.kind === 'bank') throw new AppError('Account has no UPI', 400);
      upiId = a.upi_id;
      payeeName = a.upi_name || config.company.name;
    }
    if (!upiId) throw new AppError('upi or account_id required', 400);

    const amountPaise = amount ? Math.round(Number(amount) * 100) : null;
    const buffer = await upiQRBuffer(
      { upiId, payeeName, amountPaise, invoiceId: ref || undefined, note: ref },
      { width: Number(req.query.size) || 400 }
    );
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) { next(err); }
});

// ─── GET /qr/irn/invoice/:id ───
qrRouter.get('/irn/invoice/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const invoice = db.prepare(
      'SELECT signed_qr_payload, irn FROM invoices WHERE id = ?'
    ).get(req.params.id);
    if (!invoice) throw new NotFoundError('Invoice not found');
    if (!invoice.signed_qr_payload && !invoice.irn) {
      throw new AppError('No IRN / signed QR payload on this invoice', 404);
    }
    const payload = invoice.signed_qr_payload || invoice.irn;
    const dataUrl = await signedIRNQRDataURL(payload, { width: 300 });
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) { next(err); }
});

// ─── GET /qr/slab/:id (kept for backward compat; delegates to /qr/product/:id) ───
qrRouter.get('/slab/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const slab = db.prepare('SELECT id FROM products WHERE id = ? AND kind = \'slab\'').get(req.params.id);
    if (!slab) throw new NotFoundError('Slab not found');

    const baseUrl = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    const dataUrl = await slabQRDataURL(slab.id, baseUrl, { width: Number(req.query.size) || 300 });
    const base64 = dataUrl.split(',')[1];
    res.setHeader('Content-Type', 'image/png');
    res.send(Buffer.from(base64, 'base64'));
  } catch (err) { next(err); }
});

// ─── GET /qr/product/:id — any product kind ───
qrRouter.get('/product/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!p) throw new NotFoundError('Product not found');
    const baseUrl = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    // Deep-link to /products/<id> (same approach as slab QR)
    const dataUrl = await slabQRDataURL(p.id, baseUrl, { width: Number(req.query.size) || 300 });
    const base64 = dataUrl.split(',')[1];
    res.setHeader('Content-Type', 'image/png');
    res.send(Buffer.from(base64, 'base64'));
  } catch (err) { next(err); }
});

// ─── GET /qr/product-labels?ids=...&layout=auto|compact|large ───
// Prints a kind-appropriate label sheet for each product.
qrRouter.get('/product-labels', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) throw new AppError('ids query param required', 400);
    const db = getDb();

    // Bulk-load with dimensions
    const placeholders = ids.map(() => '?').join(',');
    const products = db.prepare(`
      SELECT p.*,
             ps.size_lw AS slab_size, ps.thickness_mm AS slab_tk, ps.sqft AS slab_sqft,
             pb.length_m, pb.width_m, pb.height_m, pb.cft, pb.source_quarry,
             pt.size_lw AS tile_size, pt.sqft_per_tile, pt.pieces_per_box,
             pc.customer_spec, pc.length_mm AS cts_l, pc.width_mm AS cts_w, pc.sqft AS cts_sqft,
             pch.mesh_size_mm,
             pk.profile AS kerb_profile, pk.length_mm AS kerb_l,
             pcb.cobble_type, pcb.length_mm AS cobble_l, pcb.width_mm AS cobble_w, pcb.height_mm AS cobble_h,
             pm.monument_type, pm.length_mm AS mon_l, pm.width_mm AS mon_w, pm.thickness_mm AS mon_t, pm.spec_notes
      FROM products p
      LEFT JOIN product_slabs ps ON ps.product_id = p.id
      LEFT JOIN product_blocks pb ON pb.product_id = p.id
      LEFT JOIN product_tiles pt ON pt.product_id = p.id
      LEFT JOIN product_cts pc ON pc.product_id = p.id
      LEFT JOIN product_chips pch ON pch.product_id = p.id
      LEFT JOIN product_kerbs pk ON pk.product_id = p.id
      LEFT JOIN product_cobbles pcb ON pcb.product_id = p.id
      LEFT JOIN product_monuments pm ON pm.product_id = p.id
      WHERE p.id IN (${placeholders})
    `).all(...ids);

    if (!products.length) throw new NotFoundError('No products matched');

    const baseUrl = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    const html = await generateProductLabelHTML(products, baseUrl);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

// ─── GET /qr/invoice/:id/link ───
qrRouter.get('/invoice/:id/link', async (req, res, next) => {
  try {
    const db = getDb();
    const invoice = db.prepare('SELECT id FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) throw new NotFoundError('Invoice not found');
    const baseUrl = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    const dataUrl = await invoiceQRDataURL(invoice.id, baseUrl);
    const base64 = dataUrl.split(',')[1];
    res.setHeader('Content-Type', 'image/png');
    res.send(Buffer.from(base64, 'base64'));
  } catch (err) { next(err); }
});

// ─── GET /qr/slab-labels?ids=S001,S002,S003 — legacy, delegates to product-labels ───
qrRouter.get('/slab-labels', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) throw new AppError('ids query param required', 400);
    const db = getDb();
    const slabs = ids.map(id =>
      db.prepare(`
        SELECT p.id, p.lot_id, p.variety, p.grade,
               ps.size_lw AS size, ps.thickness_mm, ps.sqft
        FROM products p
        LEFT JOIN product_slabs ps ON ps.product_id = p.id
        WHERE p.id = ? AND p.kind = 'slab'
      `).get(id)
    ).filter(Boolean);
    if (!slabs.length) throw new NotFoundError('No slabs matched');
    const baseUrl = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    const html = await generateSlabLabelHTML(slabs, baseUrl);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});
