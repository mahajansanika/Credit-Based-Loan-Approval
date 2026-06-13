/**
 * Layer 3 — Base Scoring Engine. Reads config.scoringWeights and
 * config.scoringThresholds (plus hard-reject floors for history/defaults).
 * Every component returns { rawScore, weight, weightedContribution, componentReason }.
 * All policy numbers come from config; the anchor points below define the
 * shape of the scoring curves (score values awarded at each threshold), not
 * the thresholds themselves.
 */
import { lerp, safeRatio } from '../utils/lerp.js';
import { formatPercent } from '../utils/formatCurrency.js';

/** Curve anchor scores (0–100 scale) — shape of curves, not policy thresholds. */
const ANCHOR = {
  FULL: 100,
  GOOD: 60,
  MID: 40,
  LOW: 20,
  HISTORY_FLOOR: 10,
  SINGLE_DEFAULT: 30,
  ZERO: 0,
};

/** Display labels for the five scoring components. */
export const COMPONENT_LABELS = {
  dti: 'DTI',
  history: 'Credit history',
  defaults: 'Defaults',
  loanBurden: 'Loan burden',
  affordabilityBuffer: 'Affordability buffer',
};

/**
 * Find the threshold of a hard-reject rule for a field (used as scoring floor).
 * @param {Array} rules - config.hardRejectRules
 * @param {string} field
 * @param {string[]} operators - acceptable operators
 * @param {number} fallback
 * @returns {number}
 */
function findRuleThreshold(rules, field, operators, fallback) {
  const rule = (rules ?? []).find(
    (r) => r.field === field && operators.includes(r.operator)
  );
  return rule ? Number(rule.threshold) : fallback;
}

/**
 * Normalise scoring weights so they sum to 1.0. If the sum is 0, fall back
 * to equal weights. The "auto-normalised" warning is produced by
 * validateConfig — this function normalises silently.
 * @param {Object<string, number>} weights
 * @returns {{normalised: Object<string, number>, sum: number}}
 */
export function normaliseWeights(weights) {
  const entries = Object.entries(weights ?? {});
  const sum = entries.reduce((acc, [, w]) => acc + (Number(w) || 0), 0);
  const normalised = {};
  if (sum <= 0) {
    for (const [k] of entries) normalised[k] = entries.length ? 1 / entries.length : 0;
    return { normalised, sum };
  }
  for (const [k, w] of entries) normalised[k] = (Number(w) || 0) / sum;
  return { normalised, sum };
}

/**
 * DTI component: full marks up to dtiSafe, then three lerp bands down to 0.
 * @returns {{rawScore: number, reason: string}}
 */
function scoreDTI(dti, t) {
  const pct = formatPercent;
  if (dti <= t.dtiSafe) {
    return {
      rawScore: ANCHOR.FULL,
      reason: `DTI of ${pct(dti)} is within the safe threshold of ${pct(t.dtiSafe)}.`,
    };
  }
  if (dti <= t.dtiHighRisk) {
    return {
      rawScore: lerp(ANCHOR.GOOD, ANCHOR.FULL, safeRatio(t.dtiHighRisk - dti, t.dtiHighRisk - t.dtiSafe)),
      reason: `DTI of ${pct(dti)} is ${pct(dti - t.dtiSafe)} above the safe threshold of ${pct(t.dtiSafe)}, within the high-risk limit of ${pct(t.dtiHighRisk)}.`,
    };
  }
  if (dti <= t.dtiCritical) {
    return {
      rawScore: lerp(ANCHOR.LOW, ANCHOR.GOOD, safeRatio(t.dtiCritical - dti, t.dtiCritical - t.dtiHighRisk)),
      reason: `DTI of ${pct(dti)} is ${pct(dti - t.dtiHighRisk)} above the high-risk threshold of ${pct(t.dtiHighRisk)}.`,
    };
  }
  return {
    rawScore: lerp(ANCHOR.ZERO, ANCHOR.LOW, safeRatio(1 - dti, 1 - t.dtiCritical)),
    reason: `DTI of ${pct(dti)} exceeds the critical threshold of ${pct(t.dtiCritical)} — repayment capacity is severely strained.`,
  };
}

/**
 * Credit-history component: full marks at excellentHistory, lerp bands below.
 * @returns {{rawScore: number, reason: string}}
 */
function scoreHistory(months, t, historyFloor) {
  if (months >= t.excellentHistory) {
    return {
      rawScore: ANCHOR.FULL,
      reason: `Credit history of ${months} months meets the excellent threshold of ${t.excellentHistory} months.`,
    };
  }
  if (months >= t.goodHistory) {
    return {
      rawScore: lerp(ANCHOR.GOOD, ANCHOR.FULL, safeRatio(months - t.goodHistory, t.excellentHistory - t.goodHistory)),
      reason: `Credit history of ${months} months is above the good threshold of ${t.goodHistory} months but below the excellent mark of ${t.excellentHistory} months.`,
    };
  }
  return {
    rawScore: lerp(ANCHOR.HISTORY_FLOOR, ANCHOR.GOOD, safeRatio(months - historyFloor, t.goodHistory - historyFloor)),
    reason: `Credit history of ${months} months is thin — above the minimum of ${historyFloor} months but below the good threshold of ${t.goodHistory} months.`,
  };
}

