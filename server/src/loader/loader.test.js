const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const AdmZip = require('adm-zip');
const { parseCsv } = require('./csv');
const { loadCustomerBundle, BundleError } = require('./customerBundle');

const SAMPLE_DATA = path.join(__dirname, '..', '..', '..', 'sample-data');

/** Zips a sample-data customer folder the way Windows "Send to > Compressed folder" does. */
function zipSampleFolder(folder) {
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(SAMPLE_DATA, folder), folder);
  return zip.toBuffer();
}

function zipFiles(files) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

function problemsOf(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof BundleError, `expected BundleError, got ${err}`);
    return err.problems;
  }
  assert.fail('expected loadCustomerBundle to throw');
}

const MINIMAL = {
  'clients.csv': 'id,name\n1,A\n',
  'contacts.csv': 'id,name\n1,B\n',
  'chart_of_accounts.csv': 'id,name\n1,C\n',
  'transactions.csv': 'id,name\n1,D\n'
};

describe('parseCsv', () => {
  it('parses headers and rows, handling CRLF and a BOM', () => {
    const { headers, rows, errors } = parseCsv('﻿a,b\r\n1,2\r\n3,4\r\n');
    assert.deepStrictEqual(headers, ['a', 'b']);
    assert.deepStrictEqual(rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
    assert.deepStrictEqual(errors, []);
  });

  it('keeps commas, quotes, and newlines inside quoted fields', () => {
    const { rows, errors } = parseCsv('name,note\n"Williams, Robert","said ""hi""\nthen left"\n');
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(rows, [{ name: 'Williams, Robert', note: 'said "hi"\nthen left' }]);
  });

  it('reports rows with the wrong field count by line number instead of guessing', () => {
    const { rows, errors } = parseCsv('a,b\n1,2\n3,4,5\n');
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(errors, ['Line 3: expected 2 fields, found 3']);
  });

  it('reports duplicate and blank headers', () => {
    const { errors } = parseCsv('a,a,\n1,2,3\n');
    assert.ok(errors.some(e => e.includes('Duplicate header')));
    assert.ok(errors.some(e => e.includes('blank')));
  });

  it('throws on an unterminated quote', () => {
    assert.throws(() => parseCsv('a\n"open\n'), /Unterminated/);
  });
});

describe('loadCustomerBundle', () => {
  it('loads the Premier Bookkeeping sample folder', () => {
    const { sourceName, datasets } = loadCustomerBundle(zipSampleFolder('CustomerC_PremierBookkeeping'));
    assert.strictEqual(sourceName, 'CustomerC_PremierBookkeeping');
    assert.strictEqual(datasets.clients.rows.length, 12);
    assert.strictEqual(datasets.clients.rows[0].business_name, 'Artisan Bakery & Cafe');
    assert.strictEqual(datasets.contacts.rows.length, 20);
    assert.strictEqual(datasets.chartOfAccounts.rows.length, 39);
    assert.strictEqual(datasets.transactions.rows.length, 25);
  });

  it('rejects the ABC sample: an unquoted comma in a chart of accounts description', () => {
    const problems = problemsOf(() => loadCustomerBundle(zipSampleFolder('CustomerA_ABCAccounting')));
    assert.deepStrictEqual(problems, ['chart_of_accounts.csv: Line 33: expected 8 fields, found 10']);
  });

  it('rejects the XYZ sample: unquoted "Last, First" contact names on every client row', () => {
    const problems = problemsOf(() => loadCustomerBundle(zipSampleFolder('CustomerB_XYZFinancialServices')));
    assert.strictEqual(problems.length, 12);
    assert.ok(problems.every(p => p.startsWith('clients.csv: Line ')));
  });

  it('accepts files at the zip root and names the source after the upload', () => {
    const { sourceName } = loadCustomerBundle(zipFiles(MINIMAL), 'acme-export.zip');
    assert.strictEqual(sourceName, 'acme-export');
  });

  it('matches dataset file names case-insensitively', () => {
    const { 'clients.csv': clients, ...rest } = MINIMAL;
    const { datasets } = loadCustomerBundle(zipFiles({ ...rest, 'Clients.CSV': clients }));
    assert.strictEqual(datasets.clients.rows.length, 1);
  });

  it('ignores OS metadata files', () => {
    const { datasets } = loadCustomerBundle(zipFiles({ ...MINIMAL, '__MACOSX/._clients.csv': 'x', '.DS_Store': 'x' }));
    assert.ok(datasets.transactions);
  });

  it('reports every missing and unexpected file together', () => {
    const problems = problemsOf(() => loadCustomerBundle(zipFiles({ 'clients.csv': 'id\n1\n', 'notes.txt': 'hi' })));
    assert.deepStrictEqual(problems, [
      'Unexpected file(s): notes.txt',
      'Missing contacts.csv',
      'Missing chart_of_accounts.csv',
      'Missing transactions.csv'
    ]);
  });

  it('rejects more than one top-level folder', () => {
    const problems = problemsOf(() => loadCustomerBundle(zipFiles({ 'a/clients.csv': 'id\n1\n', 'b/clients.csv': 'id\n1\n' })));
    assert.match(problems[0], /one customer folder/);
  });

  it('rejects a file that is not a zip', () => {
    const problems = problemsOf(() => loadCustomerBundle(Buffer.from('not a zip')));
    assert.match(problems[0], /not a readable zip/);
  });

  it('rejects an empty zip', () => {
    const problems = problemsOf(() => loadCustomerBundle(new AdmZip().toBuffer()));
    assert.deepStrictEqual(problems, ['Zip is empty']);
  });
});
