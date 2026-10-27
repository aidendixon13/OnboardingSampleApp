const { test } = require('node:test');
const assert = require('node:assert');
const { validateCustomerInput } = require('./validation');

const valid = {
  name: ' ABC Accounting ',
  industry: 'Accounting',
  region: 'North America',
  contactEmail: 'ops@abc.example.com'
};

test('accepts a complete payload and trims values', () => {
  const { errors, value } = validateCustomerInput(valid);
  assert.deepStrictEqual(errors, {});
  assert.strictEqual(value.name, 'ABC Accounting');
});

test('reports every missing field', () => {
  const { errors } = validateCustomerInput({});
  assert.deepStrictEqual(Object.keys(errors).sort(), ['contactEmail', 'industry', 'name', 'region']);
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
  assert.strictEqual(Object.keys(errors).length, 4);
});
