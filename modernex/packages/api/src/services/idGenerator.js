import { getDb } from '../db/connection.js';

/**
 * Generate next invoice number: SI/25-26/0001
 * Fiscal year April-March, zero-padded 4-digit sequence
 */
export function nextInvoiceId() {
  const db = getDb();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // Indian FY: Apr-Mar. If before April, we're still in prev FY.
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  const prefix = `SI/${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}/`;

  const row = db.prepare(
    `SELECT id FROM invoices WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(prefix + '%');

  let seq = 1;
  if (row) {
    const lastSeq = parseInt(row.id.slice(prefix.length), 10);
    seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(4, '0');
}

export function nextPOId() {
  const db = getDb();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  const prefix = `PO/${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}/`;

  const row = db.prepare(
    `SELECT id FROM purchase_orders WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(prefix + '%');

  let seq = 1;
  if (row) {
    const lastSeq = parseInt(row.id.slice(prefix.length), 10);
    seq = lastSeq + 1;
  }
  return prefix + String(seq);
}

export function nextJobId() {
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM production_jobs WHERE id LIKE 'JOB-%' ORDER BY id DESC LIMIT 1`
  ).get();

  let seq = 1;
  if (row) {
    const lastSeq = parseInt(row.id.slice(4), 10);
    seq = lastSeq + 1;
  }
  return `JOB-${seq}`;
}

export function nextPaymentId(type = 'receipt') {
  const db = getDb();
  const prefix = type === 'receipt' ? 'RCT' : 'PMT';
  const year = new Date().getFullYear();
  const pattern = `${prefix}/${year}/%`;

  const row = db.prepare(
    `SELECT id FROM payments WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(pattern);

  let seq = 1;
  if (row) {
    const lastSeq = parseInt(row.id.split('/').pop(), 10);
    seq = lastSeq + 1;
  }
  return `${prefix}/${year}/${String(seq).padStart(3, '0')}`;
}

export function nextCustomerId() {
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM customers WHERE id LIKE 'C%' ORDER BY id DESC LIMIT 1`
  ).get();
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(1), 10) + 1;
  return 'C' + String(seq).padStart(3, '0');
}

export function nextVendorId() {
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM vendors WHERE id LIKE 'V%' ORDER BY id DESC LIMIT 1`
  ).get();
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(1), 10) + 1;
  return 'V' + String(seq).padStart(3, '0');
}

function fyPrefix() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
}

export function nextDCNId(type = 'credit') {
  const db = getDb();
  const prefix = type === 'credit' ? `CN/${fyPrefix()}/` : `DN/${fyPrefix()}/`;
  const row = db.prepare(
    `SELECT id FROM debit_credit_notes WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(prefix + '%');
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(prefix.length), 10) + 1;
  return prefix + String(seq).padStart(4, '0');
}

export function nextGRNId() {
  const db = getDb();
  const prefix = `GRN/${fyPrefix()}/`;
  const row = db.prepare(
    `SELECT id FROM purchase_order_receipts WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(prefix + '%');
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(prefix.length), 10) + 1;
  return prefix + String(seq).padStart(4, '0');
}

export function nextChallanId() {
  const db = getDb();
  const prefix = `DC/${fyPrefix()}/`;
  const row = db.prepare(
    `SELECT id FROM delivery_challans WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(prefix + '%');
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(prefix.length), 10) + 1;
  return prefix + String(seq).padStart(4, '0');
}

// ── New entity IDs ────────────────────────────────────────────────────────

export function nextTdsId() {
  const db = getDb();
  const prefix = `TDS/${fyPrefix()}/`;
  const row = db.prepare(
    `SELECT id FROM tds_transactions WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(prefix + '%');
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(prefix.length), 10) + 1;
  return prefix + String(seq).padStart(4, '0');
}

export function nextTdsChallanId() {
  const db = getDb();
  const prefix = `TDSC/${fyPrefix()}/`;
  const row = db.prepare(
    `SELECT id FROM tds_challans WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(prefix + '%');
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(prefix.length), 10) + 1;
  return prefix + String(seq).padStart(4, '0');
}

export function nextJournalId() {
  const db = getDb();
  const prefix = `JV/${fyPrefix()}/`;
  const row = db.prepare(
    `SELECT id FROM journal_vouchers WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(prefix + '%');
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(prefix.length), 10) + 1;
  return prefix + String(seq).padStart(4, '0');
}

export function nextAssetId() {
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM fixed_assets WHERE id LIKE 'FA-%' ORDER BY id DESC LIMIT 1`
  ).get();
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(3), 10) + 1;
  return `FA-${String(seq).padStart(3, '0')}`;
}

export function nextBankAccId() {
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM bank_accounts_reg WHERE id LIKE 'BANK-%' ORDER BY id DESC LIMIT 1`
  ).get();
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(5), 10) + 1;
  return `BANK-${String(seq).padStart(3, '0')}`;
}

export function nextPdcId() {
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM post_dated_cheques WHERE id LIKE 'PDC-%' ORDER BY id DESC LIMIT 1`
  ).get();
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(4), 10) + 1;
  return `PDC-${String(seq).padStart(4, '0')}`;
}

export function nextEmployeeId() {
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM employees WHERE id LIKE 'EMP-%' ORDER BY id DESC LIMIT 1`
  ).get();
  let seq = 1;
  if (row) seq = parseInt(row.id.slice(4), 10) + 1;
  return `EMP-${String(seq).padStart(3, '0')}`;
}

export function nextPayrollRunId(month) {
  return `PR/${month}`;
}
