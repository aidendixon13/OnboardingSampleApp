const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const store = require('./data/store');
const { createCustomer, createDefaultOnboardingSteps, calculateProgress } = require('./models');
const multer = require('multer');
const { validateCustomerInput } = require('./validation');
const { loadCustomerBundle, BundleError } = require('./loader/customerBundle');

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BUNDLE_BYTES, files: 1 } });

/**
 * Row counts per dataset, for list views that should not ship every row
 * @param {{ sourceName: string, loadedAt: string, datasets: Record<string, { rows: object[] }> } | undefined} data
 */
function summarizeData(data) {
  if (!data) return null;
  return {
    sourceName: data.sourceName,
    loadedAt: data.loadedAt,
    rowCounts: Object.fromEntries(Object.entries(data.datasets).map(([key, d]) => [key, d.rows.length]))
  };
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(store.getCustomers());
});

// Create a customer from intake fields plus a zipped customer data folder.
// Both are validated before anything is stored, so a bad upload leaves no partial customer.
app.post('/api/customers', upload.single('dataBundle'), (req, res) => {
  const { errors, value } = validateCustomerInput(req.body);
  if (!req.file) {
    errors.dataBundle = 'Customer data zip is required';
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Invalid customer data', fields: errors });
  }

  let bundle;
  try {
    bundle = loadCustomerBundle(req.file.buffer, req.file.originalname);
  } catch (err) {
    if (!(err instanceof BundleError)) throw err;
    return res.status(400).json({
      error: 'Invalid customer data',
      fields: { dataBundle: err.message },
      bundleProblems: err.problems
    });
  }

  const customer = store.addCustomer(createCustomer({ ...value, id: `cust_${crypto.randomUUID()}` }));
  store.setCustomerData(customer.id, { ...bundle, loadedAt: new Date().toISOString() });
  const steps = createDefaultOnboardingSteps().map(step =>
    step.order === 1 ? { ...step, status: 'completed' } : step
  );
  const state = store.addOnboardingState({
    customerId: customer.id,
    steps,
    progressPercent: calculateProgress(steps)
  });

  res.status(201).json({ customer, onboarding: state, data: summarizeData(store.getCustomerData(customer.id)) });
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
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: 'Invalid customer data',
      fields: { dataBundle: message }
    });
  }
  next(err);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Onboarding API server running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});
