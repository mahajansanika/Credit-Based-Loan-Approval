/**
 * Excel parser (.xlsx / .xls) — reads the first sheet, maps flexible headers
 * to canonical fields, supports batch mode (one applicant per row), and
 * degrades gracefully on merged cells / irregular layouts.
 */
import * as XLSX from 'xlsx';
import { matchField, parseNumeric, missingFields, CANONICAL_FIELDS } from './fieldMap.js';

/**
 * Parse an Excel buffer into one or many applicants.
 * @param {Buffer} buffer
 * @returns {{applicants: Array<Object>, missing: string[], errors: string[]}}
 */
export function parseExcel(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    return {
      applicants: [],
      missing: [...CANONICAL_FIELDS],
      errors: [`Could not read this Excel file: ${err.message}`],
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { applicants: [], missing: [...CANONICAL_FIELDS], errors: ['The workbook contains no sheets.'] };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  if (rows.length === 0) {
    return { applicants: [], missing: [...CANONICAL_FIELDS], errors: ['The first sheet is empty.'] };
  }

  const errors = [];

  // Find the header row within the first few rows (handles title/merged rows above).
  let headerRowIndex = -1;
  let headerMap = {};
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const map = {};
    (rows[i] ?? []).forEach((cell, idx) => {
      const field = matchField(cell);
      if (field && !Object.values(map).includes(field)) map[idx] = field;
    });
    if (Object.keys(map).length >= 2) {
      headerRowIndex = i;
      headerMap = map;
      break;
    }
  }

  // Key:value layout fallback (labels in column A, values in column B).
  if (headerRowIndex === -1) {
    const fields = Object.fromEntries(CANONICAL_FIELDS.map((f) => [f, null]));
    let matched = 0;
    for (const row of rows) {
      const field = matchField(row?.[0]);
      if (field) {
        fields[field] = parseNumeric(row?.[1]);
        matched++;
      }
    }
    if (matched === 0) {
      return {
        applicants: [],
        missing: [...CANONICAL_FIELDS],
        errors: [`Could not recognise the sheet layout. Use column headers (${CANONICAL_FIELDS.join(', ')}) or label/value pairs.`],
      };
    }
    const missing = missingFields(fields);
    if (missing.length) errors.push(`Missing field(s): ${missing.join(', ')}. Please fill these manually.`);
    return { applicants: [fields], missing, errors };
  }

  if (headerRowIndex > 0) {
    errors.push(`Note: skipped ${headerRowIndex} row(s) above the header (merged/title cells).`);
  }
  const nameIndex = (rows[headerRowIndex] ?? []).findIndex(
    (c) => /name|applicant/i.test(String(c ?? '')) && !matchField(c)
  );

  const applicants = [];
  const unionMissing = new Set();
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((c) => c === null || c === '')) continue;
    const fields = Object.fromEntries(CANONICAL_FIELDS.map((f) => [f, null]));
    for (const [idx, field] of Object.entries(headerMap)) {
      fields[field] = parseNumeric(row[idx]);
    }
    if (nameIndex >= 0 && row[nameIndex]) fields.name = String(row[nameIndex]);
    const missing = missingFields(fields);
    if (missing.length === CANONICAL_FIELDS.length) {
      errors.push(`Row ${r + 1}: no usable values — row skipped.`);
      continue;
    }
    if (missing.length > 0) {
      errors.push(`Row ${r + 1}: missing ${missing.join(', ')}.`);
      missing.forEach((m) => unionMissing.add(m));
    }
    applicants.push(fields);
  }
  if (applicants.length === 0) {
    errors.push('No valid applicant rows found in this sheet.');
  }

  return { applicants, missing: [...unionMissing], errors };
}
