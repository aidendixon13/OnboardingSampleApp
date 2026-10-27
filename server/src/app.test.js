const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const AdmZip = require('adm-zip');
const app = require('./app');
const { suggestCustomerName, toTenantSlug } = require('./naming');

const SAMPLE_DATA = path.join(__dirname, '..', '..', 'sample-data');

function sampleZip(folder) {
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(SAMPLE_DATA, folder), folder);
  return zip.toBuffer();
}

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function uploadBundle(buffer, fileName = 'bundle.zip') {
  const form = new FormData();
  form.append('dataBundle', new Blob([buffer], { type: 'application/zip' }), fileName);
  const res = await fetch(`${baseUrl}/api/imports`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}

async function createCustomer(fields) {
  const res = await fetch(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields)
  });
  return { status: res.status, body: await res.json() };
}

const INTAKE = {
  name: 'Premier Bookkeeping',
  industry: 'Accounting',
  region: 'United Kingdom',
  contactEmail: 'ops@premier.example.com',
  plan: 'professional'
};

describe('naming', () => {
  it('suggests a readable name from an export folder name', () => {
    assert.strictEqual(suggestCustomerName('CustomerC_PremierBookkeeping'), 'Premier Bookkeeping');
    assert.strictEqual(suggestCustomerName('CustomerA_ABCAccounting'), 'ABC Accounting');
    assert.strictEqual(suggestCustomerName('acme-export'), 'acme export');
  });

  it('builds a URL-safe tenant slug', () => {
    assert.strictEqual(toTenantSlug('Artisan Bakery & Café'), 'artisan-bakery-and-cafe');
  });

  it('refuses a name with nothing to slug', () => {
    assert.throws(() => toTenantSlug('!!!'), /Cannot build a tenant slug/);
  });
});

describe('POST /api/imports', () => {
  it('stages a valid bundle and suggests a customer name', async () => {
    const { status, body } = await uploadBundle(sampleZip('CustomerC_PremierBookkeeping'));
    assert.strictEqual(status, 201);
    assert.match(body.importId, /^imp_/);
    assert.strictEqual(body.suggestedName, 'Premier Bookkeeping');
    assert.deepStrictEqual(body.rowCounts, { clients: 12, contacts: 20, chartOfAccounts: 39, transactions: 25 });
    assert.ok(body.files.clients.headers.includes('business_name'));
  });

  it('rejects a malformed bundle with its problems', async () => {
    const { status, body } = await uploadBundle(sampleZip('CustomerA_ABCAccounting'));
    assert.strictEqual(status, 400);
    assert.deepStrictEqual(body.problems, ['chart_of_accounts.csv: Line 33: expected 8 fields, found 10']);
  });

  it('requires a file', async () => {
    const res = await fetch(`${baseUrl}/api/imports`, { method: 'POST', body: new FormData() });
    assert.strictEqual(res.status, 400);
  });
});

describe('POST /api/customers', () => {
  it('generates a customer ID and tenant and moves the import onto the customer', async () => {
    const { body: staged } = await uploadBundle(sampleZip('CustomerC_PremierBookkeeping'));
    const { status, body } = await createCustomer({ ...INTAKE, importId: staged.importId });

    assert.strictEqual(status, 201);
    assert.match(body.customer.id, /^cust_/);
    assert.match(body.tenant.id, /^tenant_/);
    assert.strictEqual(body.tenant.customerId, body.customer.id);
    assert.strictEqual(body.tenant.plan, 'professional');
    assert.strictEqual(body.tenant.region, 'United Kingdom');
    assert.strictEqual(body.tenant.status, 'pending');
    assert.match(body.tenant.slug, /^premier-bookkeeping(-\d+)?$/);
    assert.strictEqual(body.data.rowCounts.clients, 12);

    const statuses = Object.fromEntries(body.onboarding.steps.map(s => [s.name, s.status]));
    assert.deepStrictEqual(statuses, {
      'Customer Info': 'completed',
      'Data Mapping': 'in_progress',
      'Tenant Setup': 'in_progress'
    });

    // A draft mapping was generated, with the ambiguous values flagged
    assert.strictEqual(body.mapping.status, 'draft');
    assert.strictEqual(body.mapping.issues.length, 2);
    const fetched = await (await fetch(`${baseUrl}/api/customers/${body.customer.id}/mapping`)).json();
    assert.strictEqual(fetched.datasets.clients.fields.find(f => f.key === 'name').source, 'business_name');

    // The staged import is consumed
    const reuse = await createCustomer({ ...INTAKE, importId: staged.importId });
    assert.strictEqual(reuse.status, 400);
    assert.ok(reuse.body.fields.importId);
  });

  it('gives each tenant a unique slug', async () => {
    const slugs = [];
    for (let i = 0; i < 2; i++) {
      const { body: staged } = await uploadBundle(sampleZip('CustomerC_PremierBookkeeping'));
      const { body } = await createCustomer({ ...INTAKE, name: 'Same Name Ltd', importId: staged.importId });
      slugs.push(body.tenant.slug);
    }
    assert.deepStrictEqual(slugs, ['same-name-ltd', 'same-name-ltd-2']);
  });

  it('stores nothing when intake is invalid', async () => {
    const before = (await (await fetch(`${baseUrl}/api/customers`)).json()).length;
    const { body: staged } = await uploadBundle(sampleZip('CustomerC_PremierBookkeeping'));
    const { status } = await createCustomer({ ...INTAKE, contactEmail: 'nope', importId: staged.importId });
    assert.strictEqual(status, 400);

    const afterCount = (await (await fetch(`${baseUrl}/api/customers`)).json()).length;
    assert.strictEqual(afterCount, before);
    // The import is still available to retry
    assert.strictEqual((await fetch(`${baseUrl}/api/imports/${staged.importId}`)).status, 200);
  });
});

