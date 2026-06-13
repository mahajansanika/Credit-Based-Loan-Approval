/**
 * Layer 1 — Input validation. Pure, config-independent.
 * Runs before anything else; returns field-level errors that block
 * submission and overridable warnings (income sanity cap).
 */
import { formatCurrency } from '../utils/formatCurrency.js';

/** Sanity ceiling for monthly income — above this we warn but allow override. */
export const INCOME_SANITY_CAP = 500000;

/** The five raw applicant input fields, in canonical order. */
export const INPUT_FIELDS = [
  'monthly_income',
  'monthly_expense',
  'existing_loans',
  'credit_history_months',
  'defaults',
];

/** Human-readable labels for every engine field (raw + derived). */
export const FIELD_LABELS = {
  monthly_income: 'Monthly income',
  monthly_expense: 'Monthly expense',
  existing_loans: 'Existing loans',
  credit_history_months: 'Credit history (months)',
  defaults: 'Defaults',
  dti: 'Debt-to-income ratio',
  affordability_buffer: 'Affordability buffer',
};

/**
 * Convert a raw form value to a number. Empty/null/undefined → NaN.
 * Strings may contain ₹, commas and whitespace.
 * @param {*} value
 * @returns {number}
 */
function toNumber(value) {
  if (value === '' || value === null || value === undefined) return NaN;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[₹,\s]/g, '');
    if (cleaned === '') return NaN;
    return Number(cleaned);
  }
  return Number(value);
}

/**
 * Coerce raw inputs into a numeric object (NaN where invalid).
 * @param {Object} raw
 * @returns {{monthly_income:number, monthly_expense:number, existing_loans:number, credit_history_months:number, defaults:number}}
 */
export function coerceInputs(raw) {
  const out = {};
  for (const f of INPUT_FIELDS) out[f] = toNumber(raw?.[f]);
  return out;
}

/**
 * Layer 1 validation — all 9 specified cases.
 * @param {Object} raw - raw inputs (strings or numbers)
 * @returns {{valid: boolean, errors: Object<string,string>, warnings: Object<string,string>}}
 */
export function runValidation(raw) {
  const errors = {};
  const warnings = {};
  const v = coerceInputs(raw);

  for (const f of INPUT_FIELDS) {
    if (Number.isNaN(v[f])) {
      errors[f] = `${FIELD_LABELS[f]} is required and must be a number.`;
    }
  }
  if (!errors.monthly_income && v.monthly_income <= 0) {
    errors.monthly_income = 'Income must be greater than ₹0.';
  }
  if (!errors.monthly_expense && v.monthly_expense < 0) {
    errors.monthly_expense = 'Monthly expense cannot be negative.';
  }
  if (!errors.defaults && v.defaults < 0) {
    errors.defaults = 'Defaults cannot be negative. Enter 0 or more.';
  }
  if (!errors.existing_loans && v.existing_loans < 0) {
    errors.existing_loans = 'Existing loans cannot be negative. Enter 0 or more.';
  }
  if (!errors.credit_history_months && v.credit_history_months < 0) {
    errors.credit_history_months = 'Credit history cannot be negative. Enter 0 or more months.';
  }
  if (
    !errors.monthly_income &&
    !errors.monthly_expense &&
    v.monthly_income > 0 &&
    v.monthly_expense > v.monthly_income
  ) {
    const dtiPct = ((v.monthly_expense / v.monthly_income) * 100).toFixed(1);
    errors.monthly_expense = `Expenses (${formatCurrency(v.monthly_expense)}) exceed income (${formatCurrency(v.monthly_income)}). DTI would be ${dtiPct}% — cannot evaluate.`;
  }
  if (!errors.monthly_income && v.monthly_income > INCOME_SANITY_CAP) {
    warnings.monthly_income = `Income of ${formatCurrency(v.monthly_income)} seems unusually high. Please verify before submitting.`;
  }

  return { valid: Object.keys(errors).length === 0, errors, warnings };
}

/**
 * Derived fields, computed before any engine layer runs.
 * dti = expense / income; affordability_buffer = (income − expense) / income.
 * @param {Object} inputs - numeric inputs
 * @returns {{dti: number|null, affordability_buffer: number|null}}
 */
export function deriveFields(inputs) {
  const income = Number(inputs?.monthly_income);
  const expense = Number(inputs?.monthly_expense);
  if (!Number.isFinite(income) || income <= 0 || !Number.isFinite(expense)) {
    return { dti: null, affordability_buffer: null };
  }
  return {
    dti: expense / income,
    affordability_buffer: (income - expense) / income,
  };
}
