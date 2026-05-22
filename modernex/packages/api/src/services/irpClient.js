import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { generateIRN, generateEWayBill, requiresEWayBill } from '@modernex/shared';

/**
 * Register an invoice with the IRP (Invoice Registration Portal).
 * In production, this hits https://einvoice1.gst.gov.in/eivital/dashboard.
 * For now, generates a deterministic stub IRN that looks like the real thing.
 *
 * Real API flow:
 *   1. POST /eivital/v1.04/auth  → get access token (1-hour TTL)
 *   2. POST /eicore/v1.03/Invoice → submit invoice JSON, get IRN + signed QR
 *   3. POST /ewaybillapi/v1.03/ewayapi → if total > ₹50K, generate e-Way Bill
 */
export async function registerWithIRP(invoice) {
  if (!config.features.irp) {
    // Stub mode — generate a deterministic-but-realistic signed payload
    const irn = generateIRN();
    const stubSignedQR = Buffer.from(JSON.stringify({
      // Mimics the structure of a real IRP-signed JWT payload
      SellerGstin: config.company.gstin,
      BuyerGstin: invoice.customer_gstin || 'URP',
      DocNo: invoice.id,
      DocTyp: 'INV',
      DocDt: new Date().toISOString().slice(0, 10).split('-').reverse().join('/'),
      TotInvVal: (invoice.total_paise / 100).toFixed(2),
      Irn: irn,
      IrnDt: new Date().toISOString(),
      _note: 'STUB — not a real IRP signature',
    })).toString('base64');

    return {
      irn,
      eway_bill: requiresEWayBill(invoice.total_paise) ? generateEWayBill() : null,
      signed_qr_payload: stubSignedQR,
      qr_code: null,
      stub: true,
    };
  }

  // Real implementation would go here
  try {
    logger.info({ invoice: invoice.id }, 'Calling IRP API');

    // TODO: auth with client_id/secret → get access token
    // TODO: POST invoice JSON to /eicore/v1.03/Invoice
    // TODO: Parse IRN + signed QR from response
    // TODO: If total > ₹50K, call e-Way Bill API

    throw new Error('Real IRP integration not implemented — set ENABLE_IRP=false');
  } catch (err) {
    logger.error({ err, invoice: invoice.id }, 'IRP registration failed');
    throw err;
  }
}

/**
 * Cancel an IRN within 24 hours of generation (GST rule).
 */
export async function cancelIRN(irn, reason) {
  if (!config.features.irp) {
    logger.info({ irn, reason }, 'IRN cancel (stub)');
    return { cancelled: true, stub: true };
  }
  // TODO: POST to /eicore/v1.03/Invoice/Cancel
  throw new Error('Real IRP cancel not implemented');
}
