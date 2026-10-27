const { test } = require('node:test');
const assert = require('node:assert');
const { validateCustomerInput } = require('./validation');

const valid = {
  name: ' ABC Accounting ',
  industry: 'Accounting',
  region: 'North America',
  contactEmail: 'ops@abc.example.com',
  plan: 'professional',
  importId: 'imp_123'
};

test('accepts a complete payload and trims values', () => {
  const { errors, value } = validateCustomerInput(valid);
  assert.deepStrictEqual(errors, {});
  assert.strictEqual(value.name, 'ABC Accounting');
});

test('reports every missing field', () => {
  const { errors } = validateCustomerInput({});
  assert.deepStrictEqual(Object.keys(errors).sort(), ['contactEmail', 'importId', 'industry', 'name', 'plan', 'region']);
});

test('rejects blank and non-string values', () => {
  const { errors } = validateCustomerInput({ ...valid, name: '   ', region: 5 });
  assert.ok(errors.name);
  assert.ok(errors.region);
});

test('rejects a malformed email', () => {
  const { errors } = validateCustomerInput({ ...valid, contactEmail: 'not-an-email' });
  assert.ok(errors.contactEmail);
});

test('rejects a non-object body', () => {
  const { errors } = validateCustomerInput(null);
  assert.strictEqual(Object.keys(errors).length, 6);
});

test('rejects an unknown plan', () => {
  const { errors } = validateCustomerInput({ ...valid, plan: 'gold' });
  assert.match(errors.plan, /starter, professional, enterprise/);
});

test('rejects a name with no letters or digits', () => {
  const { errors } = validateCustomerInput({ ...valid, name: '!!!' });
  assert.ok(errors.name);
});
