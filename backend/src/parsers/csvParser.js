/**
 * CSV parser — flexible delimiter detection (comma / semicolon / pipe),
 * header-row and key:value formats, batch support (one applicant per row).
 */
import { parse } from 'csv-parse/sync';
import { matchField, parseNumeric, missingFields, CANONICAL_FIELDS } from './fieldMap.js';

/**
 * Detect the most likely delimiter from the first line.
 * @param {string} text
 * @returns {string}
 */
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [
    [',', (firstLine.match(/,/g) ?? []).length],
    [';', (firstLine.match(/;/g) ?? []).length],
    ['|', (firstLine.match(/\|/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/**
 * Map a header row to canonical fields. Returns { index → field }.
 * @param {string[]} headerRow
 * @returns {Object<number, string>}
 */
function mapHeader(headerRow) {
  const map = {};
  headerRow.forEach((cell, i) => {
    const field = matchField(cell);
    if (field && !Object.values(map).includes(field)) map[i] = field;
  });
  return map;
}

/**
 * Parse a CSV buffer into one or many applicants.
 * @param {Buffer} buffer
 * @returns {{applicants: Array<Object>, missing: string[], errors: string[]}}
 */
export function parseCsv(buffer) {
  const text = buffer.toString('utf-8').replace(/^﻿/, '');
  if (!text.trim()) {
    return { applicants: [], missing: [...CANONICAL_FIELDS], errors: ['The CSV file is empty.'] };
  }

  const delimiter = detectDelimiter(text);
  let rows;
  try {
    rows = parse(text, {
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch (err) {
    return {
      applicants: [],
      missing: [...CANONICAL_FIELDS],
      errors: [`Could not parse CSV: ${err.message}`],
    };
  }
  if (rows.length === 0) {
    return { applicants: [], missing: [...CANONICAL_FIELDS], errors: ['The CSV file has no rows.'] };
  }

  // Key:value format — two columns where the first column matches field names.
  const looksKeyValue =
    rows.every((r) => r.length >= 2) &&
    rows.filter((r) => matchField(r[0])).length >= Math.min(rows.length, 3);
  if (looksKeyValue && rows.length <= CANONICAL_FIELDS.length + 3) {
    const fields = Object.fromEntries(CANONICAL_FIELDS.map((f) => [f, null]));
    for (const row of rows) {
      const field = matchField(row[0]);
      if (field) fields[field] = parseNumeric(row[1]);
    }
    const missing = missingFields(fields);
    const errors = missing.length
      ? [`Missing column(s): ${missing.join(', ')}. Please fill these manually.`]
      : [];
    return { applicants: [fields], missing, errors };
  }

  // Header-row format.
  const headerMap = mapHeader(rows[0]);
  if (Object.keys(headerMap).length === 0) {
    return {
      applicants: [],
      missing: [...CANONICAL_FIELDS],
      errors: [`Could not recognise column headers. Found: ${rows[0].join(', ')}. Expected headers like: ${CANONICAL_FIELDS.join(', ')}.`],
    };
  }
  const nameIndex = rows[0].findIndex((c) => /name|applicant/i.test(String(c)) && !matchField(c));

  const applicants = [];
  const errors = [];
  let unionMissing = new Set();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
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
  if (applicants.length === 0 && errors.length === 0) {
    errors.push('No data rows found below the header.');
  }

  return { applicants, missing: [...unionMissing], errors };
}
