import React, { useState, useEffect } from 'react';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customer-info', label: 'Customer Info' },
  { id: 'data-mapping', label: 'Data Mapping' },
  { id: 'tenant-setup', label: 'Tenant Setup' },
  { id: 'import', label: 'Import' }
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [onboardingData, setOnboardingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOnboarding = () =>
    fetch('/api/onboarding')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response format');
        return data;
      })
      .then(data => {
        setOnboardingData(data);
        setError(null);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch onboarding data:', err);
        setError(err.message);
        setOnboardingData([]);
        setLoading(false);
      });

  useEffect(() => {
    loadOnboarding();
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Onboarding Dashboard</h1>
        <p>Customer Success Team - Internal Tool</p>
      </header>

      <nav className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === 'dashboard' && (
          <DashboardTab data={onboardingData} loading={loading} error={error} />
        )}
        {activeTab === 'customer-info' && (
          <CustomerInfoTab
            onCreated={() => {
              loadOnboarding();
              setActiveTab('dashboard');
            }}
          />
        )}
        {activeTab === 'data-mapping' && (
          <PlaceholderTab title="Data Mapping" description="Map customer data to platform configuration" />
        )}
        {activeTab === 'tenant-setup' && (
          <PlaceholderTab title="Tenant Setup" description="Provision and configure customer tenant" />
        )}
        {activeTab === 'import' && (
          <PlaceholderTab title="Import" description="Import customer data into the platform" />
        )}
      </main>
    </div>
  );
}

function DashboardTab({ data, loading, error }) {
  if (loading) {
    return <div className="placeholder"><p>Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="placeholder">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to load onboarding data</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return <div className="placeholder"><p>No customers in the onboarding queue</p></div>;
  }

  return (
    <div>
      <h2>Onboarding Queue</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        {data.length} customer(s) awaiting onboarding
      </p>

      {data.map(item => (
        <div key={item.customerId} className="customer-card">
          <h3>{item.customerName}</h3>
          <div className="customer-meta">
            <span>📍 {item.customerRegion}</span>
            <span>🏭 {item.customerIndustry}</span>
          </div>

          {item.data && <DataSummary data={item.data} />}

          <div className="progress-section">
            <ProgressBar percent={item.progressPercent} />
            <Checklist steps={item.steps} />
          </div>
        </div>
      ))}
    </div>
  );
}

const DATASET_LABELS = {
  clients: 'clients',
  contacts: 'contacts',
  chartOfAccounts: 'accounts',
  transactions: 'transactions'
};

function DataSummary({ data }) {
  return (
    <div className="data-summary">
      <span>📦 {data.sourceName}</span>
      {Object.entries(DATASET_LABELS).map(([key, label]) => (
        <span key={key}>{data.rowCounts[key]} {label}</span>
      ))}
    </div>
  );
}

function ProgressBar({ percent }) {
  return (
    <div className="progress-bar-container">
      <div 
        className="progress-bar" 
        style={{ width: `${Math.max(percent, 0)}%` }}
      >
        {percent > 0 ? `${percent}%` : ''}
      </div>
    </div>
  );
}

function Checklist({ steps }) {
  return (
    <ul className="checklist">
      {steps.map(step => (
        <li key={step.id}>
          <span className={`step-status ${step.status}`}>
            {step.status === 'completed' ? '✓' : step.order}
          </span>
          <span>{step.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#9ca3af' }}>
            {step.status.replace('_', ' ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

const EMPTY_FORM = { name: '', industry: '', region: '', contactEmail: '' };

const FIELDS = [
  { key: 'name', label: 'Customer name', type: 'text' },
  { key: 'industry', label: 'Industry', type: 'text' },
  { key: 'region', label: 'Region', type: 'text' },
  { key: 'contactEmail', label: 'Contact email', type: 'email' }
];

function CustomerInfoTab({ onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [bundleFile, setBundleFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [bundleProblems, setBundleProblems] = useState([]);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setBundleProblems([]);
    setSubmitError(null);
    try {
      // Multipart so the intake fields and the zip are validated and saved together
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      if (bundleFile) payload.append('dataBundle', bundleFile);

      const res = await fetch('/api/customers', { method: 'POST', body: payload });
      const body = await res.json().catch(() => ({}));
      if ((res.status === 400 || res.status === 413) && body.fields) {
        setFieldErrors(body.fields);
        setBundleProblems(body.bundleProblems || []);
        return;
      }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setForm(EMPTY_FORM);
      setBundleFile(null);
      onCreated(body.customer);
    } catch (err) {
      console.error('Failed to create customer:', err);
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="customer-form" onSubmit={handleSubmit} noValidate>
      <h2>Customer Info</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Add a customer to the onboarding queue.
      </p>

      {FIELDS.map(({ key, label, type }) => (
        <div className="form-field" key={key}>
          <label htmlFor={`customer-${key}`}>{label}</label>
          <input
            id={`customer-${key}`}
            type={type}
            value={form[key]}
            aria-invalid={Boolean(fieldErrors[key])}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
          {fieldErrors[key] && <span className="field-error">{fieldErrors[key]}</span>}
        </div>
      ))}

      <div className="form-field">
        <label htmlFor="customer-dataBundle">Customer data (.zip)</label>
        <input
          id="customer-dataBundle"
          type="file"
          accept=".zip,application/zip"
          aria-invalid={Boolean(fieldErrors.dataBundle)}
          onChange={(e) => setBundleFile(e.target.files[0] || null)}
        />
        <span className="field-hint">
          A zipped customer folder with clients.csv, contacts.csv, chart_of_accounts.csv, and transactions.csv
        </span>
        {fieldErrors.dataBundle && <span className="field-error">{fieldErrors.dataBundle}</span>}
        {bundleProblems.length > 0 && (
          <ul className="bundle-problems">
            {bundleProblems.map(problem => <li key={problem}>{problem}</li>)}
          </ul>
        )}
      </div>

      {submitError && <p className="field-error">Failed to save customer: {submitError}</p>}

      <button type="submit" className="submit-button" disabled={submitting}>
        {submitting ? 'Saving...' : 'Add customer'}
      </button>
    </form>
  );
}

function PlaceholderTab({ title, description }) {
  return (
    <div className="placeholder">
      <h2>{title}</h2>
      <p>{description}</p>
      <p style={{ marginTop: '20px', fontSize: '0.9rem' }}>
        🚧 This section is ready to be built
      </p>
    </div>
  );
}

export default App;
