/**
 * Reviewer edits and approval for a customer's data mapping.
 * Every edit is checked against the standards and the customer's actual data.
 */

const { STANDARDS, ENUMS, DATE_FORMATS } = require('./standards');
const { buildField, unusedHeaders, detectDateFormats, listMappingIssues } = require('./generateMapping');

class MappingEditError extends Error {
  /**
   * @param {string} message
   * @param {number} [status] - HTTP status the route should answer with
   */
  constructor(message, status = 400) {
    super(message);
    this.name = 'MappingEditError';
    this.status = status;
  }
}

const DATE_FORMAT_LABELS = DATE_FORMATS.map(([label]) => label);

/**
 * Applies one reviewer edit to a field and returns the updated mapping (the input is not changed).
 * An edit may set any of:
 *  - source: a header from the customer's file, or null to leave the field unmapped
 *  - dateFormat: for date fields, a format every value in the column parses with
 *  - values: for enum fields, { sourceValue: standardValue | null }
 * @param {object} mapping
 * @param {Record<string, { headers: string[], rows: Record<string, string>[] }>} datasets
 * @param {string} datasetKey
 * @param {string} fieldKey
 * @param {{ source?: string | null, dateFormat?: string, values?: Record<string, string | null> }} edit
 */
function applyFieldEdit(mapping, datasets, datasetKey, fieldKey, edit) {
  if (mapping.status === 'approved') {
    throw new MappingEditError('Mapping is approved and can no longer be edited', 409);
  }

  const standard = STANDARDS[datasetKey];
  const dataset = datasets[datasetKey];
  const current = mapping.datasets[datasetKey];
  if (!standard || !dataset || !current) {
    throw new MappingEditError(`Unknown dataset "${datasetKey}"`, 404);
  }
  const standardField = standard.fields.find(f => f.key === fieldKey);
  const index = current.fields.findIndex(f => f.key === fieldKey);
  if (!standardField || index === -1) {
    throw new MappingEditError(`Unknown field "${fieldKey}" in ${standard.label}`, 404);
  }
  if (!edit || typeof edit !== 'object' || Object.keys(edit).length === 0) {
    throw new MappingEditError('Edit must set source, dateFormat, or values');
  }
  const unknownKeys = Object.keys(edit).filter(k => !['source', 'dateFormat', 'values'].includes(k));
  if (unknownKeys.length > 0) {
    throw new MappingEditError(`Unknown edit property: ${unknownKeys.join(', ')}`);
  }

  let field = current.fields[index];

  if ('source' in edit) {
    const { source } = edit;
    if (source !== null && !dataset.headers.includes(source)) {
      throw new MappingEditError(`"${source}" is not a column in ${dataset.file}`);
    }
    const takenBy = source && current.fields.find(f => f.key !== fieldKey && f.source === source);
    if (takenBy) {
      throw new MappingEditError(`"${source}" is already mapped to ${takenBy.label}`);
    }
    field = buildField(standardField, dataset, source);
  }

  if ('dateFormat' in edit) {
    if (field.type !== 'date') {
      throw new MappingEditError(`${field.label} is not a date field`);
    }
    if (!field.source) {
      throw new MappingEditError(`Choose a source column for ${field.label} first`);
    }
    if (!DATE_FORMAT_LABELS.includes(edit.dateFormat)) {
      throw new MappingEditError(`Date format must be one of: ${DATE_FORMAT_LABELS.join(', ')}`);
    }
    const values = [...new Set(dataset.rows.map(r => r[field.source]).filter(v => v !== ''))];
    if (!detectDateFormats(values).includes(edit.dateFormat)) {
      throw new MappingEditError(`Some ${field.label} values are not valid ${edit.dateFormat} dates`);
    }
    field = { ...field, dateFormat: edit.dateFormat };
  }

  if ('values' in edit) {
    if (field.type !== 'enum') {
      throw new MappingEditError(`${field.label} is not a picklist field`);
    }
    if (!edit.values || typeof edit.values !== 'object') {
      throw new MappingEditError('values must be an object of { sourceValue: standardValue }');
    }
    const allowed = Object.keys(ENUMS[field.enum]);
    const known = new Set(field.values.map(v => v.source));
    for (const [sourceValue, target] of Object.entries(edit.values)) {
      if (!known.has(sourceValue)) {
        throw new MappingEditError(`"${sourceValue}" does not appear in ${field.label}`);
      }
      if (target !== null && !allowed.includes(target)) {
        throw new MappingEditError(`${field.label} must map to one of: ${allowed.join(', ')}`);
      }
    }
    field = {
      ...field,
      values: field.values.map(v => (v.source in edit.values ? { ...v, target: edit.values[v.source] } : v))
    };
  }

  const fields = current.fields.map((f, i) => (i === index ? field : f));
  return {
    ...mapping,
    datasets: {
      ...mapping.datasets,
      [datasetKey]: { ...current, fields, unmappedHeaders: unusedHeaders(current.headers, fields) }
    }
  };
}

/**
 * Approves a mapping once nothing needs review.
 * @param {object} mapping
 */
function approveMapping(mapping) {
  if (mapping.status === 'approved') {
    throw new MappingEditError('Mapping is already approved', 409);
  }
  const issues = listMappingIssues(mapping);
  if (issues.length > 0) {
    const error = new MappingEditError(`${issues.length} item(s) still need review`, 409);
    error.issues = issues;
    throw error;
  }
  return { ...mapping, status: 'approved', approvedAt: new Date().toISOString() };
}

module.exports = { applyFieldEdit, approveMapping, MappingEditError, DATE_FORMAT_LABELS };
