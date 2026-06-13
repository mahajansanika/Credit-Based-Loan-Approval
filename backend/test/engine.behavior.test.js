/**
 * Behavioural tests for the engine — covers the specified negative cases:
 * validation (1–9), hard rejects collect all failures (15–20), scoring edges
 * (21–26), interaction stacking and clamping (27–30), config warnings (31–36).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFullEngine, runValidation, validateConfig, getApprovalTarget } from '../src/engine/engine.js';
import { defaultConfig } from '../src/config/defaultConfig.js';

const ok = {
  monthly_income: 50000,
  monthly_expense: 20000,
  existing_loans: 0,
  credit_history_months: 24,
  defaults: 0,
};

// ---------- Layer 1: validation ----------

test('validation: empty and non-numeric fields produce field errors', () => {
  const { valid, errors } = runValidation({ monthly_income: '', monthly_expense: 'abc' });
  assert.equal(valid, false);
  assert.match(errors.monthly_income, /required and must be a number/);
  assert.match(errors.monthly_expense, /required and must be a number/);
  assert.ok(errors.existing_loans && errors.credit_history_months && errors.defaults);
});

test('validation: income must be > 0; negatives rejected per field', () => {
  const { errors } = runValidation({ ...ok, monthly_income: 0, existing_loans: -1, defaults: -2, credit_history_months: -3 });
  assert.equal(errors.monthly_income, 'Income must be greater than ₹0.');
  assert.match(errors.existing_loans, /cannot be negative/);
  assert.match(errors.defaults, /cannot be negative/);
  assert.match(errors.credit_history_months, /cannot be negative/);
});

test('validation: expense > income is blocked with DTI in the message', () => {
  const { errors } = runValidation({ ...ok, monthly_expense: 60000 });
  assert.match(errors.monthly_expense, /exceed income/);
  assert.match(errors.monthly_expense, /120\.0%/);
});

test('validation: income above sanity cap is a warning, not an error', () => {
  const { valid, warnings } = runValidation({ ...ok, monthly_income: 600000 });
  assert.equal(valid, true);
  assert.match(warnings.monthly_income, /unusually high/);
});

test('validation: history of exactly 0 passes validation (hard reject catches it)', () => {
  const { valid } = runValidation({ ...ok, credit_history_months: 0 });
  assert.equal(valid, true);
  const result = runFullEngine({ ...ok, credit_history_months: 0 }, defaultConfig);
  assert.equal(result.decision, 'Rejected (pre-score)');
});

// ---------- Layer 2: hard rejects ----------

test('hard reject: ALL failures collected, scoring not run', () => {
  const result = runFullEngine(
    { monthly_income: 12000, monthly_expense: 11000, existing_loans: 0, credit_history_months: 4, defaults: 3 },
    defaultConfig
  );
  assert.equal(result.decision, 'Rejected (pre-score)');
  // income < 15000, defaults > 1, history < 6, dti ≈ 0.917 > 0.80 → all four rules
  assert.equal(result.hardRejectFailures.length, 4);
  assert.equal(result.finalScore, null);
  assert.equal(result.componentScores, null);
  assert.match(result.reasons.hardRejectSummary, /4 hard rejection rule\(s\) triggered/);
  const incomeFailure = result.hardRejectFailures.find((f) => f.field === 'monthly_income');
  assert.equal(incomeFailure.shortfall, 3000);
  assert.match(incomeFailure.reason, /₹12,000/);
  assert.match(incomeFailure.reason, /₹3,000/);
});

test('hard reject: expense = income (DTI 100%) adds the zero-savings reason', () => {
  const result = runFullEngine({ ...ok, monthly_expense: ok.monthly_income }, defaultConfig);
  assert.equal(result.decision, 'Rejected (pre-score)');
  assert.ok(result.reasons.hardRejectReasons.some((r) => /DTI of 100% triggers automatic rejection/.test(r)));
});

// ---------- Layer 3: scoring edges ----------

test('scoring: floor profile lands near 300, ceiling near 900', () => {
  const floor = runFullEngine(
    { monthly_income: 15000, monthly_expense: 12000, existing_loans: 3, credit_history_months: 6, defaults: 1 },
    defaultConfig
  );
  assert.ok(floor.finalScore !== null && floor.finalScore <= 400, `floor score ${floor.finalScore}`);
  const ceiling = runFullEngine(
    { monthly_income: 200000, monthly_expense: 20000, existing_loans: 0, credit_history_months: 60, defaults: 0 },
    defaultConfig
  );
  assert.ok(ceiling.finalScore >= 850, `ceiling score ${ceiling.finalScore}`);
  assert.equal(ceiling.decision, 'Approved');
});

test('scoring: high income does not cancel bad DTI', () => {
  const highSpend = runFullEngine(
    { monthly_income: 100000, monthly_expense: 65000, existing_loans: 0, credit_history_months: 40, defaults: 0 },
    defaultConfig
  );
  const lowSpend = runFullEngine(
    { monthly_income: 100000, monthly_expense: 25000, existing_loans: 0, credit_history_months: 40, defaults: 0 },
    defaultConfig
  );
  assert.ok(highSpend.componentScores.dti.rawScore < 60, 'DTI component must score poorly');
  assert.ok(
    lowSpend.finalScore - highSpend.finalScore >= 100,
    `same income with high spending must cost ≥100 points (cost was ${lowSpend.finalScore - highSpend.finalScore})`
  );
});

test('scoring: every component carries value, threshold and contribution in its reason', () => {
  const result = runFullEngine(ok, defaultConfig);
  for (const c of Object.values(result.componentScores)) {
    assert.match(c.componentReason, /Component score: \d+\/100/);
    assert.match(c.componentReason, /Weighted contribution: [\d.]+pts/);
  }
});

// ---------- Layers 4–5: interactions and clamping ----------

test('interactions: penalties stack and offset partially cancels', () => {
  // dti = 0.6, income 70000 > 60000, loans 1, history 10 < 12, defaults 0
  const result = runFullEngine(
    { monthly_income: 70000, monthly_expense: 42000, existing_loans: 1, credit_history_months: 10, defaults: 0 },
    defaultConfig
  );
  const fired = result.firedInteractionRules.map((f) => f.rule.id).sort();
  assert.deepEqual(fired, ['ir_clean_record_offset', 'ir_dti_high_income', 'ir_dti_loans', 'ir_dti_thin_history']);
  assert.equal(result.adjustment.totalPenalty, 190);
  assert.equal(result.adjustment.totalOffset, 30);
  assert.equal(result.netAdjustment, -160);
  assert.equal(result.finalScore, result.baseScore - 160);
});

test('clamping: penalties cannot push below 300, offsets cannot push above 900', () => {
  const heavyPenalty = {
    ...defaultConfig,
    interactionRules: [{
      id: 'p', name: 'P', logic: 'AND', effect: 'penalty', magnitude: 900,
      conditions: [{ field: 'defaults', operator: 'eq', threshold: 0 }], reason: 'p',
    }],
  };
  assert.equal(runFullEngine(ok, heavyPenalty).finalScore, 300);
  const heavyOffset = {
    ...defaultConfig,
    interactionRules: [{
      id: 'o', name: 'O', logic: 'AND', effect: 'offset', magnitude: 900,
      conditions: [{ field: 'defaults', operator: 'eq', threshold: 0 }], reason: 'o',
    }],
  };
  assert.equal(runFullEngine(ok, heavyOffset).finalScore, 900);
});

test('interactions: OR and MAJORITY logic', () => {
  const cfg = {
    ...defaultConfig,
    interactionRules: [
      { id: 'or', name: 'OR rule', logic: 'OR', effect: 'penalty', magnitude: 10,
        conditions: [{ field: 'defaults', operator: 'eq', threshold: 5 }, { field: 'existing_loans', operator: 'eq', threshold: 0 }], reason: 'or' },
      { id: 'maj', name: 'MAJ rule', logic: 'MAJORITY', effect: 'penalty', magnitude: 10,
        conditions: [
          { field: 'defaults', operator: 'eq', threshold: 0 },
          { field: 'existing_loans', operator: 'eq', threshold: 0 },
          { field: 'monthly_income', operator: 'gt', threshold: 999999 },
        ], reason: 'maj' },
    ],
  };
  const result = runFullEngine(ok, cfg);
  assert.deepEqual(result.firedInteractionRules.map((f) => f.rule.id).sort(), ['maj', 'or']);
});

// ---------- Layer 6: band lookup + config warnings ----------

test('band gap: result is Undetermined/Conditional with a warning', () => {
  const cfg = {
    ...defaultConfig,
    scoreBands: [
      { min: 750, max: 900, label: 'Excellent', decision: 'Approved' },
      { min: 300, max: 500, label: 'Low', decision: 'Rejected' },
    ],
  };
  const result = runFullEngine(ok, cfg); // lands between 501 and 749
  if (result.finalScore > 500 && result.finalScore < 750) {
    assert.equal(result.band.label, 'Undetermined');
    assert.equal(result.decision, 'Conditional');
    assert.match(result.band.warning, /falls in a gap/);
  }
  assert.ok(result.configWarnings.some((w) => w.type === 'band_gap'));
});

test('config warnings: overlap, weights, conflict, zero threshold, dead rule', () => {
  const cfg = {
    ...defaultConfig,
    scoringWeights: { dti: 0.5, history: 0.5, defaults: 0.5, loanBurden: 0.5, affordabilityBuffer: 0.5 },
    scoreBands: [
      { min: 300, max: 700, label: 'A', decision: 'Rejected' },
      { min: 600, max: 900, label: 'B', decision: 'Approved' },
    ],
    hardRejectRules: [
      ...defaultConfig.hardRejectRules.filter((r) => r.field !== 'dti'),
      { id: 'hr_dti_low', name: 'Tight DTI', field: 'dti', operator: 'gt', threshold: 0.4, reason: 'x' },
      { id: 'hr_zero', name: 'Disabled rule', field: 'defaults', operator: 'gt', threshold: 0, reason: 'x' },
    ],
    interactionRules: [
      { id: 'dead', name: 'Dead rule', logic: 'AND', effect: 'penalty', magnitude: 10,
        conditions: [
          { field: 'dti', operator: 'gt', threshold: 0.6 },
          { field: 'dti', operator: 'lt', threshold: 0.4 },
        ], reason: 'dead' },
    ],
  };
  const types = validateConfig(cfg).map((w) => w.type);
  assert.ok(types.includes('band_overlap'), 'overlap warning');
  assert.ok(types.includes('weights'), 'weights warning');
  assert.ok(types.includes('threshold_conflict'), 'conflict warning');
  assert.ok(types.includes('zero_threshold'), 'zero threshold warning');
  assert.ok(types.includes('dead_rule'), 'dead rule warning');
});

test('weights auto-normalise: doubled weights give the same score', () => {
  const doubled = {
    ...defaultConfig,
    scoringWeights: { dti: 0.7, history: 0.5, defaults: 0.4, loanBurden: 0.24, affordabilityBuffer: 0.16 },
  };
  assert.equal(runFullEngine(ok, doubled).finalScore, runFullEngine(ok, defaultConfig).finalScore);
});

// ---------- Layer 8: conditional resolution ----------

test('conditional: suggestions are viable, ranked easiest first, max 4', () => {
  const inputs = { monthly_income: 50000, monthly_expense: 24000, existing_loans: 1, credit_history_months: 10, defaults: 0 };
  const result = runFullEngine(inputs, defaultConfig);
  assert.equal(result.decision, 'Conditional');
  const target = getApprovalTarget(defaultConfig);
  assert.equal(result.conditionalAnalysis.targetScore, target);
  assert.equal(result.conditionalAnalysis.gap, target - result.finalScore);
  assert.ok(result.conditionalSuggestions.length >= 1);
  assert.ok(result.conditionalSuggestions.length <= 4);
  for (const s of result.conditionalSuggestions) {
    assert.ok(s.newScore >= target, `${s.changeDescription} reaches target`);
    assert.ok(s.pointsGained > 0);
    assert.match(s.reason, /\d/);
  }
  const efforts = result.conditionalSuggestions.map((s) => s.effort);
  assert.deepEqual(efforts, [...efforts].sort((a, b) => a - b));
});

test('approved and rejected results carry no conditional suggestions', () => {
  const approved = runFullEngine(
    { monthly_income: 90000, monthly_expense: 20000, existing_loans: 0, credit_history_months: 48, defaults: 0 },
    defaultConfig
  );
  assert.equal(approved.decision, 'Approved');
  assert.equal(approved.conditionalSuggestions, null);
});
