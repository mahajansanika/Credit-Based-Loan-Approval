/**
 * Parser router — detects file type by mimetype + extension and routes to
 * the correct parser, returning a standardised response:
 * { mode: 'single'|'batch'|'empty', applicants, missing, errors, rawText? }
 */
import { parsePdf } from './pdfParser.js';
import { parseCsv } from './csvParser.js';
import { parseExcel } from './excelParser.js';

export const ACCEPTED_MIMETYPES = [
  'application/pdf',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const ACCEPTED_EXTENSIONS = ['.pdf', '.csv', '.xls', '.xlsx'];

/**
 * Get the lowercase extension of a filename ('.csv').
 * @param {string} filename
 * @returns {string}
 */
export function fileExtension(filename) {
  const idx = String(filename ?? '').lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

/**
 * Parse an uploaded file (multer file object) into applicants.
 * @param {{originalname: string, mimetype: string, buffer: Buffer}} file
 * @returns {Promise<{mode: string, applicants: Array, missing: string[], errors: string[], rawText?: string}>}
 */
export async function parseFile(file) {
  const ext = fileExtension(file.originalname);
  let result;

  if (file.mimetype === 'application/pdf' || ext === '.pdf') {
    result = await parsePdf(file.buffer);
  } else if (file.mimetype.includes('csv') || ext === '.csv') {
    result = parseCsv(file.buffer);
  } else if (
    ext === '.xls' ||
    ext === '.xlsx' ||
    file.mimetype === 'application/vnd.ms-excel' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    result = parseExcel(file.buffer);
  } else {
    const err = new Error('Only PDF, CSV, and Excel files accepted.');
    err.statusCode = 415;
    throw err;
  }

  const mode =
    result.applicants.length > 1 ? 'batch' : result.applicants.length === 1 ? 'single' : 'empty';
  return { mode, ...result };
}
