/**
 * Validation for customer intake
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLANS = ['starter', 'professional', 'enterprise'];

const REQUIRED_FIELDS = [
  { key: 'name', label: 'Customer name' },
  { key: 'industry', label: 'Industry' },
  { key: 'region', label: 'Region' },
  { key: 'contactEmail', label: 'Contact email' },
  { key: 'plan', label: 'Plan' },
  { key: 'importId', label: 'Customer data import' }
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

  // The tenant slug is built from the name, so it needs at least one letter or digit
  if (value.name && !/[a-z0-9]/i.test(value.name.normalize('NFKD'))) {
    errors.name = 'Customer name must contain a letter or number';
  }

  if (value.plan && !PLANS.includes(value.plan)) {
    errors.plan = `Plan must be one of: ${PLANS.join(', ')}`;
  }

  if (value.contactEmail && !EMAIL_PATTERN.test(value.contactEmail)) {
    errors.contactEmail = 'Contact email must be a valid email address';
  }

  return { errors, value };
}

module.exports = { validateCustomerInput, PLANS };
