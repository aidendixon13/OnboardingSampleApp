const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const AdmZip = require('adm-zip');
const { loadCustomerBundle } = require('../loader/customerBundle');
const { generateMapping, listMappingIssues, detectDateFormats } = require('./generateMapping');

const SAMPLE_DATA = path.join(__dirname, '..', '..', '..', 'sample-data');

function loadSample(folder) {
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(SAMPLE_DATA, folder), folder);
  return loadCustomerBundle(zip.toBuffer()).datasets;
}

function field(mapping, dataset, key) {
  return mapping.datasets[dataset].fields.find(f => f.key === key);
}

describe('detectDateFormats', () => {
  it('resolves day/month order once a value rules one out', () => {
    assert.deepStrictEqual(detectDateFormats(['01/15/2024', '02/03/2024']), ['MM/DD/YYYY']);
    assert.deepStrictEqual(detectDateFormats(['15-01-2024']), ['DD-MM-YYYY']);
    assert.deepStrictEqual(detectDateFormats(['2024-01-15']), ['YYYY-MM-DD']);
  });

  it('reports every candidate when the values are ambiguous', () => {
    assert.deepStrictEqual(detectDateFormats(['01/02/2024']), ['MM/DD/YYYY', 'DD/MM/YYYY']);
  });

  it('rejects impossible dates', () => {
    assert.deepStrictEqual(detectDateFormats(['2024-02-30']), []);
  });
});

describe('generateMapping on Premier Bookkeeping', () => {
  const mapping = generateMapping(loadSample('CustomerC_PremierBookkeeping'));

  it('maps every snake_case header to its standard field', () => {
    for (const { fields, unmappedHeaders } of Object.values(mapping.datasets)) {
      assert.deepStrictEqual(unmappedHeaders, []);
      assert.ok(fields.every(f => f.source), `unmapped: ${fields.filter(f => !f.source).map(f => f.key)}`);
    }
    assert.strictEqual(field(mapping, 'clients', 'name').source, 'business_name');
    assert.strictEqual(field(mapping, 'transactions', 'amount').source, 'amount_gbp');
  });

  it('detects DD-MM-YYYY dates', () => {
    assert.strictEqual(field(mapping, 'clients', 'startDate').dateFormat, 'DD-MM-YYYY');
    assert.strictEqual(field(mapping, 'transactions', 'date').dateFormat, 'DD-MM-YYYY');
  });

  it('maps UK picklist values to the standard', () => {
    const status = field(mapping, 'clients', 'status').values;
    assert.deepStrictEqual(
      Object.fromEntries(status.map(v => [v.source, v.target])),
      { ACTIVE: 'active', DORMANT: 'inactive', SUSPENDED: 'pending' }
    );
    const types = Object.fromEntries(field(mapping, 'chartOfAccounts', 'accountType').values.map(v => [v.source, v.target]));
    assert.strictEqual(types.Capital, 'equity');
    assert.strictEqual(types.Overheads, 'expense');
  });

  it('leaves ambiguous values for review instead of guessing', () => {
    const issues = listMappingIssues(mapping);
    assert.deepStrictEqual(issues, [
      { dataset: 'contacts', field: 'status', message: 'Status value "Suspended" is not mapped' },
      { dataset: 'transactions', field: 'paymentMethod', message: 'Payment method value "Online Payment" is not mapped' }
    ]);
  });

  it('starts as a draft', () => {
    assert.strictEqual(mapping.status, 'draft');
    assert.strictEqual(mapping.approvedAt, null);
  });
});

describe('generateMapping on other schemas', () => {
  it('maps Title Case headers and MM/DD/YYYY dates', () => {
    const datasets = {
      clients: { headers: ['Client ID', 'Client Name', 'Date Onboarded'], rows: [{ 'Client ID': 'C1', 'Client Name': 'A', 'Date Onboarded': '01/15/2023' }] },
      contacts: { headers: [], rows: [] },
      chartOfAccounts: { headers: [], rows: [] },
      transactions: { headers: [], rows: [] }
    };
    const mapping = generateMapping(datasets);
    assert.strictEqual(field(mapping, 'clients', 'clientId').source, 'Client ID');
    assert.strictEqual(field(mapping, 'clients', 'startDate').dateFormat, 'MM/DD/YYYY');
  });

  it('reports unmapped required fields and unknown headers', () => {
    const datasets = {
      clients: { headers: ['Mystery'], rows: [{ Mystery: 'x' }] },
      contacts: { headers: [], rows: [] },
      chartOfAccounts: { headers: [], rows: [] },
      transactions: { headers: [], rows: [] }
    };
    const mapping = generateMapping(datasets);
    assert.deepStrictEqual(mapping.datasets.clients.unmappedHeaders, ['Mystery']);
    assert.ok(listMappingIssues(mapping).some(i => i.message === 'Client ID has no source column'));
  });

  it('refuses a bundle missing a dataset', () => {
    assert.throws(() => generateMapping({ clients: { headers: [], rows: [] } }), /missing dataset/);
  });
});
