/**
 * Format a number as Indian Rupees with en-IN digit grouping (₹1,50,000).
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0';
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

/**
 * Format a fraction (0–1) as a percentage string, e.g. 0.456 → "45.6%".
 * @param {number} value - fraction between 0 and 1 (may exceed)
 * @param {number} [digits=1]
 * @returns {string}
 */
export function formatPercent(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.0%';
  return `${(n * 100).toFixed(digits)}%`;
}

/**
 * Round and format a plain number for display.
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n));
}
