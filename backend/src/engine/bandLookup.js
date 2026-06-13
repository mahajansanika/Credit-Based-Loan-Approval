/**
 * Layer 6 — Score band lookup + config validation.
 * lookupBand resolves a final score into a band (first match wins).
 * validateConfig produces the six categories of config warnings shown
 * in the Rule Config panel and attached to every engine result.
 */
import { formatPercent } from '../utils/formatCurrency.js';

/** Score scale boundaries (the credit-score scale itself, not policy). */
export const SCORE_MIN = 300;
export const SCORE_MAX = 900;

/**
 * Find the band covering a score. First match in config order wins.
 * @param {number} finalScore
 * @param {Array} scoreBands
 * @returns {{min:number|null, max:number|null, label:string, decision:string, warning?:string}}
 */
export function lookupBand(finalScore, scoreBands = []) {
  const match = scoreBands.find((b) => finalScore >= b.min && finalScore <= b.max);
  if (!match) {
    return {
      min: null,
      max: null,
      label: 'Undetermined',
      decision: 'Conditional',
      warning: `Score ${finalScore} falls in a gap between bands. Check band configuration.`,
    };
  }
  return match;
}

/**
 * Describe an integer range for warning messages ("score 612" / "scores 600–630").
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
function rangeText(start, end) {
  return start === end ? `score ${start}` : `scores ${start}–${end}`;
}

/**
 * Detect feasibility of an AND-combined condition set on shared fields.
 * Returns true when no value can satisfy all conditions simultaneously.
 * @param {Array<{field:string, operator:string, threshold:number}>} conditions
 * @returns {boolean}
 */
function isImpossibleConditionSet(conditions) {
  const byField = {};
  for (const c of conditions ?? []) {
    (byField[c.field] ??= []).push(c);
  }
  for (const fieldConditions of Object.values(byField)) {
    let lower = -Infinity;
    let lowerInclusive = true;
    let upper = Infinity;
    let upperInclusive = true;
    const equals = [];
    const notEquals = [];
    for (const c of fieldConditions) {
      const t = Number(c.threshold);
      if (c.operator === 'gt' && t >= lower) { lower = t; lowerInclusive = false; }
      if (c.operator === 'gte' && t > lower) { lower = t; lowerInclusive = true; }
      if (c.operator === 'lt' && t <= upper) { upper = t; upperInclusive = false; }
      if (c.operator === 'lte' && t < upper) { upper = t; upperInclusive = true; }
      if (c.operator === 'eq') equals.push(t);
      if (c.operator === 'neq') notEquals.push(t);
    }
    if (lower > upper) return true;
    if (lower === upper && !(lowerInclusive && upperInclusive)) return true;
    if (new Set(equals).size > 1) return true;
    for (const eq of equals) {
      if (eq < lower || (eq === lower && !lowerInclusive)) return true;
      if (eq > upper || (eq === upper && !upperInclusive)) return true;
      if (notEquals.includes(eq)) return true;
    }
  }
  return false;
}

/**
 * Validate a full config object. Runs on every config change and inside
 * every engine evaluation.
 * @param {Object} config
 * @returns {Array<{type:string, message:string}>}
 */
export function validateConfig(config) {
  const warnings = [];
  const bands = config?.scoreBands ?? [];

  // 1 & 2 — band gaps and overlaps across the full 300–900 scale.
  let gapStart = null;
  let overlapStart = null;
  let overlapPair = null;
  const closeGap = (end) => {
    if (gapStart !== null) {
      warnings.push({ type: 'band_gap', message: `Gap detected: no band covers ${rangeText(gapStart, end)}.` });
      gapStart = null;
    }
  };
  const closeOverlap = (end) => {
    if (overlapStart !== null) {
      warnings.push({
        type: 'band_overlap',
        message: `Overlap: bands '${overlapPair[0]}' and '${overlapPair[1]}' both cover ${rangeText(overlapStart, end)}. First match will be used.`,
      });
      overlapStart = null;
      overlapPair = null;
    }
  };
  for (let s = SCORE_MIN; s <= SCORE_MAX; s++) {
    const matches = bands.filter((b) => s >= b.min && s <= b.max);
    if (matches.length === 0) {
      closeOverlap(s - 1);
      if (gapStart === null) gapStart = s;
    } else if (matches.length > 1) {
      closeGap(s - 1);
      const pair = [matches[0].label, matches[1].label];
      if (overlapStart === null || pair[0] !== overlapPair[0] || pair[1] !== overlapPair[1]) {
        closeOverlap(s - 1);
        overlapStart = s;
        overlapPair = pair;
      }
    } else {
      closeGap(s - 1);
      closeOverlap(s - 1);
    }
  }
  closeGap(SCORE_MAX);
  closeOverlap(SCORE_MAX);

  // 3 — weight sum.
  const weightSum = Object.values(config?.scoringWeights ?? {}).reduce(
    (acc, w) => acc + (Number(w) || 0),
    0
  );
  if (Math.abs(weightSum - 1) > 1e-9) {
    warnings.push({
      type: 'weights',
      message: `Weights auto-normalised from ${(weightSum * 100).toFixed(1)}% to 100%.`,
    });
  }

  // 4 — conflicting DTI thresholds.
  const hardDti = (config?.hardRejectRules ?? []).find(
    (r) => r.field === 'dti' && (r.operator === 'gt' || r.operator === 'gte')
  );
  const highRisk = config?.scoringThresholds?.dtiHighRisk;
  if (hardDti && typeof highRisk === 'number' && hardDti.threshold < highRisk) {
    warnings.push({
      type: 'threshold_conflict',
      message: `Conflict: hard reject DTI (${formatPercent(hardDti.threshold)}) is lower than the high-risk scoring threshold (${formatPercent(highRisk)}). The high-risk flag is now redundant.`,
    });
  }

  // 5 — zero thresholds disable rules.
  for (const rule of config?.hardRejectRules ?? []) {
    if (Number(rule.threshold) === 0) {
      warnings.push({
        type: 'zero_threshold',
        message: `Rule '${rule.name}' threshold is 0 — this rule is effectively disabled.`,
      });
    }
  }

  // 6 — interaction rules that can never trigger.
  for (const rule of config?.interactionRules ?? []) {
    if (rule.logic === 'AND' && isImpossibleConditionSet(rule.conditions)) {
      warnings.push({
        type: 'dead_rule',
        message: `Rule '${rule.name}' may never trigger — review condition combination.`,
      });
    }
    if (Number(rule.magnitude) === 0) {
      warnings.push({
        type: 'zero_threshold',
        message: `Rule '${rule.name}' magnitude is 0 — triggering it has no effect.`,
      });
    }
  }

  return warnings;
}
