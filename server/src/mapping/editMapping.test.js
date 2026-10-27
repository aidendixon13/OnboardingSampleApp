const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const AdmZip = require('adm-zip');
const { loadCustomerBundle } = require('../loader/customerBundle');
const { generateMapping, listMappingIssues } = require('./generateMapping');
const { applyFieldEdit, approveMapping, MappingEditError } = require('./editMapping');

function loadPremier() {
  const zip = new AdmZip();
  const folder = 'CustomerC_PremierBookkeeping';
  zip.addLocalFolder(path.join(__dirname, '..', '..', '..', 'sample-data', folder), folder);
  return loadCustomerBundle(zip.toBuffer()).datasets;
}

const datasets = loadPremier();
const field = (mapping, dataset, key) => mapping.datasets[dataset].fields.find(f => f.key === key);

function rejects(fn, pattern, status = 400) {
  assert.throws(fn, err => err instanceof MappingEditError && pattern.test(err.message) && err.status === status);
}

/** Resolves the two review items in the Premier sample */
function resolvePremier(mapping) {
  let m = applyFieldEdit(mapping, datasets, 'contacts', 'status', { values: { Suspended: 'inactive' } });
  m = applyFieldEdit(m, datasets, 'transactions', 'paymentMethod', { values: { 'Online Payment': 'bank_transfer' } });
  return m;
}

describe('applyFieldEdit', () => {
  it('maps an unmapped picklist value and clears the issue', () => {
    const mapping = generateMapping(datasets);
    const edited = applyFieldEdit(mapping, datasets, 'contacts', 'status', { values: { Suspended: 'inactive' } });
    assert.strictEqual(field(edited, 'contacts', 'status').values.find(v => v.source === 'Suspended').target, 'inactive');
    assert.strictEqual(listMappingIssues(edited).length, 1);
    // The original is unchanged
    assert.strictEqual(listMappingIssues(mapping).length, 2);
  });

  it('re-points a field to another column and recomputes its values', () => {
    const mapping = generateMapping(datasets);
    let edited = applyFieldEdit(mapping, datasets, 'clients', 'industry', { source: null });
    assert.ok(edited.datasets.clients.unmappedHeaders.includes('industry_sector'));
    edited = applyFieldEdit(edited, datasets, 'clients', 'industry', { source: 'industry_sector' });
    assert.deepStrictEqual(edited.datasets.clients.unmappedHeaders, []);
    assert.ok(field(edited, 'clients', 'industry').samples.length > 0);
  });

  it('flags a required field left without a column', () => {
    const edited = applyFieldEdit(generateMapping(datasets), datasets, 'clients', 'name', { source: null });
    assert.ok(listMappingIssues(edited).some(i => i.message === 'Name has no source column'));
  });

  it('rejects a column that is not in the file or is already used', () => {
    const mapping = generateMapping(datasets);
    rejects(() => applyFieldEdit(mapping, datasets, 'clients', 'name', { source: 'nope' }), /not a column/);
    rejects(() => applyFieldEdit(mapping, datasets, 'clients', 'name', { source: 'customer_id' }), /already mapped to Client ID/);
  });

  it('only accepts a date format every value parses with', () => {
    const mapping = generateMapping(datasets);
    rejects(() => applyFieldEdit(mapping, datasets, 'clients', 'startDate', { dateFormat: 'MM-DD-YYYY' }), /not valid MM-DD-YYYY/);
    rejects(() => applyFieldEdit(mapping, datasets, 'clients', 'startDate', { dateFormat: 'YYYY/MM' }), /must be one of/);
    const edited = applyFieldEdit(mapping, datasets, 'clients', 'startDate', { dateFormat: 'DD-MM-YYYY' });
    assert.strictEqual(field(edited, 'clients', 'startDate').dateFormat, 'DD-MM-YYYY');
  });

  it('rejects values outside the standard or the data', () => {
    const mapping = generateMapping(datasets);
    rejects(() => applyFieldEdit(mapping, datasets, 'contacts', 'status', { values: { Suspended: 'paused' } }), /must map to one of/);
    rejects(() => applyFieldEdit(mapping, datasets, 'contacts', 'status', { values: { Ghost: 'active' } }), /does not appear/);
    rejects(() => applyFieldEdit(mapping, datasets, 'clients', 'name', { values: {} }), /not a picklist/);
  });

  it('rejects unknown datasets, fields, and edit shapes', () => {
    const mapping = generateMapping(datasets);
    rejects(() => applyFieldEdit(mapping, datasets, 'invoices', 'x', { source: null }), /Unknown dataset/, 404);
    rejects(() => applyFieldEdit(mapping, datasets, 'clients', 'x', { source: null }), /Unknown field/, 404);
    rejects(() => applyFieldEdit(mapping, datasets, 'clients', 'name', {}), /must set/);
    rejects(() => applyFieldEdit(mapping, datasets, 'clients', 'name', { label: 'x' }), /Unknown edit property/);
  });
});

describe('approveMapping', () => {
  it('refuses while items need review, listing them', () => {
    assert.throws(
      () => approveMapping(generateMapping(datasets)),
      err => err.status === 409 && err.issues.length === 2
    );
  });

  it('approves once everything is resolved, then locks the mapping', () => {
    const approved = approveMapping(resolvePremier(generateMapping(datasets)));
    assert.strictEqual(approved.status, 'approved');
    assert.ok(approved.approvedAt);
    rejects(() => applyFieldEdit(approved, datasets, 'clients', 'name', { source: null }), /can no longer be edited/, 409);
    rejects(() => approveMapping(approved), /already approved/, 409);
  });
});
