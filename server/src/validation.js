/**
 * Validation for customer intake
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REQUIRED_FIELDS = [
  { key: 'name', label: 'Customer name' },
  { key: 'industry', label: 'Industry' },
  { key: 'region', label: 'Region' },
  { key: 'contactEmail', label: 'Contact email' }
];

/**
 * Validates a customer intake payload.
 * @param {unknown} body
 * @returns {{ errors: Record<string, string>, value: Record<string, string> }}
 */
function validateCustomerInput(body) {
  const errors = {};
  const value = {};
  const input = body && typeof body === 'object' ? body : {};

  for (const { key, label } of REQUIRED_FIELDS) {
    const raw = input[key];
    if (typeof raw !== 'string' || raw.trim() === '') {
      errors[key] = `${label} is required`;
      continue;
    }
    value[key] = raw.trim();
  }

  if (value.contactEmail && !EMAIL_PATTERN.test(value.contactEmail)) {
    errors.contactEmail = 'Contact email must be a valid email address';
  }

  return { errors, value };
}

module.exports = { validateCustomerInput };
