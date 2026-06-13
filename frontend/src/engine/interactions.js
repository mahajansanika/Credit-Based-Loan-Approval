/**
 * Layer 4 — Interaction Rule Engine. Reads config.interactionRules.
 * Rules combine multiple conditions with AND / OR / MAJORITY logic and
 * apply a penalty or offset. Both fired and skipped rules are reported
 * for transparency.
 */
import { evaluateOperator } from './hardReject.js';
import { interpolateReason, formatFieldValue } from '../utils/interpolateReason.js';

/**
 * Evaluate one condition against the merged inputs + derived fields.
 * @param {Object} evaluatedInputs
 * @param {{field:string, operator:string, threshold:number}} condition
 * @returns {boolean}
 */
export function evaluateCondition(evaluatedInputs, condition) {
  const value = evaluatedInputs[condition.field];
  if (value === null || value === undefined || Number.isNaN(Number(value))) return false;
  return evaluateOperator(Number(value), condition.operator, condition.threshold);
}

/**
 * Evaluate a full interaction rule (all conditions + logic combinator).
 * @param {Object} evaluatedInputs
 * @param {Object} rule
 * @returns {{triggered: boolean, conditionResults: Array<{condition: Object, passed: boolean}>}}
 */
export function evaluateInteractionRule(evaluatedInputs, rule) {
  const conditionResults = (rule.conditions ?? []).map((condition) => ({
    condition,
    passed: evaluateCondition(evaluatedInputs, condition),
  }));
  const passes = conditionResults.filter((r) => r.passed).length;
  let triggered = false;
  if (rule.logic === 'AND') triggered = conditionResults.length > 0 && passes === conditionResults.length;
  else if (rule.logic === 'OR') triggered = passes > 0;
  else if (rule.logic === 'MAJORITY') triggered = passes > conditionResults.length / 2;
  return { triggered, conditionResults };
}

/**
 * Run every interaction rule, accumulate penalties and offsets, and report
 * both fired and skipped rules.
 * @param {Object} evaluatedInputs - inputs + derived fields merged
 * @param {Array} rules - config.interactionRules
 * @returns {{netAdjustment:number, totalPenalty:number, totalOffset:number, firedRules:Array, skippedRules:Array}}
 */
export function applyInteractionRules(evaluatedInputs, rules = []) {
  let totalPenalty = 0;
  let totalOffset = 0;
  const firedRules = [];
  const skippedRules = [];

  for (const rule of rules) {
    const { triggered, conditionResults } = evaluateInteractionRule(evaluatedInputs, rule);
    if (triggered) {
      if (rule.effect === 'penalty') totalPenalty += Number(rule.magnitude) || 0;
      else if (rule.effect === 'offset') totalOffset += Number(rule.magnitude) || 0;
      firedRules.push({
        rule,
        resolvedReason: interpolateReason(rule.reason, evaluatedInputs, {
          magnitude: rule.magnitude,
          threshold: rule.conditions?.length
            ? formatFieldValue(rule.conditions[0].field, rule.conditions[0].threshold)
            : '',
        }),
        conditionResults,
      });
    } else {
      skippedRules.push({ rule, conditionResults });
    }
  }

  return {
    netAdjustment: totalOffset - totalPenalty,
    totalPenalty,
    totalOffset,
    firedRules,
    skippedRules,
  };
}
