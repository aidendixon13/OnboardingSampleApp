import React, { useState } from 'react';

const DATASET_LABELS = {
  clients: 'clients',
  contacts: 'contacts',
  chartOfAccounts: 'accounts',
  transactions: 'transactions'
};

const PLANS = [
  { id: 'starter', label: 'Starter' },
  { id: 'professional', label: 'Professional' },
  { id: 'enterprise', label: 'Enterprise' }
];

const FIELDS = [
  { key: 'name', label: 'Customer name', type: 'text' },
  { key: 'industry', label: 'Industry', type: 'text' },
  { key: 'region', label: 'Region', type: 'text' },
  { key: 'contactEmail', label: 'Contact email', type: 'email' }
];

export function DataSummary({ data }) {
  return (
    <div className="data-summary">
      <span>📦 {data.sourceName}</span>
      {Object.entries(DATASET_LABELS).map(([key, label]) => (
        <span key={key}>{data.rowCounts[key]} {label}</span>
      ))}
    </div>
  );
}

/** Upload a zipped customer data folder; the server stages it until intake is submitted. */
export function ImportUpload({ onImported }) {
  const [file, setFile] = useState(null);
  const [problems, setProblems] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (event) => {
    event.preventDefault();
    setProblems([]);
    if (!file) {
      setProblems(['Choose a .zip file to upload']);
      return;
    }
    setUploading(true);
    try {
      const payload = new FormData();
      payload.append('dataBundle', file);
      const res = await fetch('/api/imports', { method: 'POST', body: payload });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblems(body.problems || [body.error || `HTTP ${res.status}`]);
        return;
      }
      onImported(body);
    } catch (err) {
      console.error('Failed to upload customer data:', err);
      setProblems([`Upload failed: ${err.message}`]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form className="import-upload" onSubmit={handleUpload} noValidate>
      <h2>Import customer data</h2>
      <p className="field-hint">
        A zipped customer folder with clients.csv, contacts.csv, chart_of_accounts.csv, and transactions.csv
      </p>
      <div className="import-row">
        <label htmlFor="import-file" className="visually-hidden">Customer data (.zip)</label>
        <input
          id="import-file"
          type="file"
          accept=".zip,application/zip"
          aria-invalid={problems.length > 0}
          onChange={(e) => setFile(e.target.files[0] || null)}
        />
        <button type="submit" className="submit-button" disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {problems.length > 0 && (
        <ul className="bundle-problems">
          {problems.map(problem => <li key={problem}>{problem}</li>)}
        </ul>
      )}
    </form>
  );
}

function IntakeForm({ staged, onCreated, onCancel }) {
  const [form, setForm] = useState({
    name: staged.suggestedName,
    industry: '',
    region: '',
    contactEmail: '',
    plan: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setSubmitError(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, importId: staged.importId })
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && body.fields) {
        setFieldErrors(body.fields);
        return;
      }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onCreated(body);
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
      <div className="import-summary">
        <DataSummary data={staged} />
        <button type="button" className="link-button" onClick={onCancel}>Upload a different file</button>
      </div>

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
        <label htmlFor="customer-plan">Plan</label>
        <select
          id="customer-plan"
          value={form.plan}
          aria-invalid={Boolean(fieldErrors.plan)}
          onChange={(e) => setForm({ ...form, plan: e.target.value })}
        >
          <option value="" disabled>Choose a plan</option>
          {PLANS.map(plan => <option key={plan.id} value={plan.id}>{plan.label}</option>)}
        </select>
        {fieldErrors.plan && <span className="field-error">{fieldErrors.plan}</span>}
      </div>

      {fieldErrors.importId && <p className="field-error">{fieldErrors.importId}</p>}
      {submitError && <p className="field-error">Failed to save customer: {submitError}</p>}

      <button type="submit" className="submit-button" disabled={submitting}>
        {submitting ? 'Saving...' : 'Create customer'}
      </button>
    </form>
  );
}

function CreatedSummary({ created, onDone }) {
  const { customer, tenant } = created;
  return (
    <div className="created-summary">
      <h2>Customer created</h2>
      <dl className="detail-list">
        <dt>Customer</dt><dd>{customer.name}</dd>
        <dt>Customer ID</dt><dd><code>{customer.id}</code></dd>
        <dt>Tenant ID</dt><dd><code>{tenant.id}</code></dd>
        <dt>Tenant slug</dt><dd><code>{tenant.slug}</code></dd>
        <dt>Plan</dt><dd>{tenant.plan}</dd>
        <dt>Region</dt><dd>{tenant.region}</dd>
        <dt>Tenant status</dt><dd>{tenant.status}</dd>
      </dl>
      <DataSummary data={created.data} />
      <button type="button" className="submit-button" onClick={onDone}>Back to dashboard</button>
    </div>
  );
}

/**
 * Onboarding entry: upload a data folder, fill in intake, then see the generated customer and tenant.
 */
export function CustomerInfoTab({ staged, created, onImported, onClearImport, onCreated, onDone }) {
  if (created) {
    return <CreatedSummary created={created} onDone={onDone} />;
  }
  if (!staged) {
    return <ImportUpload onImported={onImported} />;
  }
  return <IntakeForm key={staged.importId} staged={staged} onCreated={onCreated} onCancel={onClearImport} />;
}
