/**
 * POST /api/export/pdf — renders the full result report to PDF via
 * puppeteer-core using a locally installed Chrome/Edge (no Chromium
 * download). Retries once on timeout; returns a structured error so the
 * frontend can fall back to client-side generation. Never fails silently.
 */
import { Router } from 'express';
import { existsSync } from 'node:fs';
import Joi from 'joi';
import { validate } from '../middleware/validate.js';
import { buildReportHTML } from '../pdf/reportTemplate.js';

const router = Router();

const exportSchema = Joi.object({
  applicant: Joi.object().required(),
  result: Joi.object().required().messages({
    'any.required': 'Run evaluation first — no result data to export.',
  }),
  config: Joi.object().required(),
});

/** Locate a Chrome/Edge executable for puppeteer-core. */
function findBrowserExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Render HTML to a PDF buffer with puppeteer. */
async function renderPdf(html, executablePath) {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });
  } finally {
    await browser.close();
  }
}

router.post('/pdf', validate(exportSchema), async (req, res, next) => {
  try {
    const executablePath = findBrowserExecutable();
    if (!executablePath) {
      return res.status(503).json({
        error: 'NoBrowser',
        statusCode: 503,
        message:
          'No Chrome/Edge installation found for PDF rendering. Set PUPPETEER_EXECUTABLE_PATH in backend/.env, or use the in-browser export fallback.',
      });
    }

    const html = buildReportHTML(req.body);

    let buffer;
    try {
      buffer = await renderPdf(html, executablePath);
    } catch (firstErr) {
      console.warn(`[export] first render attempt failed (${firstErr.message}) — retrying once.`);
      buffer = await renderPdf(html, executablePath); // retry once per spec
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="credit-report-${timestamp}.pdf"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    err.statusCode = err.statusCode ?? 502;
    err.message = `PDF generation failed: ${err.message}`;
    next(err);
  }
});

export default router;
