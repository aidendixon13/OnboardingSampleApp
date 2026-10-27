/**
 * In-Memory Data Store
 * Simple storage for the training exercise - no database needed
 */

// In-memory storage
const store = {
  customers: [],
  tenants: [],
  onboardingStates: [],
  // Parsed customer data bundles, keyed by customer ID
  customerData: new Map(),
  // Uploaded bundles waiting for intake, keyed by import ID
  imports: new Map(),
  // Data mappings to the platform standards, keyed by customer ID
  mappings: new Map()
};

// Store access functions
function getCustomers() {
  return [...store.customers];
}

function getCustomerById(id) {
  return store.customers.find(c => c.id === id);
}

function addCustomer(customer) {
  store.customers.push(customer);
  return customer;
}

function getTenants() {
  return [...store.tenants];
}

function getTenantByCustomerId(customerId) {
  return store.tenants.find(t => t.customerId === customerId);
}

function addTenant(tenant) {
  store.tenants.push(tenant);
  return tenant;
}

function getOnboardingState(customerId) {
  return store.onboardingStates.find(s => s.customerId === customerId);
}

function getAllOnboardingStates() {
  return [...store.onboardingStates];
}

function addOnboardingState(state) {
  store.onboardingStates.push(state);
  return state;
}

function updateOnboardingState(customerId, updates) {
  const index = store.onboardingStates.findIndex(s => s.customerId === customerId);
  if (index !== -1) {
    store.onboardingStates[index] = { ...store.onboardingStates[index], ...updates };
    return store.onboardingStates[index];
  }
  return null;
}

function getCustomerData(customerId) {
  return store.customerData.get(customerId);
}

function setCustomerData(customerId, data) {
  store.customerData.set(customerId, data);
  return data;
}

function addImport(staged) {
  store.imports.set(staged.id, staged);
  return staged;
}

function getImport(id) {
  return store.imports.get(id);
}

function deleteImport(id) {
  store.imports.delete(id);
}

function getMapping(customerId) {
  return store.mappings.get(customerId);
}

function setMapping(customerId, mapping) {
  store.mappings.set(customerId, mapping);
  return mapping;
}

module.exports = {
  getMapping,
  setMapping,
  addImport,
  getImport,
  deleteImport,
  getCustomerData,
  setCustomerData,
  getCustomers,
  getCustomerById,
  addCustomer,
  getTenants,
  getTenantByCustomerId,
  addTenant,
  getOnboardingState,
  getAllOnboardingStates,
  addOnboardingState,
  updateOnboardingState
};
