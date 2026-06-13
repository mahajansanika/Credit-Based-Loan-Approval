/**
 * Layer 8 — Conditional Resolution Engine. Only runs when decision is
 * "Conditional". Reverse-simulates input changes through the full engine
 * (layers 3–7) to find the easiest paths to an Approved decision, plus
 * changes that will NOT work.
 *
 * The engine runner is injected to avoid a circular import with engine.js.
 */
import { formatCurrency, formatPercent } from '../utils/formatCurrency.js';

/** Expense-reduction steps tried, in ascending order (₹). */
const EXPENSE_STEPS = [1000, 2000, 5000, 8000, 10000, 15000, 20000];
/** Income-increase steps tried, in ascending order (₹). */
const INCOME_STEPS = [5000, 10000, 20000, 30000, 50000];
/** Heuristic ₹-equivalent effort of clearing one existing loan (for ranking). */
const LOAN_CLEAR_EFFORT = 10000;
/** Raising income is harder than cutting expense — effort multiplier for ranking. */
const INCOME_EFFORT_FACTOR = 1.5;
/** Maximum number of suggestions displayed. */
const MAX_SUGGESTIONS = 4;

/**
 * Build the explanatory reason for a viable suggestion, with numbers.
 */
function buildSuggestionReason({ changeDescription, oldDti, newDti, oldScore, newScore, targetScore, clearedRules }) {
  const parts = [
    `${changeDescription} lowers DTI from ${formatPercent(oldDti)} to ${formatPercent(newDti)},`,
    `lifting the score from ${oldScore} to ${newScore} (+${newScore - oldScore}) — at or above the approval threshold of ${targetScore}.`,
  ];
  if (newDti > oldDti) {
    parts[0] = `${changeDescription} changes DTI from ${formatPercent(oldDti)} to ${formatPercent(newDti)},`;
  }
  if (clearedRules.length > 0) {
    parts.push(`Rule(s) no longer triggered: ${clearedRules.join(', ')}.`);
  }
  return parts.join(' ');
}

/**
 * Resolve a Conditional decision into actionable suggestions.
 * @param {Object} inputs - numeric applicant inputs
 * @param {Object} config - full rule config
 * @param {{finalScore:number, firedRuleNames:string[]}} current
 * @param {Function} runEngine - (inputs, config) => simulation result (layers 3–7)
 * @returns {{targetScore:number|null, gap:number|null, suggestions:Array, ineffective:Array}}
 */
