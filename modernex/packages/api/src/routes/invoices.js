import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { invoiceCreateSchema, calculateInvoice } from '@modernex/shared';
import { AppError, NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { nextInvoiceId, nextPaymentId } from '../services/idGenerator.js';
import { registerWithIRP } from '../services/irpClient.js';
import { backup } from '../services/backup.js';
import { uomForProduct, hsnForProduct, loadProduct } from '../services/products.js';

export const invoicesRouter = Router();
invoicesRouter.use(authenticate);

// ─── GET /invoices ───
invoicesRouter.get('/', (req, res) => {
  const { customer_id, from, to, paid, limit = 200 } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM invoices WHERE 1=1';
  const params = [];
  if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  if (paid !== undefined) { sql += ' AND paid = ?'; params.push(paid === 'true' ? 1 : 0); }
  sql += ' ORDER BY date DESC, id DESC LIMIT ?';
  params.push(Number(limit));
  res.json({ invoices: db.prepare(sql).all(...params) });
});

// ─── GET /invoices/:id ───
invoicesRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) throw new NotFoundError('Invoice not found');
    const items = db.prepare(
      'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY line_no'
    ).all(req.params.id);
    for (const it of items) {
      if (it.dimension_snapshot) {
        try { it.dimensions = JSON.parse(it.dimension_snapshot); } catch {}
      }
    }
    res.json({ invoice: { ...invoice, items } });
  } catch (err) { next(err); }
});

