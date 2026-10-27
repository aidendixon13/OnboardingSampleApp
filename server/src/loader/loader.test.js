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
    const { rows, errors, repairs } = parseCsv('a,b\n1,2\n3,4,5\n');
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(errors, ['Line 3: expected 2 fields, found 3']);
    assert.deepStrictEqual(repairs, []);
  });

  it('rejoins extra fields into the repair column, keeping the original commas', () => {
    const { rows, errors, repairs } = parseCsv(
      'id,note,parent\n1,Electric, gas, water,6000\n2,plain,7000\n',
      { repairColumn: 'note' }
    );
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(rows, [
      { id: '1', note: 'Electric, gas, water', parent: '6000' },
      { id: '2', note: 'plain', parent: '7000' }
    ]);
    assert.deepStrictEqual(repairs, [{ line: 2, column: 'note', value: 'Electric, gas, water', fieldsFound: 5 }]);
  });

  it('repairs a trailing free-text column', () => {
    const { rows, repairs } = parseCsv('id,contact\nX1,Williams, Robert\n', { repairColumn: 'contact' });
    assert.strictEqual(rows[0].contact, 'Williams, Robert');
    assert.strictEqual(repairs.length, 1);
  });

  it('still rejects rows with too few fields, even with a repair column', () => {
    const { errors } = parseCsv('a,b,c\n1,2\n', { repairColumn: 'b' });
    assert.deepStrictEqual(errors, ['Line 2: expected 3 fields, found 2']);
  });

  it('refuses a repair column that is not a header', () => {
    assert.throws(() => parseCsv('a,b\n1,2\n', { repairColumn: 'z' }), /not a header/);
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

  it('loads the Premier sample with nothing repaired', () => {
    assert.deepStrictEqual(loadCustomerBundle(zipSampleFolder('CustomerC_PremierBookkeeping')).repairs, []);
  });

  it('loads the ABC sample, repairing the unquoted commas in one account description', () => {
    const { datasets, repairs } = loadCustomerBundle(zipSampleFolder('CustomerA_ABCAccounting'));
    assert.deepStrictEqual(repairs, [{
      file: 'chart_of_accounts.csv', line: 33, column: 'Description', value: 'Electric, gas, water', fieldsFound: 10
    }]);
    const utilities = datasets.chartOfAccounts.rows.find(r => r['Account Number'] === '6300');
    assert.strictEqual(utilities.Description, 'Electric, gas, water');
    assert.strictEqual(utilities['Parent Account'], '6000');
    assert.strictEqual(datasets.chartOfAccounts.rows.length, 39);
  });

  it('loads the XYZ sample, repairing the "Last, First" contact name on every client row', () => {
    const { datasets, repairs } = loadCustomerBundle(zipSampleFolder('CustomerB_XYZFinancialServices'));
    assert.strictEqual(repairs.length, 12);
    assert.ok(repairs.every(r => r.file === 'clients.csv' && r.column === 'mainContact'));
    assert.strictEqual(datasets.clients.rows[0].mainContact, 'Williams, Robert');
    assert.strictEqual(datasets.clients.rows[0].billingTerms, 'NET30');
  });

  it('rejects extra fields in a file with no free-text column', () => {
    const problems = problemsOf(() => loadCustomerBundle(zipFiles({
      ...MINIMAL,
      'contacts.csv': 'Contact ID,First Name\nCT1,Ann,Extra\n'
    })));
    assert.deepStrictEqual(problems, ['contacts.csv: Line 2: expected 2 fields, found 3']);
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
