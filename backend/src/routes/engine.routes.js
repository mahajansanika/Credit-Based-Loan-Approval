/**
 * POST /api/evaluate        — evaluate one applicant and persist the result
 * POST /api/evaluate/batch  — evaluate many applicants (CSV/Excel batches)
 */
import { Router } from 'express';
import Joi from 'joi';
import { validate } from '../middleware/validate.js';
import { runFullEngine, coerceInputs, deriveFields } from '../engine/engine.js';
import { defaultConfig } from '../config/defaultConfig.js';
import * as store from '../store/dataStore.js';

const router = Router();

const evaluateSchema = Joi.object({
  name: Joi.string().allow('').max(120).default('Applicant'),
  inputs: Joi.object().required(),
  config: Joi.object().optional(),
});

const batchSchema = Joi.object({
  name: Joi.string().allow('').max(120).default('Batch'),
  applicants: Joi.array().items(Joi.object()).min(1).required(),
  config: Joi.object().optional(),
});

/** Resolve the config to evaluate with: request override → active saved → default. */
async function resolveConfig(requestConfig) {
  if (requestConfig && Object.keys(requestConfig).length > 0) return requestConfig;
  const active = await store.getActiveRuleConfig();
  return active?.config ?? defaultConfig;
}

router.post('/evaluate', validate(evaluateSchema), async (req, res, next) => {
  try {
    const config = await resolveConfig(req.body.config);
    const result = runFullEngine(req.body.inputs, config);

    if (result.decision === 'Invalid') {
      return res.status(422).json({
        error: 'InvalidInput',
        statusCode: 422,
        message: 'Input validation failed.',
        validationErrors: result.validationErrors,
      });
    }

    const inputs = coerceInputs(req.body.inputs);
    const applicant = await store.saveApplicant({
      name: req.body.name || 'Applicant',
      inputs,
      derivedFields: result.derivedFields ?? deriveFields(inputs),
      result,
      configName: config.name ?? 'Custom config',
    });

    res.status(201).json({ id: applicant._id, applicant });
  } catch (err) {
    next(err);
  }
});

router.post('/evaluate/batch', validate(batchSchema), async (req, res, next) => {
  try {
    const config = await resolveConfig(req.body.config);
    const results = [];
    const errors = [];

    for (let i = 0; i < req.body.applicants.length; i++) {
      const row = req.body.applicants[i];
      const result = runFullEngine(row, config);
      if (result.decision === 'Invalid') {
        errors.push({ row: i + 1, name: row.name ?? null, errors: result.validationErrors });
        continue;
      }
      const inputs = coerceInputs(row);
      const applicant = await store.saveApplicant({
        name: row.name || `Applicant ${i + 1}`,
        inputs,
        derivedFields: result.derivedFields ?? deriveFields(inputs),
        result,
        configName: config.name ?? 'Custom config',
      });
      results.push(applicant);
    }

    if (results.length === 0) {
      return res.status(200).json({
        evaluated: 0,
        failed: errors.length,
        results: [],
        errors,
        message: 'No valid applicants found in file.',
      });
    }

    const summary = {
      total: results.length,
      approved: results.filter((r) => r.result.decision === 'Approved').length,
      conditional: results.filter((r) => r.result.decision === 'Conditional').length,
      rejected: results.filter((r) => String(r.result.decision).startsWith('Rejected')).length,
    };
    await store.savePortfolioBatch({
      name: req.body.name || `Batch of ${results.length}`,
      applicantIds: results.map((r) => r._id),
      summary,
    });

    res.status(201).json({
      evaluated: results.length,
      failed: errors.length,
      results,
      errors,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
