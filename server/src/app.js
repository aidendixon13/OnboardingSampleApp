const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const store = require('./data/store');
const { createCustomer, createTenant, createDefaultOnboardingSteps, calculateProgress } = require('./models');
const { validateCustomerInput, validateTenantEdit } = require('./validation');
const { loadCustomerBundle, BundleError } = require('./loader/customerBundle');
const { suggestCustomerName, toTenantSlug } = require('./naming');
const { generateMapping, listMappingIssues } = require('./mapping/generateMapping');
const { ENUMS } = require('./mapping/standards');
const { applyFieldEdit, approveMapping, MappingEditError, DATE_FORMAT_LABELS } = require('./mapping/editMapping');

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
    files: Object.fromEntries(Object.entries(data.datasets).map(([key, d]) => [key, { file: d.file, headers: d.headers }])),
    // Rows the loader rejoined, so a reviewer can check them
    repairs: data.repairs
  };
}

/** Sets one onboarding step's status and recalculates progress. */
function setStepStatus(customerId, stepName, status) {
  const state = store.getOnboardingState(customerId);
  if (!state) throw new Error(`No onboarding state for customer ${customerId}`);
  const steps = state.steps.map(step => (step.name === stepName ? { ...step, status } : step));
  return store.updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });
}

function sendMappingError(res, err) {
  if (!(err instanceof MappingEditError)) throw err;
  return res.status(err.status).json({ error: err.message, ...(err.issues && { issues: err.issues }) });
}

function mappingSummary(mapping) {
  if (!mapping) return null;
  return { status: mapping.status, issueCount: listMappingIssues(mapping).length };
}

function withIssues(mapping) {
  return { ...mapping, issues: listMappingIssues(mapping) };
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

// Standard picklist values and date formats, for choosing mapping targets during review
app.get('/api/standards', (req, res) => {
  res.json({
    enums: Object.fromEntries(Object.entries(ENUMS).map(([name, values]) => [name, Object.keys(values)])),
    dateFormats: DATE_FORMAT_LABELS
  });
});

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(store.getCustomers());
});

// Create a customer from intake fields and a staged import: generates the customer ID, tenant,
// and a draft data mapping, and moves the import's data onto the customer.
// Everything is validated and generated before anything is stored.
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
  const { id: _stagedId, ...data } = staged;
  const mapping = generateMapping(data.datasets);

  const customer = store.addCustomer(createCustomer({ ...customerFields, id: `cust_${crypto.randomUUID()}` }));
  const tenant = store.addTenant(createTenant({
    id: `tenant_${crypto.randomUUID()}`,
    customerId: customer.id,
    slug: uniqueTenantSlug(customer.name),
    region: customer.region,
    status: 'pending',
    plan
  }));

  store.setCustomerData(customer.id, data);
  store.setMapping(customer.id, mapping);
  store.deleteImport(importId);

  // Customer Info is done; the generated mapping and tenant wait for review
  const steps = createDefaultOnboardingSteps().map(step => {
    if (step.name === 'Customer Info') return { ...step, status: 'completed' };
    if (step.name === 'Data Mapping' || step.name === 'Tenant Setup') return { ...step, status: 'in_progress' };
    return step;
  });
  const state = store.addOnboardingState({
    customerId: customer.id,
    steps,
    progressPercent: calculateProgress(steps)
  });

  res.status(201).json({ customer, tenant, onboarding: state, data: summarizeData(data), mapping: withIssues(mapping) });
});

// Get a customer's data mapping, with what still needs review
app.get('/api/customers/:id/mapping', (req, res) => {
  const mapping = store.getMapping(req.params.id);
  if (!mapping) {
    return res.status(404).json({ error: 'Mapping not found' });
  }
  res.json(withIssues(mapping));
});

// Apply one reviewer edit to a mapped field
app.patch('/api/customers/:id/mapping/:dataset/:field', (req, res) => {
  const mapping = store.getMapping(req.params.id);
  const data = store.getCustomerData(req.params.id);
  if (!mapping || !data) {
    return res.status(404).json({ error: 'Mapping not found' });
  }
  try {
    const edited = applyFieldEdit(mapping, data.datasets, req.params.dataset, req.params.field, req.body);
    res.json(withIssues(store.setMapping(req.params.id, edited)));
  } catch (err) {
    sendMappingError(res, err);
  }
});

// Approve the mapping once nothing needs review; completes the Data Mapping step
app.post('/api/customers/:id/mapping/approve', (req, res) => {
  const mapping = store.getMapping(req.params.id);
  if (!mapping) {
    return res.status(404).json({ error: 'Mapping not found' });
  }
  let approved;
  try {
    approved = approveMapping(mapping);
  } catch (err) {
    return sendMappingError(res, err);
  }
  store.setMapping(req.params.id, approved);
  const onboarding = setStepStatus(req.params.id, 'Data Mapping', 'completed');
  res.json({ mapping: withIssues(approved), onboarding });
});

// Edit the generated tenant's plan or slug before it is approved
app.patch('/api/customers/:id/tenant', (req, res) => {
  const tenant = store.getTenantByCustomerId(req.params.id);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  if (tenant.status !== 'pending') {
    return res.status(409).json({ error: `Tenant is ${tenant.status} and can no longer be edited` });
  }
  const { errors, value } = validateTenantEdit(req.body);
  if (value.slug && store.getTenants().some(t => t.slug === value.slug && t.id !== tenant.id)) {
    errors.slug = `Slug "${value.slug}" is already used by another tenant`;
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Invalid tenant data', fields: errors });
  }
  res.json(store.updateTenant(req.params.id, value));
});

// Approve the generated tenant; completes the Tenant Setup step
app.post('/api/customers/:id/tenant/approve', (req, res) => {
  const tenant = store.getTenantByCustomerId(req.params.id);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  if (tenant.status !== 'pending') {
    return res.status(409).json({ error: `Tenant is already ${tenant.status}` });
  }
  const approved = store.updateTenant(req.params.id, { status: 'approved', approvedAt: new Date().toISOString() });
  const onboarding = setStepStatus(req.params.id, 'Tenant Setup', 'completed');
  res.json({ tenant: approved, onboarding });
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
      mapping: mappingSummary(store.getMapping(state.customerId)),
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
