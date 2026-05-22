import { getDb } from '../db/connection.js';
import { logger } from '../utils/logger.js';

/**
 * Multi-currency support.
 *
 * Modernex's books are kept in INR (base currency) — per Indian accounting rules,
 * all GSTR filings and P&L statements must be in INR.
 *
 * Foreign-currency invoices (e.g. export to UAE, Sri Lanka, USA) are stored in two ways:
 *   1. Original foreign amount (currency + amount_cents)  — shown on the invoice
 *   2. INR equivalent (converted at invoice date FX rate)  — used for GST + reporting
 *
 * GST on exports:
 *   - Physical exports with LUT (no GST) → export_type='WITHOUT_TAX'
 *   - Physical exports with IGST paid & refunded → export_type='WITH_TAX'
 *   - Deemed exports (SEZ etc.) → export_type='DEEMED'
 *
 * Rates are cached daily; admin can override for historical or locked rates.
 */

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'LKR'];

export const CURRENCY_META = {
  INR: { symbol: '₹', code: 'INR', name: 'Indian Rupee',       locale: 'en-IN', fractionDigits: 2 },
  USD: { symbol: '$', code: 'USD', name: 'US Dollar',          locale: 'en-US', fractionDigits: 2 },
  EUR: { symbol: '€', code: 'EUR', name: 'Euro',               locale: 'en-IE', fractionDigits: 2 },
  GBP: { symbol: '£', code: 'GBP', name: 'Pound Sterling',     locale: 'en-GB', fractionDigits: 2 },
  AED: { symbol: 'د.إ', code: 'AED', name: 'UAE Dirham',       locale: 'en-AE', fractionDigits: 2 },
  SGD: { symbol: 'S$', code: 'SGD', name: 'Singapore Dollar',  locale: 'en-SG', fractionDigits: 2 },
  LKR: { symbol: 'Rs', code: 'LKR', name: 'Sri Lankan Rupee',  locale: 'en-LK', fractionDigits: 2 },
};

/**
 * Format an amount in the given currency.
 */
export function formatCurrency(amountInMinorUnits, currency = 'INR') {
  const meta = CURRENCY_META[currency] || CURRENCY_META.INR;
  const major = (amountInMinorUnits || 0) / Math.pow(10, meta.fractionDigits);
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: meta.code,
    minimumFractionDigits: meta.fractionDigits,
  }).format(major);
}

/**
 * Convert a minor-unit amount to INR paise using a stored rate.
 */
export function convertToINRPaise(amountMinor, fromCurrency, rateInrPer1) {
  if (fromCurrency === 'INR') return amountMinor;  // already paise
  const meta = CURRENCY_META[fromCurrency];
  if (!meta) throw new Error(`Unknown currency: ${fromCurrency}`);
  const amountMajor = amountMinor / Math.pow(10, meta.fractionDigits);
  const inrMajor = amountMajor * rateInrPer1;
  return Math.round(inrMajor * 100);  // → paise
}

// ─── FX RATE STORAGE ───
// Table schema (add in migrations/002_multicurrency.sql):
//   CREATE TABLE fx_rates (
//     currency    TEXT NOT NULL,
//     rate_date   TEXT NOT NULL,
//     inr_per_1   REAL NOT NULL,
//     source      TEXT,   -- 'rbi' | 'manual' | 'cached'
//     PRIMARY KEY (currency, rate_date)
//   )

export function saveFxRate(currency, date, inrPer1, source = 'manual') {
  const db = getDb();
  db.prepare(`
    INSERT INTO fx_rates (currency, rate_date, inr_per_1, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(currency, rate_date) DO UPDATE SET
      inr_per_1 = excluded.inr_per_1,
      source = excluded.source
  `).run(currency, date, inrPer1, source);
  logger.info({ currency, date, inrPer1 }, 'FX rate saved');
}

export function getFxRate(currency, date) {
  if (currency === 'INR') return 1;
  const db = getDb();
  // Exact date match, else most recent before the date
  const exact = db.prepare(
    'SELECT inr_per_1 FROM fx_rates WHERE currency = ? AND rate_date = ?'
  ).get(currency, date);
  if (exact) return exact.inr_per_1;

  const before = db.prepare(
    `SELECT inr_per_1 FROM fx_rates WHERE currency = ? AND rate_date <= ? 
     ORDER BY rate_date DESC LIMIT 1`
  ).get(currency, date);
  if (before) return before.inr_per_1;

  throw new Error(`No FX rate available for ${currency} on or before ${date}`);
}

/**
 * Fetch RBI reference rates (daily, free, authoritative for India).
 * In production, run this from scheduler.js every morning at 09:00 IST.
 *
 * RBI reference rates JSON (via exchangerate-api.com or similar free source):
 *   https://api.exchangerate-api.com/v4/latest/INR
 */
export async function fetchAndStoreTodayRates() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Using a free public source. For production, consider the RBI's direct feed
    // or a commercial provider with 5-decimal precision.
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/INR');
    if (!res.ok) throw new Error(`FX API returned ${res.status}`);
    const data = await res.json();

    // API returns rates as "1 INR = X foreign". We need "1 foreign = Y INR".
    for (const cur of SUPPORTED_CURRENCIES) {
      if (cur === 'INR') continue;
      const inrPerForeign = 1 / data.rates[cur];
      if (!isFinite(inrPerForeign)) continue;
      saveFxRate(cur, today, +inrPerForeign.toFixed(6), 'api');
    }
    logger.info({ date: today }, 'FX rates updated');
    return { updated: SUPPORTED_CURRENCIES.length - 1, date: today };
  } catch (err) {
    logger.error({ err: err.message }, 'FX rate fetch failed');
    throw err;
  }
}

// ─── EXPORT INVOICE TYPES ───
export const EXPORT_TYPES = {
  NONE: 'NONE',                    // Domestic sale
  WITHOUT_TAX: 'WITHOUT_TAX',      // Export under LUT — 0% IGST
  WITH_TAX: 'WITH_TAX',            // Export with IGST paid, refundable
  DEEMED: 'DEEMED',                // SEZ / EPCG supplies
};
