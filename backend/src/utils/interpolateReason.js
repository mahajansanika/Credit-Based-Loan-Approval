import { formatCurrency, formatPercent } from './formatCurrency.js';

/** Fields rendered as INR currency inside reason strings. */
const CURRENCY_FIELDS = ['monthly_income', 'monthly_expense'];
/** Fields rendered as percentages inside reason strings. */
const PERCENT_FIELDS = ['dti', 'affordability_buffer'];

/**
 * Format a raw field value for display based on the field's semantic type.
 * Currency fields → ₹X,XX,XXX; ratio fields → X.X%; counts → integers.
 * @param {string} field
 * @param {number} value
 * @returns {string}
 */
export function formatFieldValue(field, value) {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return '—';
  if (CURRENCY_FIELDS.includes(field)) return formatCurrency(n);
  if (PERCENT_FIELDS.includes(field)) return formatPercent(n);
  return String(Math.round(n * 100) / 100);
}

/**
 * Interpolate a reason template.
 * - "{field:fieldName}" tokens are replaced with the formatted actual value
 *   taken from `values` (inputs + derived fields merged).
 * - "{key}" tokens (threshold, value, shortfall, magnitude, ...) are replaced
 *   from `extras`, which must contain pre-formatted strings/numbers.
 * Unknown tokens are left untouched so config mistakes stay visible.
 * @param {string} template
 * @param {Object} values
 * @param {Object} [extras]
 * @returns {string}
 */
export function interpolateReason(template, values, extras = {}) {
  if (!template) return '';
  let out = String(template).replace(/\{field:([a-zA-Z_]+)\}/g, (_m, f) =>
    formatFieldValue(f, values?.[f])
  );
  out = out.replace(/\{([a-zA-Z_]+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(extras, key) ? String(extras[key]) : m
  );
  return out;
}
