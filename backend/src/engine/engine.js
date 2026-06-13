/**
 * Engine orchestrator — runs all layers in strict order:
 *   1. Input Validation        (validator.js)
 *   2. Derive fields           (dti, affordability_buffer)
 *   3. Hard Reject Engine      (hardReject.js)
 *   4. Base Scoring Engine     (scorer.js)
 *   5. Interaction Rule Engine (interactions.js)
 *   6. Final Score = clamp(300, 900, base + netAdjustment)
 *   7. Band Lookup             (bandLookup.js)
 *   8. Reason Engine           (reasonBuilder.js)
 *   9. Conditional Resolution  (conditionalResolver.js, Conditional only)
 *
 * Pure functions only — no Express, no MongoDB, no UI imports, no hardcoded
 * policy values. Callable standalone in Node.js and the browser. This file
 * and its siblings are mirrored byte-for-byte into frontend/src/engine/.
 */
import { runValidation, deriveFields, coerceInputs, FIELD_LABELS, INPUT_FIELDS, INCOME_SANITY_CAP } from './validator.js';
import { runHardRejects as runHardRejectRules } from './hardReject.js';
import { runScoring } from './scorer.js';
import { applyInteractionRules } from './interactions.js';
import { lookupBand, validateConfig, SCORE_MIN, SCORE_MAX } from './bandLookup.js';
import { buildReasons } from './reasonBuilder.js';
import { resolveConditional } from './conditionalResolver.js';

export { runValidation, deriveFields, coerceInputs, validateConfig, lookupBand, FIELD_LABELS, INPUT_FIELDS, INCOME_SANITY_CAP };
export { COMPONENT_LABELS } from './scorer.js';
export { evaluateOperator } from './hardReject.js';

/**
 * Layer 2 wrapper. Accepts either the full config object or a rules array.
 * @param {Object} inputs - numeric applicant inputs
 * @param {Object} derivedFields
 * @param {Object|Array} configOrRules
 * @returns {Array} failures
 */
export function runHardRejects(inputs, derivedFields, configOrRules) {
  const rules = Array.isArray(configOrRules)
    ? configOrRules
    : configOrRules?.hardRejectRules ?? [];
  return runHardRejectRules(inputs, derivedFields, rules);
}

/**
 * Lowest min of any Approved band — the score a Conditional applicant must reach.
 * @param {Object} config
 * @returns {number|null}
 */
export function getApprovalTarget(config) {
  const approved = (config?.scoreBands ?? []).filter((b) => b.decision === 'Approved');
  return approved.length ? Math.min(...approved.map((b) => b.min)) : null;
}

/**
 * Run the full engine pipeline.
 *
 * Contract output shape:
 * { decision, finalScore, baseScore, netAdjustment, band, hardRejectFailures,
 *   componentScores, firedInteractionRules, skippedInteractionRules, reasons,
 *   conditionalSuggestions, configWarnings }
 * plus: derivedFields, adjustment breakdown, conditionalAnalysis, validationErrors.
 *
 * @param {Object} rawInputs - applicant inputs (strings or numbers)
 * @param {Object} config - full rule config
 * @param {{simulation?: boolean}} [options] - simulation mode skips layers 1–2
 *   and layer 9 (used by the conditional resolver and the live simulator).
 * @returns {Object} complete result object
 */
export function runFullEngine(rawInputs, config, options = {}) {
  const { simulation = false } = options;
  const configWarnings = validateConfig(config);

  const base = {
    decision: null,
    finalScore: null,
    baseScore: null,
    netAdjustment: null,
    band: null,
    derivedFields: null,
    hardRejectFailures: [],
    componentScores: null,
    firedInteractionRules: [],
    skippedInteractionRules: [],
    adjustment: null,
    reasons: null,
    conditionalSuggestions: null,
    conditionalAnalysis: null,
    validationErrors: {},
    validationWarnings: {},
    configWarnings,
  };

  // Layer 1 — validation (skipped in simulation mode; simulated inputs are derived from valid ones).
  if (!simulation) {
    const validation = runValidation(rawInputs);
    base.validationWarnings = validation.warnings;
    if (!validation.valid) {
      base.decision = 'Invalid';
      base.validationErrors = validation.errors;
      base.reasons = buildReasons({ decision: 'Invalid', validationErrors: validation.errors });
      return base;
    }
  }

  const inputs = coerceInputs(rawInputs);
  const derivedFields = deriveFields(inputs);
  base.derivedFields = derivedFields;

  // Layer 2 — hard rejects (skipped in simulation mode).
  if (!simulation) {
    const failures = runHardRejects(inputs, derivedFields, config);
    if (failures.length > 0) {
      base.decision = 'Rejected (pre-score)';
      base.hardRejectFailures = failures;
      base.reasons = buildReasons({
        decision: 'Rejected (pre-score)',
        inputs,
        derivedFields,
        hardRejectFailures: failures,
      });
      return base;
    }
  }

  // Layer 3 — base scoring.
  const scoring = runScoring(inputs, derivedFields, config);

  // Layer 4 — interaction rules.
  const interactions = applyInteractionRules({ ...inputs, ...derivedFields }, config.interactionRules);

  // Layer 5 — final score, clamped to the scale.
  const finalScore = Math.min(SCORE_MAX, Math.max(SCORE_MIN, scoring.baseScore + interactions.netAdjustment));

  // Layer 6 — band lookup.
  const band = lookupBand(finalScore, config.scoreBands);
  const decision = band.decision;
  const targetScore = getApprovalTarget(config);

  base.decision = decision;
  base.finalScore = finalScore;
  base.baseScore = scoring.baseScore;
  base.netAdjustment = interactions.netAdjustment;
  base.band = band;
  base.componentScores = scoring.components;
  base.firedInteractionRules = interactions.firedRules;
  base.skippedInteractionRules = interactions.skippedRules;
  base.adjustment = {
    baseScore: scoring.baseScore,
    netAdjustment: interactions.netAdjustment,
    finalScore,
    totalPenalty: interactions.totalPenalty,
    totalOffset: interactions.totalOffset,
    penalties: interactions.firedRules
      .filter((f) => f.rule.effect === 'penalty')
      .map((f) => ({ name: f.rule.name, magnitude: f.rule.magnitude })),
    offsets: interactions.firedRules
      .filter((f) => f.rule.effect === 'offset')
      .map((f) => ({ name: f.rule.name, magnitude: f.rule.magnitude })),
  };

  // Layer 8 — conditional resolution (skipped in simulation mode to avoid recursion).
  if (!simulation && decision === 'Conditional') {
    const analysis = resolveConditional(
      inputs,
      config,
      {
        finalScore,
        firedRuleNames: interactions.firedRules.map((f) => f.rule.name),
      },
      (simInputs, simConfig) => runFullEngine(simInputs, simConfig, { simulation: true })
    );
    base.conditionalAnalysis = analysis;
    base.conditionalSuggestions = analysis.suggestions;
  }

  // Layer 7 — reasons (built last so it can reference the conditional target).
  base.reasons = buildReasons({
    decision,
    inputs,
    derivedFields,
    components: scoring.components,
    interactions,
    baseScore: scoring.baseScore,
    netAdjustment: interactions.netAdjustment,
    finalScore,
    band,
    targetScore,
  });

  return base;
}
