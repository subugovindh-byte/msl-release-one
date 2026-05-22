import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { formatINR, fromPaise } from '@modernex/shared';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!config.smtp.host) {
    logger.warn('SMTP not configured — emails will not be sent');
    return null;
  }
  _transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,  // TLS for 465, STARTTLS for 587
    auth: config.smtp.user ? {
      user: config.smtp.user,
      pass: config.smtp.pass,
    } : undefined,
  });
  return _transporter;
}

/**
 * Send an invoice email with an attached PDF.
 * @param {string} to           Recipient email
 * @param {object} invoice      Invoice row
 * @param {Buffer} pdfBuffer    Generated PDF
 */
export async function sendInvoiceEmail(to, invoice, pdfBuffer) {
  const transporter = getTransporter();
  if (!transporter) {
    logger.info({ to, invoice: invoice.id }, 'Invoice email skipped (SMTP disabled)');
    return { sent: false, reason: 'SMTP not configured' };
  }

  const amountStr = formatINR(invoice.total_paise);
  const dueDate = invoice.due_date || 'on receipt';

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#faf8f4">
      <h2 style="color:#d4522a;margin:0 0 4px;font-family:'Helvetica',sans-serif">${config.company.name}</h2>
      <p style="color:#666;font-size:11px;margin:0 0 20px;letter-spacing:1px;text-transform:uppercase">
        GSTIN ${config.company.gstin} · HSN ${config.company.hsn}
      </p>
      <h3 style="color:#1a1612;margin:0 0 16px">Tax Invoice ${invoice.id}</h3>
      <p style="color:#333;font-size:14px;line-height:1.6">
        Dear ${invoice.customer_name},<br><br>
        Please find attached tax invoice <strong>${invoice.id}</strong>
        dated <strong>${invoice.date}</strong> for
        <strong style="color:#d4522a">${amountStr}</strong>,
        payable by <strong>${dueDate}</strong>.
      </p>
      ${invoice.irn ? `
        <div style="background:#ece8e0;padding:12px 16px;border-radius:4px;margin:20px 0;font-size:12px">
          <div style="color:#9a7228;font-weight:700;letter-spacing:1px;margin-bottom:4px">e-INVOICE (IRN)</div>
          <div style="font-family:monospace;color:#333;word-break:break-all">${invoice.irn}</div>
          ${invoice.eway_bill ? `<div style="margin-top:6px;color:#666"><strong>e-Way Bill:</strong> ${invoice.eway_bill}</div>` : ''}
        </div>` : ''}
      <p style="color:#333;font-size:14px;line-height:1.6">
        Pay via UPI: <strong>${config.company.upi}</strong><br>
        Include reference: <strong>${invoice.id}</strong>
      </p>
      <p style="color:#666;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #ddd">
        Queries? Reply to this email.<br>
        ${config.company.address}
      </p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: config.smtp.from || `"${config.company.name}" <billing@example.in>`,
      to,
      subject: `Invoice ${invoice.id} · ${amountStr} · ${config.company.name}`,
      html,
      text: `${config.company.name}\n\nInvoice ${invoice.id} dated ${invoice.date}\nAmount: ${amountStr}\nDue: ${dueDate}\n\nPay via UPI: ${config.company.upi} (reference ${invoice.id})\n\nPDF attached.`,
      attachments: [{
        filename: `${invoice.id.replace(/\//g, '-')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });
    logger.info({ messageId: info.messageId, to, invoice: invoice.id }, 'Invoice email sent');
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error({ err, to, invoice: invoice.id }, 'Invoice email failed');
    throw err;
  }
}

/**
 * Send a payment reminder for an overdue invoice.
 */
export async function sendPaymentReminder(to, invoice, daysOverdue) {
  const transporter = getTransporter();
  if (!transporter) return { sent: false };

  const amountStr = formatINR(invoice.total_paise);
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#faf8f4">
      <h2 style="color:#d4522a;margin:0 0 4px">${config.company.name}</h2>
      <h3 style="color:#b83a18;margin:20px 0 12px">Payment Reminder: ${invoice.id}</h3>
      <p style="color:#333;font-size:14px;line-height:1.6">
        Dear ${invoice.customer_name},<br><br>
        This is a reminder that invoice <strong>${invoice.id}</strong> for
        <strong>${amountStr}</strong> is <strong style="color:#b83a18">${daysOverdue} days overdue</strong>
        (due ${invoice.due_date}).<br><br>
        Please arrange payment at your earliest convenience. Pay via UPI to
        <strong>${config.company.upi}</strong> with reference <strong>${invoice.id}</strong>,
        or reply to this email to arrange otherwise.
      </p>
      <p style="color:#666;font-size:12px;margin-top:24px">Thank you.</p>
    </div>`;

  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject: `Payment Reminder: ${invoice.id} · ${daysOverdue}d overdue`,
    html,
  });
  return { sent: true };
}

/**
 * Verify SMTP connection at startup (non-fatal).
 */
export async function verifySMTP() {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.verify();
    logger.info('SMTP connection verified');
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'SMTP verification failed');
    return false;
  }
}
