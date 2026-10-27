/**
 * Pre-populates a data mapping from a customer's uploaded datasets to the platform standards.
 * Only exact alias matches are filled in; everything else is left for review.
 */

const { STANDARDS, ENUMS, DATE_FORMATS } = require('./standards');

const SAMPLE_COUNT = 3;

/** Case-, space-, and punctuation-insensitive key for matching headers and values */
function normalize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** normalized source value -> standard value, per enum */
const ENUM_LOOKUP = Object.fromEntries(
  Object.entries(ENUMS).map(([name, values]) => [
    name,
    new Map(Object.entries(values).flatMap(([target, sources]) => sources.map(s => [normalize(s), target])))
  ])
);

function distinctValues(rows, header) {
  return [...new Set(rows.map(r => r[header]).filter(v => v !== ''))];
}

function isValidDate({ y, m, d }) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Returns every format that parses all values as real calendar dates.
 * @param {string[]} values
 * @returns {string[]}
 */
function detectDateFormats(values) {
  if (values.length === 0) return [];
  return DATE_FORMATS
    .filter(([, regex, parts]) => values.every(v => {
      const match = regex.exec(v);
      return match && isValidDate(parts(match));
    }))
    .map(([label]) => label);
}

/**
 * Maps one standard field from a chosen source column (or none).
 * @param {import('./standards').StandardField} field
 * @param {{ headers: string[], rows: Record<string, string>[] }} dataset
 * @param {string | null} source
 */
function buildField(field, dataset, source) {
  const mapped = {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    source,
    samples: source ? distinctValues(dataset.rows, source).slice(0, SAMPLE_COUNT) : []
  };

  if (field.type === 'enum') {
    mapped.enum = field.enum;
    mapped.values = source
      ? distinctValues(dataset.rows, source).map(value => ({
        source: value,
        target: ENUM_LOOKUP[field.enum].get(normalize(value)) || null
      }))
      : [];
  }

  if (field.type === 'date') {
    const candidates = source ? detectDateFormats(distinctValues(dataset.rows, source)) : [];
    mapped.dateFormatCandidates = candidates;
    mapped.dateFormat = candidates.length === 1 ? candidates[0] : null;
  }

  return mapped;
}

/** Source headers no field uses */
function unusedHeaders(headers, fields) {
  const used = new Set(fields.map(f => f.source).filter(Boolean));
  return headers.filter(h => !used.has(h));
}

/**
 * Maps one dataset's headers and values onto its standard.
 * @param {{ headers: string[], rows: Record<string, string>[] }} dataset
 * @param {{ label: string, fields: import('./standards').StandardField[] }} standard
 */
function mapDataset(dataset, standard) {
  const used = new Set();
  const fields = standard.fields.map(field => {
    const aliases = new Set(field.aliases.map(normalize));
    const source = dataset.headers.find(h => !used.has(h) && aliases.has(normalize(h))) || null;
    if (source) used.add(source);
    return buildField(field, dataset, source);
  });

  return {
    label: standard.label,
    headers: dataset.headers,
    fields,
    unmappedHeaders: unusedHeaders(dataset.headers, fields)
  };
}

/**
 * Builds a draft mapping for every dataset in a customer's data bundle.
 * @param {Record<string, { headers: string[], rows: Record<string, string>[] }>} datasets
 */
function generateMapping(datasets) {
  const missing = Object.keys(STANDARDS).filter(key => !datasets[key]);
  if (missing.length > 0) {
    throw new Error(`Cannot map customer data: missing dataset(s) ${missing.join(', ')}`);
  }

  return {
    status: 'draft',
    generatedAt: new Date().toISOString(),
    approvedAt: null,
    datasets: Object.fromEntries(
      Object.entries(STANDARDS).map(([key, standard]) => [key, mapDataset(datasets[key], standard)])
    )
  };
}

/**
 * Everything a reviewer must resolve before the mapping can be approved.
 * @param {ReturnType<typeof generateMapping>} mapping
 * @returns {{ dataset: string, field: string, message: string }[]}
 */
function listMappingIssues(mapping) {
  const issues = [];
  for (const [dataset, { fields }] of Object.entries(mapping.datasets)) {
    for (const field of fields) {
      if (!field.source) {
        if (field.required) issues.push({ dataset, field: field.key, message: `${field.label} has no source column` });
        continue;
      }
      if (field.type === 'date' && !field.dateFormat) {
        const detail = field.dateFormatCandidates.length > 1
          ? `could be ${field.dateFormatCandidates.join(' or ')}`
          : 'matches no supported format';
        issues.push({ dataset, field: field.key, message: `${field.label} date format ${detail}` });
      }
      if (field.type === 'enum') {
        for (const value of field.values.filter(v => !v.target)) {
          issues.push({ dataset, field: field.key, message: `${field.label} value "${value.source}" is not mapped` });
        }
      }
    }
  }
  return issues;
}

module.exports = { generateMapping, listMappingIssues, detectDateFormats, normalize, buildField, unusedHeaders };
