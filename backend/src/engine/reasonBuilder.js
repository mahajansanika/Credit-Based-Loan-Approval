/**
 * Layer 7 — Reason Engine. Every output has a reason following:
 * Field → Actual Value → Threshold → Impact → Plain English.
 * Builds the full layered reason object plus the final summary and
 * one-line decision reason.
 */
import { formatCurrency, formatPercent } from '../utils/formatCurrency.js';
import { COMPONENT_LABELS } from './scorer.js';

/**
 * Pick the n weakest components (lowest raw score) for rejection summaries.
 * @param {Object} components
 * @param {number} n
 * @returns {Array<[string, Object]>}
 */
function lowestComponents(components, n = 2) {
  return Object.entries(components)
    .sort(([, a], [, b]) => a.rawScore - b.rawScore)
    .slice(0, n);
}

/**
 * Compose the final plain-English summary for a scored application.
 */
function composeScoredSummary(ctx) {
  const {
    decision, finalScore, baseScore, netAdjustment, band,
    derivedFields, inputs, interactions, targetScore,
  } = ctx;
  const parts = [`Score: ${finalScore}/900 — ${band.label} band.`];

  if (decision === 'Approved') {
    parts.push(`DTI of ${formatPercent(derivedFields.dti)} ${derivedFields.dti <= 0.3 ? 'is well within safe limits' : 'is manageable'},`);
    parts.push(`credit history of ${inputs.credit_history_months} months ${inputs.credit_history_months >= 36 ? 'is strong' : 'is adequate'},`);
    parts.push(`and ${inputs.defaults === 0 ? 'no defaults are recorded' : `${inputs.defaults} default(s) are recorded`}.`);
    if (interactions.firedRules.length === 0) {
      parts.push('No interaction penalties triggered.');
    } else {
      parts.push(`Net interaction adjustment: ${netAdjustment >= 0 ? '+' : ''}${netAdjustment} points.`);
    }
    parts.push('Application approved.');
  } else if (decision === 'Conditional') {
    parts.push(`Base score was ${baseScore} before a net interaction adjustment of ${netAdjustment >= 0 ? '+' : ''}${netAdjustment} points.`);
    const penalties = interactions.firedRules.filter((f) => f.rule.effect === 'penalty');
    if (penalties.length > 0) {
      parts.push(`DTI of ${formatPercent(derivedFields.dti)} triggered ${penalties.length} compound risk rule(s) totalling -${interactions.totalPenalty} points.`);
    }
    if (interactions.totalOffset > 0) {
      parts.push(`Offsets provided a partial recovery of +${interactions.totalOffset} points.`);
    }
    if (typeof targetScore === 'number') {
      parts.push(`${targetScore - finalScore} more points needed to reach Approved status.`);
    }
  } else {
    const weakest = lowestComponents(ctx.components, 2)
      .map(([key, c]) => `${COMPONENT_LABELS[key]} scored ${Math.round(c.rawScore)}/100`)
      .join(' and ');
    parts.push(`Primary factors: ${weakest}.`);
    if (interactions.totalPenalty > 0) {
      parts.push(`Interaction penalties added a further -${interactions.totalPenalty} points.`);
    }
    parts.push('Application rejected by score.');
  }
  return parts.join(' ');
}

/**
 * Compose the final summary for a pre-score (hard reject) outcome.
 */
function composePreScoreSummary(failures) {
  const detail = failures.map((f) => f.reason).join(' ');
  return `Application rejected before scoring. ${failures.length} hard rejection rule(s) triggered. ${detail} Scoring was not run.`;
}

/**
 * Build the complete layered reason object for an engine result.
 * @param {Object} ctx - everything the layers produced
 * @returns {Object} reasons
 */
export function buildReasons(ctx) {
  const {
    decision,
    inputs = {},
    derivedFields = {},
    validationErrors = {},
    hardRejectFailures = [],
    components = null,
    interactions = null,
    baseScore = null,
    netAdjustment = null,
    finalScore = null,
    band = null,
    targetScore = null,
  } = ctx;

  const reasons = {
    validationReasons: Object.entries(validationErrors).map(([field, message]) => ({ field, message })),
    hardRejectReasons: [],
    hardRejectSummary: null,
    componentReasons: null,
    interactionReasons: { fired: [], skipped: [] },
    finalSummary: '',
    decisionReason: '',
  };

  if (decision === 'Invalid') {
    reasons.finalSummary = 'Submission blocked by input validation. Resolve the field errors and resubmit.';
    reasons.decisionReason = 'Invalid input — evaluation not run.';
    return reasons;
  }

  if (hardRejectFailures.length > 0) {
    reasons.hardRejectReasons = hardRejectFailures.map((f) => f.reason);
    if (derivedFields.dti === 1) {
      reasons.hardRejectReasons.push(
        `Monthly expense equals monthly income (${formatCurrency(inputs.monthly_expense)}), leaving zero savings. DTI of 100% triggers automatic rejection.`
      );
    }
    reasons.hardRejectSummary = `${hardRejectFailures.length} hard rejection rule(s) triggered. All must be resolved before re-evaluation.`;
    reasons.finalSummary = composePreScoreSummary(hardRejectFailures);
    reasons.decisionReason = `Rejected before scoring — ${hardRejectFailures.length} hard reject rule(s) triggered. Scoring was not run.`;
    return reasons;
  }

  reasons.componentReasons = {};
  for (const [key, c] of Object.entries(components)) {
    reasons.componentReasons[key] = {
      label: c.label,
      rawScore: c.rawScore,
      weight: c.weight,
      weightedContribution: c.weightedContribution,
      reason: c.componentReason,
    };
  }
  reasons.interactionReasons = {
    fired: interactions.firedRules.map((f) => ({
      name: f.rule.name,
      effect: f.rule.effect,
      magnitude: f.rule.magnitude,
      reason: f.resolvedReason,
    })),
    skipped: interactions.skippedRules.map((s) => ({
      name: s.rule.name,
      effect: s.rule.effect,
      magnitude: s.rule.magnitude,
    })),
  };
  reasons.decisionReason = `Score ${finalScore}/900 — ${band.label} band → ${decision}.`;
  reasons.finalSummary = composeScoredSummary({
    decision, finalScore, baseScore, netAdjustment, band,
    derivedFields, inputs, interactions, components, targetScore,
  });
  return reasons;
}
