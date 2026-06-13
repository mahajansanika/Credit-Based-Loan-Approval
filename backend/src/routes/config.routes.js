/**
 * Rule-config CRUD:
 *   GET    /api/config            — list saved configs
 *   GET    /api/config/active     — currently active config (or built-in default)
 *   POST   /api/config            — save a new config (optionally activate)
 *   PUT    /api/config/:id        — update a saved config
 *   PUT    /api/config/:id/activate — set active
 *   DELETE /api/config/:id        — delete
 */
import { Router } from 'express';
import Joi from 'joi';
import { validate } from '../middleware/validate.js';
import { validateConfig } from '../engine/engine.js';
import { defaultConfig } from '../config/defaultConfig.js';
import * as store from '../store/dataStore.js';

const router = Router();

const configShape = Joi.object({
  name: Joi.string().optional(),
  hardRejectRules: Joi.array().items(Joi.object()).required(),
  scoringWeights: Joi.object().required(),
  scoringThresholds: Joi.object().required(),
  scoreBands: Joi.array().items(Joi.object()).min(1).required(),
  interactionRules: Joi.array().items(Joi.object()).required(),
}).unknown(true);

const saveSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  config: configShape.required(),
  activate: Joi.boolean().default(true),
});

const updateSchema = Joi.object({
  name: Joi.string().min(1).max(120).optional(),
  config: configShape.optional(),
});

router.get('/', async (req, res, next) => {
  try {
    res.json({ configs: await store.listRuleConfigs() });
  } catch (err) {
    next(err);
  }
});

router.get('/active', async (req, res, next) => {
  try {
    const active = await store.getActiveRuleConfig();
    if (active) {
      return res.json({ id: active._id, name: active.name, config: active.config, builtin: false });
    }
    res.json({ id: null, name: defaultConfig.name, config: defaultConfig, builtin: true });
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(saveSchema), async (req, res, next) => {
  try {
    const { name, config, activate } = req.body;
    const saved = await store.saveRuleConfig({ name, config: { ...config, name } });
    if (activate) await store.activateRuleConfig(saved._id);
    res.status(201).json({
      config: { ...saved, isActive: activate },
      warnings: validateConfig(config),
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/activate', async (req, res, next) => {
  try {
    const updated = await store.activateRuleConfig(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: 'NotFound', statusCode: 404, message: 'Config not found.' });
    }
    res.json({ config: updated });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const updated = await store.updateRuleConfig(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'NotFound', statusCode: 404, message: 'Config not found.' });
    }
    res.json({ config: updated, warnings: req.body.config ? validateConfig(req.body.config) : [] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await store.deleteRuleConfig(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'NotFound', statusCode: 404, message: 'Config not found.' });
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
