import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { formatINR } from '@modernex/shared';

/**
 * WhatsApp Business API client.
 *
 * Supports two provider backends (select via WHATSAPP_PROVIDER env var):
 *   - 'meta'   — Direct Meta WhatsApp Cloud API (requires verified business)
 *   - 'twilio' — Twilio WhatsApp (simpler onboarding, per-message pricing)
 *
 * Meta Cloud API docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 * Twilio WhatsApp:     https://www.twilio.com/docs/whatsapp
 *
 * Template messages must be pre-approved by Meta/Twilio for outside-24hr window.
 * Within the 24hr window after a customer messages you, free-form text is allowed.
 */

const PROVIDER = process.env.WHATSAPP_PROVIDER || 'meta';

// ─── META CLOUD API ───
async function sendViaMeta(toPhone, template, params) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error('Meta WhatsApp credentials missing');

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: normalizePhone(toPhone),
    type: 'template',
    template: {
      name: template,
      language: { code: 'en' },
      components: [
        { type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) },
      ],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Meta API ${res.status}: ${errText}`);
  }
  return await res.json();
}

// ─── TWILIO ───
async function sendViaTwilio(toPhone, bodyText) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;  // e.g. 'whatsapp:+14155238886'
  if (!sid || !token || !from) throw new Error('Twilio WhatsApp credentials missing');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const form = new URLSearchParams({
    From: from,
    To: `whatsapp:${normalizePhone(toPhone)}`,
    Body: bodyText,
  });

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twilio API ${res.status}: ${err}`);
  }
  return await res.json();
}

// ─── Helpers ───
function normalizePhone(phone) {
  // E.164 format — assume India if no country code
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  if (phone.startsWith('+')) return phone;
  return '+' + digits;
}

// ─── Public API ───

/**
 * Send an invoice notification via WhatsApp.
 * @param phone Customer mobile number
 * @param invoice Invoice row
 * @param pdfUrl  Public/signed URL to download the PDF (Blob SAS token recommended)
 */
export async function sendInvoiceWhatsApp(phone, invoice, pdfUrl) {
  if (!config.features.whatsapp) {
    logger.info({ phone, invoice: invoice.id }, 'WhatsApp disabled — skipping');
    return { sent: false, reason: 'disabled' };
  }
  if (!phone) return { sent: false, reason: 'no phone' };

  const amountStr = formatINR(invoice.total_paise);
  const dueStr = invoice.due_date || 'on receipt';

  try {
    if (PROVIDER === 'meta') {
      // Requires approved template "invoice_notification" with 4 body params
      // Template text example:
      //   "Hi {{1}}, invoice {{2}} for {{3}} is due on {{4}}. Download: <PDF_URL>"
      const result = await sendViaMeta(phone, 'invoice_notification', [
        invoice.customer_name || 'Customer',
        invoice.id,
        amountStr,
        dueStr,
      ]);
      logger.info({ phone, invoice: invoice.id, messages: result.messages }, 'WhatsApp sent (Meta)');
      return { sent: true, provider: 'meta', id: result.messages?.[0]?.id };
    }

    if (PROVIDER === 'twilio') {
      const text =
`Hi ${invoice.customer_name || 'there'},

Invoice ${invoice.id}
Amount: ${amountStr}
Due: ${dueStr}

Pay via UPI: ${config.company.upi}
Reference: ${invoice.id}
${pdfUrl ? `\nDownload PDF: ${pdfUrl}` : ''}

— ${config.company.name}`;
      const result = await sendViaTwilio(phone, text);
      logger.info({ phone, invoice: invoice.id, sid: result.sid }, 'WhatsApp sent (Twilio)');
      return { sent: true, provider: 'twilio', id: result.sid };
    }

    throw new Error(`Unknown WHATSAPP_PROVIDER: ${PROVIDER}`);
  } catch (err) {
    logger.error({ err: err.message, phone, invoice: invoice.id }, 'WhatsApp send failed');
    throw err;
  }
}

/**
 * Quick text message (e.g. payment confirmation, reminder).
 * Only works if within 24hr window of last customer message, OR as approved template.
 */
export async function sendTextWhatsApp(phone, text) {
  if (!config.features.whatsapp) return { sent: false, reason: 'disabled' };
  if (PROVIDER === 'twilio') {
    return await sendViaTwilio(phone, text);
  }
  throw new Error('Meta provider requires template for outside-24hr messages');
}
