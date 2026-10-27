const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const store = require('./data/store');
const { createCustomer, createTenant, createDefaultOnboardingSteps, calculateProgress } = require('./models');
const { validateCustomerInput } = require('./validation');
const { loadCustomerBundle, BundleError } = require('./loader/customerBundle');
const { suggestCustomerName, toTenantSlug } = require('./naming');

const app = express();
const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BUNDLE_BYTES, files: 1 } });

/**
 * Row counts and headers per dataset, for views that should not ship every row
 * @param {{ sourceName: string, loadedAt: string, datasets: Record<string, { file: string, headers: string[], rows: object[] }> } | undefined} data
 */
function summarizeData(data) {
  if (!data) return null;
  return {
    sourceName: data.sourceName,
    loadedAt: data.loadedAt,
    rowCounts: Object.fromEntries(Object.entries(data.datasets).map(([key, d]) => [key, d.rows.length])),
    files: Object.fromEntries(Object.entries(data.datasets).map(([key, d]) => [key, { file: d.file, headers: d.headers }]))
  };
}

function summarizeImport(staged) {
  return {
    importId: staged.id,
    suggestedName: suggestCustomerName(staged.sourceName),
    ...summarizeData(staged)
  };
}

/** Picks a tenant slug from the customer name that no existing tenant uses. */
function uniqueTenantSlug(name) {
  const base = toTenantSlug(name);
  const taken = new Set(store.getTenants().map(t => t.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Stage a zipped customer data folder. Nothing is attached to a customer until intake is submitted.
app.post('/api/imports', upload.single('dataBundle'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Customer data zip is required', problems: ['Choose a .zip file to upload'] });
  }

  let bundle;
  try {
    bundle = loadCustomerBundle(req.file.buffer, req.file.originalname);
  } catch (err) {
    if (!(err instanceof BundleError)) throw err;
    return res.status(400).json({ error: err.message, problems: err.problems });
  }

  const staged = store.addImport({
    id: `imp_${crypto.randomUUID()}`,
    ...bundle,
    loadedAt: new Date().toISOString()
  });
  res.status(201).json(summarizeImport(staged));
});

// Get a staged import's summary
app.get('/api/imports/:id', (req, res) => {
  const staged = store.getImport(req.params.id);
  if (!staged) {
    return res.status(404).json({ error: 'Import not found' });
  }
  res.json(summarizeImport(staged));
});

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(store.getCustomers());
});

// Create a customer from intake fields and a staged import: generates the customer ID and tenant,
// and moves the import's data onto the customer. Everything is validated before anything is stored.
app.post('/api/customers', (req, res) => {
  const { errors, value } = validateCustomerInput(req.body);
  const staged = value.importId && store.getImport(value.importId);
  if (value.importId && !staged) {
    errors.importId = 'Import not found. Upload the customer data again.';
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Invalid customer data', fields: errors });
  }

  const { importId, plan, ...customerFields } = value;
  const customer = store.addCustomer(createCustomer({ ...customerFields, id: `cust_${crypto.randomUUID()}` }));
  const tenant = store.addTenant(createTenant({
    id: `tenant_${crypto.randomUUID()}`,
    customerId: customer.id,
    slug: uniqueTenantSlug(customer.name),
    region: customer.region,
    status: 'pending',
    plan
  }));

  const { id: _stagedId, ...data } = staged;
  store.setCustomerData(customer.id, data);
  store.deleteImport(importId);

  // Customer Info is done; the generated tenant waits for review
  const steps = createDefaultOnboardingSteps().map(step => {
    if (step.name === 'Customer Info') return { ...step, status: 'completed' };
    if (step.name === 'Tenant Setup') return { ...step, status: 'in_progress' };
    return step;
  });
  const state = store.addOnboardingState({
    customerId: customer.id,
    steps,
    progressPercent: calculateProgress(steps)
  });

  res.status(201).json({ customer, tenant, onboarding: state, data: summarizeData(data) });
});

// Get the loaded data bundle for a customer (source for mapping, tenant setup, and import)
app.get('/api/customers/:id/data', (req, res) => {
  const data = store.getCustomerData(req.params.id);
  if (!data) {
    return res.status(404).json({ error: 'Customer data not found' });
  }
  res.json(data);
});

// Get customer by ID
app.get('/api/customers/:id', (req, res) => {
  const customer = store.getCustomerById(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

// Get onboarding state for a customer
app.get('/api/customers/:id/onboarding', (req, res) => {
  const state = store.getOnboardingState(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Onboarding state not found' });
  }
  res.json(state);
});

// Get all onboarding states (dashboard view)
app.get('/api/onboarding', (req, res) => {
  const states = store.getAllOnboardingStates();
  const customers = store.getCustomers();

  // Join customer info with onboarding state
  const dashboard = states.map(state => {
    const customer = customers.find(c => c.id === state.customerId);
    return {
      ...state,
      customerName: customer?.name || 'Unknown',
      customerIndustry: customer?.industry || '',
      customerRegion: customer?.region || '',
      tenant: store.getTenantByCustomerId(state.customerId) || null,
      data: summarizeData(store.getCustomerData(state.customerId))
    };
  });

  res.json(dashboard);
});

// Get tenant by customer ID
app.get('/api/tenants/:customerId', (req, res) => {
  const tenant = store.getTenantByCustomerId(req.params.customerId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  res.json(tenant);
});

// Upload errors (oversized file, wrong field name) are client errors; anything else is a real failure
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `Customer data zip must be under ${MAX_BUNDLE_BYTES / (1024 * 1024)} MB`
      : `Upload failed: ${err.message}`;
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message, problems: [message] });
  }
  next(err);
});

module.exports = app;
