/**
 * Shared field-name matching for all file parsers. Maps flexible header /
 * label text ("Gross Income", "loan count", "missed payments"...) onto the
 * five canonical engine fields.
 */

/** Synonym fragments per canonical field (matched against normalised text). */
export const FIELD_SYNONYMS = {
  monthly_income: ['monthlyincome', 'grossincome', 'income', 'salary'],
  monthly_expense: ['monthlyexpense', 'expenditure', 'expense', 'spending'],
  existing_loans: ['existingloans', 'activeloans', 'loancount', 'loans'],
  credit_history_months: ['credithistorymonths', 'credithistory', 'monthsofcredit', 'history'],
  defaults: ['defaultcount', 'defaults', 'default', 'missedpayments'],
};

export const CANONICAL_FIELDS = Object.keys(FIELD_SYNONYMS);

/**
 * Normalise a header/label for matching: lowercase, strip non-letters.
 * @param {string} text
 * @returns {string}
 */
export function normaliseLabel(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Match a header/label to a canonical field, or null.
 * Longest synonyms are checked first so "monthly income" beats "income".
 * @param {string} label
 * @returns {string|null}
 */
export function matchField(label) {
  const norm = normaliseLabel(label);
  if (!norm) return null;
  const pairs = [];
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    for (const syn of synonyms) pairs.push([field, syn]);
  }
  pairs.sort((a, b) => b[1].length - a[1].length);
  for (const [field, syn] of pairs) {
    if (norm.includes(syn)) return field;
  }
  return null;
}

/**
 * Parse a numeric cell/string: strips ₹, commas, spaces. Returns null when
 * not parseable.
 * @param {*} value
 * @returns {number|null}
 */
export function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).match(/-?[\d,]+\.?\d*/);
  if (!match) return null;
  const n = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute which canonical fields are absent from a parsed applicant object.
 * @param {Object} fields
 * @returns {string[]}
 */
export function missingFields(fields) {
  return CANONICAL_FIELDS.filter((f) => fields[f] === null || fields[f] === undefined);
}
