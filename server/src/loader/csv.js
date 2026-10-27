/**
 * Minimal RFC 4180 CSV parser
 * Supports quoted fields (with embedded commas, quotes, and newlines) and CRLF line endings.
 */

/**
 * Splits CSV text into records of raw fields.
 * @param {string} text
 * @returns {{ fields: string[], line: number }[]}
 */
function tokenize(text) {
  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      fields.push(field);
      records.push({ fields, line: recordLine });
      fields = [];
      field = '';
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    throw new Error(`Unterminated quoted field starting on line ${recordLine}`);
  }
  if (field !== '' || fields.length > 0) {
    fields.push(field);
    records.push({ fields, line: recordLine });
  }
  return records;
}

/**
 * Parses CSV text with a header row into objects keyed by header.
 * Rows whose field count differs from the header are reported, not repaired.
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[], errors: string[] }}
 */
function parseCsv(text) {
  const records = tokenize(text.replace(/^﻿/, ''))
    .filter(r => !(r.fields.length === 1 && r.fields[0].trim() === ''));

  if (records.length === 0) {
    return { headers: [], rows: [], errors: ['File is empty'] };
  }

  const headers = records[0].fields.map(h => h.trim());
  const errors = [];

  const blankHeader = headers.findIndex(h => h === '');
  if (blankHeader !== -1) {
    errors.push(`Header column ${blankHeader + 1} is blank`);
  }
  const duplicates = headers.filter((h, i) => h !== '' && headers.indexOf(h) !== i);
  if (duplicates.length > 0) {
    errors.push(`Duplicate header(s): ${[...new Set(duplicates)].join(', ')}`);
  }

  const rows = [];
  for (const { fields, line } of records.slice(1)) {
    if (fields.length !== headers.length) {
      errors.push(`Line ${line}: expected ${headers.length} fields, found ${fields.length}`);
      continue;
    }
    rows.push(Object.fromEntries(headers.map((h, i) => [h, fields[i].trim()])));
  }

  return { headers, rows, errors };
}

module.exports = { parseCsv };