/**
 * Defaults component: 0 → 100, 1 → 30. More than the hard-reject limit never
 * reaches here under default config, but scores 0 defensively if the config changes.
 * @returns {{rawScore: number, reason: string}}
 */
function scoreDefaults(defaults, maxDefaults) {
  if (defaults === 0) {
    return { rawScore: ANCHOR.FULL, reason: 'No defaults on record — a clean repayment history.' };
  }
  if (defaults === 1) {
    return {
      rawScore: ANCHOR.SINGLE_DEFAULT,
      reason: `1 default on record against a maximum allowed ${maxDefaults}. A single default heavily penalises this component.`,
    };
  }
  return {
    rawScore: ANCHOR.ZERO,
    reason: `${defaults} defaults on record — at or beyond the hard-reject limit of ${maxDefaults}.`,
  };
}

/**
 * Loan-burden component: 0 loans → 100, lerp down to 40 at maxLoans, then to 0.
 * @returns {{rawScore: number, reason: string}}
 */
function scoreLoanBurden(loans, t) {
  if (loans === 0) {
    return { rawScore: ANCHOR.FULL, reason: 'No existing loans — no competing repayment obligations.' };
  }
  if (loans <= t.maxLoans) {
    return {
      rawScore: lerp(ANCHOR.MID, ANCHOR.FULL, safeRatio(t.maxLoans - loans, t.maxLoans)),
      reason: `${loans} existing loan(s) against a configured maximum of ${t.maxLoans}.`,
    };
  }
  return {
    rawScore: lerp(ANCHOR.ZERO, ANCHOR.MID, safeRatio(2 * t.maxLoans - loans, t.maxLoans)),
    reason: `${loans} existing loan(s) exceed the configured maximum of ${t.maxLoans}.`,
  };
}

/**
 * Affordability-buffer component: full marks at excellentBuffer, lerp bands below.
 * @returns {{rawScore: number, reason: string}}
 */
function scoreBuffer(buffer, t) {
  const pct = formatPercent;
  if (buffer >= t.excellentBuffer) {
    return {
      rawScore: ANCHOR.FULL,
      reason: `Affordability buffer of ${pct(buffer)} meets the excellent threshold of ${pct(t.excellentBuffer)} — a strong monthly surplus.`,
    };
  }
  if (buffer >= t.minAffordBuffer) {
    return {
      rawScore: lerp(ANCHOR.MID, ANCHOR.FULL, safeRatio(buffer - t.minAffordBuffer, t.excellentBuffer - t.minAffordBuffer)),
      reason: `Affordability buffer of ${pct(buffer)} is above the minimum of ${pct(t.minAffordBuffer)} but below the excellent threshold of ${pct(t.excellentBuffer)}.`,
    };
  }
  return {
    rawScore: lerp(ANCHOR.ZERO, ANCHOR.MID, safeRatio(buffer, t.minAffordBuffer)),
    reason: `Affordability buffer of ${pct(buffer)} is below the minimum threshold of ${pct(t.minAffordBuffer)} — little room to absorb an EMI.`,
  };
}

/**
 * Layer 3 entry point. Scores all five components, weights them and maps
 * the weighted average onto the 300–900 scale.
 * @param {Object} inputs - numeric applicant inputs
 * @param {Object} derivedFields - { dti, affordability_buffer }
 * @param {Object} config - full rule config
 * @returns {{components: Object, weightedAverage: number, baseScore: number, weightSum: number}}
 */
export function runScoring(inputs, derivedFields, config) {
  const t = config.scoringThresholds;
  const { normalised, sum } = normaliseWeights(config.scoringWeights);
  const historyFloor = findRuleThreshold(config.hardRejectRules, 'credit_history_months', ['lt', 'lte'], 0);
  const maxDefaults = findRuleThreshold(config.hardRejectRules, 'defaults', ['gt', 'gte'], 1);

  const rawComponents = {
    dti: scoreDTI(derivedFields.dti, t),
    history: scoreHistory(inputs.credit_history_months, t, historyFloor),
    defaults: scoreDefaults(inputs.defaults, maxDefaults),
    loanBurden: scoreLoanBurden(inputs.existing_loans, t),
    affordabilityBuffer: scoreBuffer(derivedFields.affordability_buffer, t),
  };

  const components = {};
  let weightedAverage = 0;
  for (const [key, { rawScore, reason }] of Object.entries(rawComponents)) {
    const weight = normalised[key] ?? 0;
    const weightedContribution = rawScore * weight;
    weightedAverage += weightedContribution;
    components[key] = {
      label: COMPONENT_LABELS[key],
      rawScore,
      weight,
      weightedContribution,
      componentReason: `${reason} Component score: ${Math.round(rawScore)}/100. Weighted contribution: ${weightedContribution.toFixed(1)}pts (${(weight * 100).toFixed(0)}% weight).`,
    };
  }

  const baseScore = Math.round(300 + (weightedAverage / 100) * 600);
  return { components, weightedAverage, baseScore, weightSum: sum };
}
