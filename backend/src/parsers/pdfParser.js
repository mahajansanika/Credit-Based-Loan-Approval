/**
 * PDF parser — extracts applicant fields from uploaded PDF text using
 * flexible, case-insensitive label patterns. Scanned/image PDFs with no
 * extractable text return a clear "enter manually" error.
 */
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { FIELD_SYNONYMS, CANONICAL_FIELDS, missingFields } from './fieldMap.js';

/** Regex fragment that captures a ₹/comma formatted number. */
const NUMBER_PATTERN = String.raw`[₹,\s:=-]*([\d,]+\.?\d*)`;

/**
 * Extract a field value from raw text by trying each synonym as a label.
 * @param {string} text
 * @param {string} field
 * @returns {number|null}
 */
function extractField(text, field) {
  for (const synonym of FIELD_SYNONYMS[field]) {
    const label = synonym.split('').join('\\s*'); // tolerate spacing inside words
    const re = new RegExp(label + NUMBER_PATTERN, 'i');
    const match = text.replace(/[^\S\n]+/g, ' ').match(re);
    if (match) {
      const n = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * Parse a PDF buffer into applicant fields.
 * @param {Buffer} buffer
 * @returns {Promise<{applicants: Array<Object>, missing: string[], errors: string[], rawText?: string}>}
 */
export async function parsePdf(buffer) {
  let text = '';
  try {
    const data = await pdfParse(buffer);
    text = data.text ?? '';
  } catch (err) {
    return {
      applicants: [],
      missing: [...CANONICAL_FIELDS],
      errors: [`Could not read this PDF (${err.message}). Please enter fields manually.`],
    };
  }

  if (!text.trim()) {
    return {
      applicants: [],
      missing: [...CANONICAL_FIELDS],
      errors: ['Could not extract fields from this PDF. Please enter manually.'],
    };
  }

  const fields = {};
  for (const field of CANONICAL_FIELDS) {
    fields[field] = extractField(text, field);
  }

  const missing = missingFields(fields);
  const errors = [];
  if (missing.length === CANONICAL_FIELDS.length) {
    errors.push('Could not extract fields from this PDF. Please enter manually.');
  } else if (missing.length > 0) {
    errors.push(`Could not extract: ${missing.join(', ')}. Please fill these manually.`);
  }

  return {
    applicants: missing.length === CANONICAL_FIELDS.length ? [] : [fields],
    missing,
    errors,
    rawText: text.slice(0, 2000),
  };
}