describe('review and approval', () => {
  async function send(method, url, body) {
    const res = await fetch(`${baseUrl}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  }

  async function onboardPremier(name) {
    const { body: staged } = await uploadBundle(sampleZip('CustomerC_PremierBookkeeping'));
    const { body } = await createCustomer({ ...INTAKE, name, importId: staged.importId });
    return body.customer.id;
  }

  it('lists the standard picklists and date formats', async () => {
    const { body } = await send('GET', '/api/standards');
    assert.ok(body.enums.paymentMethod.includes('bank_transfer'));
    assert.ok(body.dateFormats.includes('DD-MM-YYYY'));
  });

  it('refuses to approve a mapping with open items, then approves once they are resolved', async () => {
    const id = await onboardPremier('Review Flow Ltd');

    const early = await send('POST', `/api/customers/${id}/mapping/approve`);
    assert.strictEqual(early.status, 409);
    assert.strictEqual(early.body.issues.length, 2);

    const bad = await send('PATCH', `/api/customers/${id}/mapping/contacts/status`, { values: { Suspended: 'paused' } });
    assert.strictEqual(bad.status, 400);

    await send('PATCH', `/api/customers/${id}/mapping/contacts/status`, { values: { Suspended: 'inactive' } });
    const edited = await send('PATCH', `/api/customers/${id}/mapping/transactions/paymentMethod`, { values: { 'Online Payment': 'bank_transfer' } });
    assert.strictEqual(edited.status, 200);
    assert.deepStrictEqual(edited.body.issues, []);

    const approved = await send('POST', `/api/customers/${id}/mapping/approve`);
    assert.strictEqual(approved.status, 200);
    assert.strictEqual(approved.body.mapping.status, 'approved');
    assert.strictEqual(approved.body.onboarding.steps.find(s => s.name === 'Data Mapping').status, 'completed');
    assert.strictEqual(approved.body.onboarding.progressPercent, 67);

    const locked = await send('PATCH', `/api/customers/${id}/mapping/clients/name`, { source: null });
    assert.strictEqual(locked.status, 409);
  });

  it('edits and approves the tenant, then locks it', async () => {
    const id = await onboardPremier('Tenant Flow Ltd');

    const badSlug = await send('PATCH', `/api/customers/${id}/tenant`, { slug: 'Not Valid!' });
    assert.strictEqual(badSlug.status, 400);
    assert.ok(badSlug.body.fields.slug);

    const edited = await send('PATCH', `/api/customers/${id}/tenant`, { plan: 'enterprise', slug: 'tenant-flow' });
    assert.strictEqual(edited.status, 200);
    assert.strictEqual(edited.body.plan, 'enterprise');
    assert.strictEqual(edited.body.slug, 'tenant-flow');

    const other = await onboardPremier('Other Tenant Ltd');
    const taken = await send('PATCH', `/api/customers/${other}/tenant`, { slug: 'tenant-flow' });
    assert.strictEqual(taken.status, 400);
    assert.match(taken.body.fields.slug, /already used/);

    const approved = await send('POST', `/api/customers/${id}/tenant/approve`);
    assert.strictEqual(approved.status, 200);
    assert.strictEqual(approved.body.tenant.status, 'approved');
    assert.strictEqual(approved.body.onboarding.steps.find(s => s.name === 'Tenant Setup').status, 'completed');

    assert.strictEqual((await send('PATCH', `/api/customers/${id}/tenant`, { plan: 'starter' })).status, 409);
    assert.strictEqual((await send('POST', `/api/customers/${id}/tenant/approve`)).status, 409);
  });

  it('returns 404 for an unknown customer', async () => {
    assert.strictEqual((await send('POST', '/api/customers/cust_nope/mapping/approve')).status, 404);
    assert.strictEqual((await send('POST', '/api/customers/cust_nope/tenant/approve')).status, 404);
  });
});
