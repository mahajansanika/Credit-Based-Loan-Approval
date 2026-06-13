/**
 * Parity test — the contract: frontend and backend engines must produce
 * IDENTICAL output for identical inputs. The frontend engine is a mirrored
 * copy; this test asserts deep equality across a battery of profiles and
 * config variants.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFullEngine as backendEngine } from '../src/engine/engine.js';
import { runFullEngine as frontendEngine } from '../../frontend/src/engine/engine.js';
import { defaultConfig } from '../src/config/defaultConfig.js';
import { defaultConfig as frontendDefaultConfig } from '../../frontend/src/config/defaultConfig.js';

const PROFILES = [
  { label: 'clean approve', inputs: { monthly_income: 80000, monthly_expense: 20000, existing_loans: 0, credit_history_months: 48, defaults: 0 } },
  { label: 'conditional with penalties', inputs: { monthly_income: 50000, monthly_expense: 24000, existing_loans: 1, credit_history_months: 10, defaults: 0 } },
  { label: 'rejected by score', inputs: { monthly_income: 50000, monthly_expense: 30000, existing_loans: 1, credit_history_months: 10, defaults: 0 } },
  { label: 'multi hard reject', inputs: { monthly_income: 12000, monthly_expense: 11000, existing_loans: 2, credit_history_months: 4, defaults: 3 } },
  { label: 'expense equals income (DTI 100%)', inputs: { monthly_income: 30000, monthly_expense: 30000, existing_loans: 0, credit_history_months: 24, defaults: 0 } },
  { label: 'history at minimum edge', inputs: { monthly_income: 40000, monthly_expense: 15000, existing_loans: 0, credit_history_months: 6, defaults: 0 } },
  { label: 'single default edge', inputs: { monthly_income: 45000, monthly_expense: 18000, existing_loans: 1, credit_history_months: 30, defaults: 1 } },
  { label: 'high income high expense', inputs: { monthly_income: 100000, monthly_expense: 65000, existing_loans: 0, credit_history_months: 40, defaults: 0 } },
  { label: 'floor stress', inputs: { monthly_income: 15000, monthly_expense: 12000, existing_loans: 3, credit_history_months: 6, defaults: 1 } },
  { label: 'ceiling stress', inputs: { monthly_income: 200000, monthly_expense: 20000, existing_loans: 0, credit_history_months: 60, defaults: 0 } },
  { label: 'invalid inputs', inputs: { monthly_income: '', monthly_expense: -5, existing_loans: 'abc', credit_history_months: -1, defaults: -2 } },
  { label: 'string inputs with formatting', inputs: { monthly_income: '₹55,000', monthly_expense: '27,500', existing_loans: '1', credit_history_months: '18', defaults: '0' } },
  { label: 'income sanity cap', inputs: { monthly_income: 750000, monthly_expense: 100000, existing_loans: 0, credit_history_months: 50, defaults: 0 } },
];

const gapConfig = {
  ...defaultConfig,
  name: 'Gap config',
  scoreBands: [
    { min: 750, max: 900, label: 'Excellent', decision: 'Approved' },
    { min: 300, max: 500, label: 'Low', decision: 'Rejected' },
  ],
};

const unnormalisedConfig = {
  ...defaultConfig,
  name: 'Double weights',
  scoringWeights: { dti: 0.7, history: 0.5, defaults: 0.4, loanBurden: 0.24, affordabilityBuffer: 0.16 },
};

const bigOffsetConfig = {
  ...defaultConfig,
  name: 'Big offset',
  interactionRules: [
    {
      id: 'ir_mega_offset',
      name: 'Mega offset',
      logic: 'AND',
      effect: 'offset',
      magnitude: 500,
      conditions: [{ field: 'defaults', operator: 'eq', threshold: 0 }],
      reason: 'Offset {magnitude}.',
    },
  ],
};

test('default configs are identical on both sides', () => {
  assert.deepEqual(defaultConfig, frontendDefaultConfig);
});

for (const { label, inputs } of PROFILES) {
  test(`parity (default config): ${label}`, () => {
    assert.deepEqual(backendEngine(inputs, defaultConfig), frontendEngine(inputs, defaultConfig));
  });
}

for (const config of [gapConfig, unnormalisedConfig, bigOffsetConfig]) {
  test(`parity (${config.name}): conditional profile`, () => {
    const inputs = PROFILES[1].inputs;
    assert.deepEqual(backendEngine(inputs, config), frontendEngine(inputs, config));
  });
}