// ─── POST /invoices ───
invoicesRouter.post('/',
  requireRole('admin', 'sales', 'accounts'),
  validate(invoiceCreateSchema),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { customer_id, items, discount_pct = 0, notes } = req.body;

      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
      if (!customer) throw new NotFoundError('Customer not found');

      const enriched = items.map(it => {
        const productId = it.product_id || it.slab_id;  // legacy
        const product = productId ? loadProduct(db, productId) : null;
        if (!product) throw new AppError(`Product ${productId || '(unknown)'} not found`, 400);

        const uomQty = it.uom_qty != null ? Number(it.uom_qty)
                     : it.sqft != null   ? Number(it.sqft)
                     : (product.dimensions?.sqft || product.dimensions?.cft || 1);
        const qty = Number(it.qty);
        if (product.stock < qty) {
          throw new AppError(
            `Insufficient stock for ${product.variety} (${product.id}): have ${product.stock}, need ${qty}`,
            400
          );
        }

        return {
          product_id: product.id,
          product_kind: product.kind,
          variety: it.variety || product.variety,
          hsn: it.hsn || hsnForProduct(product),
          uom: it.uom || uomForProduct(product),
          uom_qty: uomQty,
          qty,
          rate_paise: it.rate_paise ?? product.rate_paise,   // allow override
          grade: it.grade || product.grade,
          dimension_snapshot: JSON.stringify(it.dimension_snapshot || product.dimensions || {}),
        };
      });

      const calc = calculateInvoice(enriched, customer.state, discount_pct);

      let collectionAccountId = req.body.collection_account_id || null;
      if (!collectionAccountId) {
        const def = db.prepare(
          'SELECT id FROM collection_accounts WHERE is_default = 1 AND active = 1'
        ).get();
        if (def) collectionAccountId = def.id;
      }

      const id = nextInvoiceId();
      const date = new Date().toISOString().slice(0, 10);
      const dueDate = new Date(Date.now() + (customer.credit_days || 0) * 86400000)
        .toISOString().slice(0, 10);

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO invoices (
            id, date, customer_id, customer_name, customer_state, customer_gstin,
            discount_pct, gross_paise, discount_paise, taxable_paise,
            cgst_paise, sgst_paise, igst_paise, total_paise,
            due_date, notes, created_by, collection_account_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, date, customer_id, customer.name, customer.state, customer.gstin,
          discount_pct, calc.grossPaise, calc.discountPaise, calc.taxable,
          calc.cgst, calc.sgst, calc.igst, calc.grandTotal,
          dueDate, notes || null, req.user.username, collectionAccountId
        );

        const insertItem = db.prepare(`
          INSERT INTO invoice_items (
            invoice_id, line_no, product_id, product_kind,
            variety, hsn, uom, uom_qty, qty, rate_paise, line_total_paise,
            dimension_snapshot, grade
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        enriched.forEach((it, idx) => {
          const lineTotal = Math.round(it.rate_paise * it.uom_qty * it.qty);
          insertItem.run(
            id, idx + 1, it.product_id, it.product_kind,
            it.variety, it.hsn, it.uom, it.uom_qty, it.qty,
            it.rate_paise, lineTotal, it.dimension_snapshot, it.grade || null
          );
        });

        const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
        for (const it of enriched) decStock.run(it.qty, it.product_id);

        db.prepare(
          'UPDATE customers SET outstanding_paise = outstanding_paise + ? WHERE id = ?'
        ).run(calc.grandTotal, customer_id);
      });
      tx();

      try {
        const irpResult = await registerWithIRP({
          id, total_paise: calc.grandTotal, customer_gstin: customer.gstin,
        });
        db.prepare(
          'UPDATE invoices SET irn = ?, eway_bill = ?, signed_qr_payload = ? WHERE id = ?'
        ).run(irpResult.irn, irpResult.eway_bill,
              irpResult.signed_qr_payload || irpResult.irn, id);
      } catch (err) {
        req.log?.warn({ err, invoice: id }, 'IRN registration failed');
      }

      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      const itemRows = db.prepare(
        'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY line_no'
      ).all(id);

      audit(req, 'INVOICE_CREATE', 'invoices', id, null, invoice);
      backup('event').catch(() => {});

      res.status(201).json({ invoice: { ...invoice, items: itemRows } });
    } catch (err) { next(err); }
  }
);

// ─── POST /invoices/:id/pay ───
invoicesRouter.post('/:id/pay',
  requireRole('admin', 'accounts'),
  (req, res, next) => {
    try {
      const db = getDb();
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (invoice.paid) throw new AppError('Invoice already paid', 400);

      const { mode = 'Manual', utr = null, amount_paise } = req.body;
      const amount = amount_paise || invoice.total_paise;

      const tx = db.transaction(() => {
        db.prepare(
          'UPDATE invoices SET paid = 1, paid_date = date(\'now\') WHERE id = ?'
        ).run(req.params.id);

        const paymentId = nextPaymentId('receipt');
        db.prepare(`
          INSERT INTO payments (id, type, invoice_id, party, amount_paise, mode, utr, created_by)
          VALUES (?, 'receipt', ?, ?, ?, ?, ?, ?)
        `).run(paymentId, req.params.id, invoice.customer_name, amount, mode, utr, req.user.username);

        db.prepare(
          'UPDATE customers SET outstanding_paise = outstanding_paise - ? WHERE id = ?'
        ).run(amount, invoice.customer_id);
      });
      tx();

      audit(req, 'INVOICE_PAY', 'invoices', req.params.id,
            { paid: 0 }, { paid: 1, mode, utr });
      backup('event').catch(() => {});

      const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
      res.json({ invoice: updated });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /invoices/:id/items/:lineNo — edit unpaid invoice line ───
const lineEditSchema = z.object({
  rate_paise: z.number().int().nonnegative().optional(),
  uom_qty: z.number().positive().optional(),
  qty: z.number().positive().optional(),
  reason: z.string().min(5).max(500),
});

invoicesRouter.patch('/:id/items/:lineNo',
  requireRole('admin', 'accounts'),
  validate(lineEditSchema),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id, lineNo } = req.params;
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (invoice.paid) throw new AppError('Cannot edit a paid invoice', 400);

      const line = db.prepare(
        'SELECT * FROM invoice_items WHERE invoice_id = ? AND line_no = ?'
      ).get(id, Number(lineNo));
      if (!line) throw new NotFoundError('Line not found');

      const newRate   = req.body.rate_paise ?? line.rate_paise;
      const newUomQty = req.body.uom_qty ?? line.uom_qty;
      const newQty    = req.body.qty ?? line.qty;
      const newLineTotal = Math.round(newRate * newUomQty * newQty);

      const allLines = db.prepare(
        'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY line_no'
      ).all(id);
      const updatedLines = allLines.map(l =>
        l.line_no === Number(lineNo)
          ? { ...l, rate_paise: newRate, uom_qty: newUomQty, qty: newQty }
          : l
      );
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id);
      const calc = calculateInvoice(updatedLines.map(l => ({
        rate_paise: l.rate_paise, uom_qty: l.uom_qty, qty: l.qty, hsn: l.hsn,
      })), customer.state, invoice.discount_pct);

      const oldTotal = invoice.total_paise;
      const totalShiftPct = Math.abs(calc.grandTotal - oldTotal) / Math.max(oldTotal, 1) * 100;

      const tx = db.transaction(() => {
        db.prepare(`
          UPDATE invoice_items
          SET rate_paise = ?, uom_qty = ?, qty = ?, line_total_paise = ?
          WHERE invoice_id = ? AND line_no = ?
        `).run(newRate, newUomQty, newQty, newLineTotal, id, Number(lineNo));

        db.prepare(`
          UPDATE invoices SET
            gross_paise = ?, discount_paise = ?, taxable_paise = ?,
            cgst_paise = ?, sgst_paise = ?, igst_paise = ?, total_paise = ?
          WHERE id = ?
        `).run(
          calc.grossPaise, calc.discountPaise, calc.taxable,
          calc.cgst, calc.sgst, calc.igst, calc.grandTotal, id
        );

        const delta = calc.grandTotal - oldTotal;
        if (delta !== 0) {
          db.prepare(
            'UPDATE customers SET outstanding_paise = outstanding_paise + ? WHERE id = ?'
          ).run(delta, invoice.customer_id);
        }
      });
      tx();

      // If total shifted by >1%, old IRN is no longer valid — regenerate
      if (totalShiftPct > 1 && invoice.irn) {
        try {
          const irpResult = await registerWithIRP({
            id, total_paise: calc.grandTotal, customer_gstin: invoice.customer_gstin,
          });
          db.prepare(
            'UPDATE invoices SET irn = ?, eway_bill = ?, signed_qr_payload = ? WHERE id = ?'
          ).run(irpResult.irn, irpResult.eway_bill,
                irpResult.signed_qr_payload || irpResult.irn, id);
        } catch (err) {
          req.log?.warn({ err, invoice: id }, 'IRN re-registration failed');
        }
      }

      audit(req, 'INVOICE_LINE_EDIT', 'invoices', id,
            { line_no: lineNo, old: line, old_total: oldTotal },
            { new_rate: newRate, new_total: calc.grandTotal, total_shift_pct: totalShiftPct, reason: req.body.reason });

      const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      const items = db.prepare(
        'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY line_no'
      ).all(id);
      res.json({ invoice: { ...updated, items }, total_shift_pct: totalShiftPct });
    } catch (err) { next(err); }
  }
);
