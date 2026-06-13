/**
 * Layer 2 — Hard Reject Engine. Reads config.hardRejectRules.
 * Collects ALL failures (never just the first). If any rule triggers,
 * the pipeline stops: decision = "Rejected (pre-score)".
 */
import { interpolateReason, formatFieldValue } from '../utils/interpolateReason.js';

/**
 * Evaluate one value against a threshold with a comparison operator.
 * @param {number} value
 * @param {"gt"|"lt"|"eq"|"gte"|"lte"|"neq"} operator
 * @param {number} threshold
 * @returns {boolean}
 */
export function evaluateOperator(value, operator, threshold) {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'lt': return value < threshold;
    case 'eq': return value === threshold;
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'neq': return value !== threshold;
    default: return false;
  }
}

/**
 * Shortfall magnitude in the direction of the operator:
 * lt/lte → how far below the threshold; gt/gte → how far above.
 * @param {number} value
 * @param {string} operator
 * @param {number} threshold
 * @returns {number}
 */
function computeShortfall(value, operator, threshold) {
  if (operator === 'lt' || operator === 'lte') return threshold - value;
  if (operator === 'gt' || operator === 'gte') return value - threshold;
  return Math.abs(value - threshold);
}

/**
 * Run every hard-reject rule against inputs + derived fields.
 * @param {Object} inputs - numeric applicant inputs
 * @param {Object} derivedFields - { dti, affordability_buffer }
 * @param {Array} rules - config.hardRejectRules
 * @returns {Array<{ruleId:string, ruleName:string, field:string, actualValue:number, threshold:number, shortfall:number, reason:string}>}
 */
export function runHardRejects(inputs, derivedFields, rules = []) {
  const evaluated = { ...inputs, ...derivedFields };
  const failures = [];

  for (const rule of rules) {
    const value = evaluated[rule.field];
    if (value === null || value === undefined || Number.isNaN(Number(value))) continue;
    if (!evaluateOperator(Number(value), rule.operator, rule.threshold)) continue;

    const shortfall = computeShortfall(Number(value), rule.operator, rule.threshold);
    failures.push({
      ruleId: rule.id,
      ruleName: rule.name,
      field: rule.field,
      actualValue: Number(value),
      threshold: rule.threshold,
      shortfall,
      reason: interpolateReason(rule.reason, evaluated, {
        threshold: formatFieldValue(rule.field, rule.threshold),
        value: formatFieldValue(rule.field, value),
        shortfall: formatFieldValue(rule.field, shortfall),
      }),
    });
  }

  return failures;
}
