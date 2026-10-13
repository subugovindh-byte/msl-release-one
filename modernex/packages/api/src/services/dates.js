// Business dates are Indian dates. `toISOString()` is always UTC, so between
// midnight and 05:30 IST it gives yesterday — wrong invoice dates, and on
// 1 April a document numbered in the new FY but dated in the old one.
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's date in India as YYYY-MM-DD; `plusDays` shifts it. */
export function today(plusDays = 0) {
  return fmt.format(new Date(Date.now() + plusDays * 86400000));
}
