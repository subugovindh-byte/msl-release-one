import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { getDb } from '../db/connection.js';

/**
 * WhatsApp webhook receiver.
 *
 * Handles two provider shapes:
 *   - Meta Cloud API — https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 *   - Twilio — https://www.twilio.com/docs/whatsapp/api/webhook
 *
 * Events we care about:
 *   1. Delivery receipts — mark invoice as "delivered via WhatsApp"
 *   2. Inbound messages — e.g. customer replies "PAID" → attach as note
 */
export const whatsappWebhookRouter = Router();

// ─── GET /webhooks/whatsapp — Meta verification handshake ───
whatsappWebhookRouter.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === expected) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn({ mode, token }, 'WhatsApp webhook verification failed');
    res.sendStatus(403);
  }
});

// ─── POST /webhooks/whatsapp — event delivery ───
whatsappWebhookRouter.post('/whatsapp', (req, res) => {
  // Respond 200 FAST — Meta retries if we don't ack within 20s
  res.sendStatus(200);

  try {
    const body = req.body;
    const db = getDb();

    // Meta shape
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;

          // Status updates (sent/delivered/read/failed)
          for (const status of value.statuses || []) {
            logger.info({
              messageId: status.id,
              status: status.status,
              recipient: status.recipient_id,
            }, 'WhatsApp status');

            if (status.status === 'delivered' || status.status === 'read') {
              // Could update an invoice_deliveries table here
            }
            if (status.status === 'failed') {
              logger.error({ status }, 'WhatsApp delivery failed');
            }
          }

          // Inbound messages
          for (const message of value.messages || []) {
            const from = message.from;
            const text = message.text?.body || '';
            logger.info({ from, text, type: message.type }, 'Inbound WhatsApp');

            // If customer types "PAID <invoice>" we could auto-flag the invoice
            const paidMatch = text.match(/paid\s+(\S+)/i);
            if (paidMatch) {
              const invoiceId = paidMatch[1];
              const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
              if (inv) {
                db.prepare(`
                  INSERT INTO audit_log (ts, action, table_name, record_id, after_json)
                  VALUES (datetime('now'), 'WHATSAPP_PAYMENT_CLAIM', 'invoices', ?, ?)
                `).run(inv.id, JSON.stringify({ from, text }));
                logger.info({ invoice: inv.id, from }, 'Payment claim received via WhatsApp');
              }
            }
          }
        }
      }
      return;
    }

    // Twilio shape (form-encoded, different schema)
    if (body.MessageSid) {
      const { MessageSid, MessageStatus, From, Body } = body;
      logger.info({ MessageSid, MessageStatus, From, Body }, 'Twilio webhook');

      if (Body && From) {
        const paidMatch = Body.match(/paid\s+(\S+)/i);
        if (paidMatch) {
          const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(paidMatch[1]);
          if (inv) {
            db.prepare(`
              INSERT INTO audit_log (ts, action, table_name, record_id, after_json)
              VALUES (datetime('now'), 'WHATSAPP_PAYMENT_CLAIM', 'invoices', ?, ?)
            `).run(inv.id, JSON.stringify({ from: From, text: Body, twilio_sid: MessageSid }));
          }
        }
      }
      return;
    }
  } catch (err) {
    logger.error({ err: err.message }, 'WhatsApp webhook processing error');
  }
});
