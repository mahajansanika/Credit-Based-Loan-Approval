/**
 * GET  /api/portfolio      — all evaluated applicants + summary stats
 * GET  /api/portfolio/:id  — one applicant with full result (Result page)
 * POST /api/portfolio      — save an explicit batch record
 */
import { Router } from 'express';
import Joi from 'joi';
import { validate } from '../middleware/validate.js';
import * as store from '../store/dataStore.js';

const router = Router();

const portfolioSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  applicantIds: Joi.array().items(Joi.alternatives(Joi.string(), Joi.object())).required(),
  summary: Joi.object().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const applicants = await store.listApplicants();
    const scored = applicants.filter((a) => typeof a.result?.finalScore === 'number');
    const approved = applicants.filter((a) => a.result?.decision === 'Approved');
    const withDti = applicants.filter((a) => typeof a.derivedFields?.dti === 'number');

    const summary = {
      total: applicants.length,
      approvalRate: applicants.length ? approved.length / applicants.length : 0,
      averageScore: scored.length
        ? Math.round(scored.reduce((acc, a) => acc + a.result.finalScore, 0) / scored.length)
        : null,
      averageDti: withDti.length
        ? withDti.reduce((acc, a) => acc + a.derivedFields.dti, 0) / withDti.length
        : null,
      decisions: {
        Approved: approved.length,
        Conditional: applicants.filter((a) => a.result?.decision === 'Conditional').length,
        Rejected: applicants.filter((a) => String(a.result?.decision ?? '').startsWith('Rejected')).length,
      },
    };

    res.json({ summary, applicants, batches: await store.listPortfolios() });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const applicant = await store.getApplicantById(req.params.id);
    if (!applicant) {
      return res.status(404).json({ error: 'NotFound', statusCode: 404, message: 'Applicant not found.' });
    }
    res.json({ applicant });
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(portfolioSchema), async (req, res, next) => {
  try {
    const batch = await store.savePortfolioBatch(req.body);
    res.status(201).json({ batch });
  } catch (err) {
    next(err);
  }
});

export default router;