export function resolveConditional(inputs, config, current, runEngine) {
  const approvedBands = (config.scoreBands ?? []).filter((b) => b.decision === 'Approved');
  if (approvedBands.length === 0) {
    return {
      targetScore: null,
      gap: null,
      suggestions: [],
      ineffective: [
        {
          title: 'No approval band configured',
          message: 'No score band carries an Approved decision — approval is impossible under the current configuration.',
        },
      ],
    };
  }

  const targetScore = Math.min(...approvedBands.map((b) => b.min));
  const gap = targetScore - current.finalScore;
  const candidates = [];

  // a) Reduce monthly expense.
  for (const step of EXPENSE_STEPS) {
    if (inputs.monthly_expense - step < 0) break;
    candidates.push({
      kind: 'expense',
      effort: step,
      action: 'Reduce monthly expenses',
      changeDescription: `Reduce monthly expenses by ${formatCurrency(step)}`,
      changes: { monthly_expense: inputs.monthly_expense - step },
    });
  }
  // b) Clear existing loans.
  for (const n of [1, 2, 3]) {
    if (inputs.existing_loans - n < 0) break;
    candidates.push({
      kind: 'loans',
      effort: n * LOAN_CLEAR_EFFORT,
      action: 'Clear existing loans',
      changeDescription: `Close ${n} existing loan(s)`,
      changes: { existing_loans: inputs.existing_loans - n },
    });
  }
  // c) Increase monthly income.
  for (const step of INCOME_STEPS) {
    candidates.push({
      kind: 'income',
      effort: step * INCOME_EFFORT_FACTOR,
      action: 'Increase monthly income',
      changeDescription: `Increase monthly income by ${formatCurrency(step)}`,
      changes: { monthly_income: inputs.monthly_income + step },
    });
  }
  // d) Reduce expense + clear one loan (combined).
  if (inputs.existing_loans >= 1) {
    for (const step of EXPENSE_STEPS) {
      if (inputs.monthly_expense - step < 0) break;
      candidates.push({
        kind: 'expense_loan',
        effort: step + LOAN_CLEAR_EFFORT,
        action: 'Reduce expenses and clear a loan',
        changeDescription: `Reduce monthly expenses by ${formatCurrency(step)} and close 1 existing loan`,
        changes: {
          monthly_expense: inputs.monthly_expense - step,
          existing_loans: inputs.existing_loans - 1,
        },
      });
    }
  }
  // e) Reduce expense + increase income (combined).
  for (const expStep of EXPENSE_STEPS) {
    if (inputs.monthly_expense - expStep < 0) break;
    for (const incStep of INCOME_STEPS) {
      candidates.push({
        kind: 'expense_income',
        effort: expStep + incStep * INCOME_EFFORT_FACTOR,
        action: 'Reduce expenses and increase income',
        changeDescription: `Reduce monthly expenses by ${formatCurrency(expStep)} and increase income by ${formatCurrency(incStep)}`,
        changes: {
          monthly_expense: inputs.monthly_expense - expStep,
          monthly_income: inputs.monthly_income + incStep,
        },
      });
    }
  }

  candidates.sort((a, b) => a.effort - b.effort);

  const keptByKind = {};
  for (const candidate of candidates) {
    if (keptByKind[candidate.kind]) continue;
    const sim = runEngine({ ...inputs, ...candidate.changes }, config);
    if (!sim || sim.finalScore === null) continue;
    if (sim.finalScore >= targetScore && sim.decision === 'Approved') {
      const stillFired = (sim.firedInteractionRules ?? []).map((f) => f.rule.name);
      const clearedRules = (current.firedRuleNames ?? []).filter((n) => !stillFired.includes(n));
      keptByKind[candidate.kind] = {
        action: candidate.action,
        changeDescription: candidate.changeDescription,
        changes: candidate.changes,
        effort: candidate.effort,
        newDTI: formatPercent(sim.derivedFields.dti),
        newAffordBuffer: formatPercent(sim.derivedFields.affordability_buffer),
        newScore: sim.finalScore,
        pointsGained: sim.finalScore - current.finalScore,
        interactionRulesStillFired: stillFired,
        reason: buildSuggestionReason({
          changeDescription: candidate.changeDescription,
          oldDti: inputs.monthly_expense / inputs.monthly_income,
          newDti: sim.derivedFields.dti,
          oldScore: current.finalScore,
          newScore: sim.finalScore,
          targetScore,
          clearedRules,
        }),
      };
    }
  }

  const suggestions = Object.values(keptByKind)
    .sort((a, b) => a.effort - b.effort)
    .slice(0, MAX_SUGGESTIONS);

  // Ineffective changes — what will NOT work, and why.
  const ineffective = [];
  const doubled = runEngine({ ...inputs, monthly_income: inputs.monthly_income * 2 }, config);
  if (doubled && doubled.finalScore !== null && doubled.finalScore < targetScore) {
    ineffective.push({
      title: 'Doubling income is not enough',
      message: `Doubling income to ${formatCurrency(inputs.monthly_income * 2)} raises the score to ${doubled.finalScore} — still below the ${targetScore} threshold. Your DTI is driven by expense level, not income level. Reducing expenses will have a stronger effect.`,
    });
  }
  if (inputs.existing_loans > 0) {
    const zeroed = runEngine({ ...inputs, existing_loans: 0 }, config);
    if (zeroed && zeroed.finalScore !== null && zeroed.finalScore < targetScore) {
      ineffective.push({
        title: 'Clearing loans alone is not enough',
        message: `Clearing all existing loans raises the score by ${zeroed.finalScore - current.finalScore} points to ${zeroed.finalScore}. This alone is not enough — expense reduction is also needed.`,
      });
    }
  }

  return { targetScore, gap, suggestions, ineffective };
}
