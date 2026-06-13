/**
 * Default rule configuration — the single source of truth for every
 * threshold, weight, band boundary and rule in the engine. The engine code
 * contains NO hardcoded policy numbers; it only reads this shape.
 *
 * This file is mirrored byte-for-byte at frontend/src/config/defaultConfig.js.
 */
export const defaultConfig = {
  name: 'Default Policy v1',

  hardRejectRules: [
    {
      id: 'hr_min_income',
      name: 'Minimum income',
      field: 'monthly_income',
      operator: 'lt',
      threshold: 15000,
      reason:
        'Income is {field:monthly_income}, which is {shortfall} below the required minimum of {threshold}.',
    },
    {
      id: 'hr_max_defaults',
      name: 'Maximum defaults',
      field: 'defaults',
      operator: 'gt',
      threshold: 1,
      reason:
        '{field:defaults} default(s) on record, exceeding the maximum allowed {threshold}. Each default signals a history of non-repayment.',
    },
    {
      id: 'hr_min_history',
      name: 'Minimum credit history',
      field: 'credit_history_months',
      operator: 'lt',
      threshold: 6,
      reason:
        'Credit history is {field:credit_history_months} months, below the required minimum of {threshold} months. Insufficient history to assess repayment behaviour.',
    },
    {
      id: 'hr_max_dti',
      name: 'DTI ceiling',
      field: 'dti',
      operator: 'gt',
      threshold: 0.8,
      reason:
        'DTI is {field:dti}, exceeding the hard rejection ceiling of {threshold}. Repayment capacity is critically compromised.',
    },
  ],

  scoringWeights: {
    dti: 0.35,
    history: 0.25,
    defaults: 0.2,
    loanBurden: 0.12,
    affordabilityBuffer: 0.08,
  },

  scoringThresholds: {
    dtiSafe: 0.3,
    dtiHighRisk: 0.45,
    dtiCritical: 0.6,
    maxLoans: 3,
    minAffordBuffer: 0.2,
    excellentBuffer: 0.4,
    excellentHistory: 36,
    goodHistory: 12,
  },

  scoreBands: [
    { min: 750, max: 900, label: 'Excellent', decision: 'Approved' },
    { min: 650, max: 749, label: 'Good', decision: 'Approved' },
    { min: 550, max: 649, label: 'Fair', decision: 'Conditional' },
    { min: 450, max: 549, label: 'Poor', decision: 'Rejected' },
    { min: 300, max: 449, label: 'Very Poor', decision: 'Rejected' },
  ],

  interactionRules: [
    {
      id: 'ir_dti_loans',
      name: 'High DTI with existing loans',
      logic: 'AND',
      effect: 'penalty',
      magnitude: 80,
      conditions: [
        { field: 'dti', operator: 'gt', threshold: 0.45 },
        { field: 'existing_loans', operator: 'gt', threshold: 0 },
      ],
      reason:
        'DTI of {field:dti} combined with {field:existing_loans} existing loan(s) compounds repayment risk. Penalty: {magnitude} points.',
    },
    {
      id: 'ir_dti_high_income',
      name: 'High spending despite high income',
      logic: 'AND',
      effect: 'penalty',
      magnitude: 60,
      conditions: [
        { field: 'dti', operator: 'gt', threshold: 0.55 },
        { field: 'monthly_income', operator: 'gt', threshold: 60000 },
      ],
      reason:
        'Despite a high income of {field:monthly_income}, DTI is {field:dti} — spending scales with earnings. Penalty: {magnitude} points.',
    },
    {
      id: 'ir_dti_thin_history',
      name: 'High DTI with thin credit history',
      logic: 'AND',
      effect: 'penalty',
      magnitude: 50,
      conditions: [
        { field: 'dti', operator: 'gt', threshold: 0.4 },
        { field: 'credit_history_months', operator: 'lt', threshold: 12 },
      ],
      reason:
        'DTI of {field:dti} with only {field:credit_history_months} months of credit history is an unproven risk. Penalty: {magnitude} points.',
    },
    {
      id: 'ir_clean_record_offset',
      name: 'Clean repayment record offset',
      logic: 'AND',
      effect: 'offset',
      magnitude: 30,
      conditions: [
        { field: 'defaults', operator: 'eq', threshold: 0 },
        { field: 'dti', operator: 'gt', threshold: 0.55 },
      ],
      reason:
        'Zero defaults despite a high DTI of {field:dti} shows repayment discipline under pressure. Offset: +{magnitude} points.',
    },
  ],
};
