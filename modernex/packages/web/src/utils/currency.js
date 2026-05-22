// ═══════════════════════════════════════
// Currency helpers (frontend)
// ═══════════════════════════════════════

export const CURRENCY_META = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'en-IE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  AED: { symbol: 'د.إ', locale: 'en-AE' },
  SGD: { symbol: 'S$', locale: 'en-SG' },
  LKR: { symbol: 'Rs', locale: 'en-LK' },
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_META);

/**
 * Format any currency amount given as minor units (paise/cents).
 */
export function formatCurrency(amountMinor, currency = 'INR') {
  const meta = CURRENCY_META[currency] || CURRENCY_META.INR;
  const major = (amountMinor || 0) / 100;
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(major);
}
