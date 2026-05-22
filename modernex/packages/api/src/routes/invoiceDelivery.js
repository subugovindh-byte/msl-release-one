import { Router } from 'express';
import { PassThrough } from 'node:stream';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError, AppError } from '../middleware/error.js';
import { streamInvoicePDF } from '../services/pdfInvoice.js';
import { sendInvoiceEmail } from '../services/email.js';
import { sendInvoiceWhatsApp } from '../services/whatsapp.js';
import { audit } from '../services/audit.js';
import { logger } from '../utils/logger.js';

/**
 * Routes mounted at /api/invoices that deal with delivery.
 * Separated from invoices.js to keep the core CRUD focused.
 */
export const invoiceDeliveryRouter = Router();

invoiceDeliveryRouter.use(authenticate);

// Helper — fetch invoice with items + customer in one go
function loadInvoiceBundle(id) {
  const db = getDb();
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) throw new NotFoundError('Invoice not found');
  invoice.items = db.prepare(
    'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id'
  ).all(id);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id) || {};
  return { invoice, customer };
}

/**
 * Render a PDF to Buffer in memory (for emails and other attachments).
 */
function renderPdfToBuffer(invoice, customer) {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    try {
      streamInvoicePDF(invoice, customer, stream);
    } catch (err) { reject(err); }
  });
}

// ─── GET /invoices/:id/pdf — stream PDF to browser ───
invoiceDeliveryRouter.get('/:id/pdf', (req, res, next) => {
  try {
    const { invoice, customer } = loadInvoiceBundle(req.params.id);
    const filename = `${invoice.id.replace(/\//g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    streamInvoicePDF(invoice, customer, res);
    audit(req, 'INVOICE_PDF_DOWNLOAD', 'invoices', invoice.id, null, { user: req.user.username });
  } catch (err) { next(err); }
});

// ─── POST /invoices/:id/send-email ───
invoiceDeliveryRouter.post('/:id/send-email',
  requireRole('admin', 'accounts', 'sales'),
  async (req, res, next) => {
    try {
      const { invoice, customer } = loadInvoiceBundle(req.params.id);
      const to = req.body?.to || customer.email;
      if (!to) throw new AppError('No recipient email (customer.email is empty)', 400);

      const pdfBuffer = await renderPdfToBuffer(invoice, customer);
      const result = await sendInvoiceEmail(to, invoice, pdfBuffer);
      audit(req, 'INVOICE_EMAIL', 'invoices', invoice.id, null, { to, ...result });
      res.json(result);
    } catch (err) { next(err); }
  }
);

// ─── POST /invoices/:id/send-whatsapp ───
invoiceDeliveryRouter.post('/:id/send-whatsapp',
  requireRole('admin', 'accounts', 'sales'),
  async (req, res, next) => {
    try {
      const { invoice, customer } = loadInvoiceBundle(req.params.id);
      const phone = req.body?.phone || customer.contact;
      if (!phone) throw new AppError('No phone number (customer.contact is empty)', 400);

      // For WhatsApp we typically share a signed PDF URL. In production, generate a
      // SAS token for a Blob-hosted copy of the PDF. For now, use our own endpoint.
      const pdfUrl = `${req.protocol}://${req.get('host')}/api/invoices/${invoice.id}/pdf`;

      const result = await sendInvoiceWhatsApp(phone, invoice, pdfUrl);
      audit(req, 'INVOICE_WHATSAPP', 'invoices', invoice.id, null, { phone, ...result });
      res.json(result);
    } catch (err) {
      logger.error({ err: err.message, invoice: req.params.id }, 'WhatsApp send failed');
      next(err);
    }
  }
);
