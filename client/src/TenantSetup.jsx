import React, { useEffect, useState } from 'react';
import { CustomerPicker } from './CustomerPicker';

const PLANS = [
  { id: 'starter', label: 'Starter' },
  { id: 'professional', label: 'Professional' },
  { id: 'enterprise', label: 'Enterprise' }
];

async function requestJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `HTTP ${res.status}`);
    error.fields = body.fields;
    throw error;
  }
  return body;
}

/** Review the generated tenant, adjust its plan or slug, and approve it. */
export function TenantSetupTab({ customers, selectedId, onSelect, onChanged }) {
  const [tenant, setTenant] = useState(null);
  const [form, setForm] = useState({ plan: '', slug: '' });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  const showTenant = (t) => {
    setTenant(t);
    setForm({ plan: t.plan, slug: t.slug });
  };

  useEffect(() => {
    setTenant(null);
    setError(null);
    setFieldErrors({});
    setActionError(null);
    if (!selectedId) return;
    requestJson(`/api/tenants/${selectedId}`)
      .then(showTenant)
      .catch(err => {
        console.error('Failed to load tenant:', err);
        setError(err.message);
      });
  }, [selectedId]);

  const dirty = tenant && (form.plan !== tenant.plan || form.slug !== tenant.slug);
  const locked = tenant && tenant.status !== 'pending';

  const handleSave = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFieldErrors({});
    setActionError(null);
    try {
      const changes = {};
      if (form.plan !== tenant.plan) changes.plan = form.plan;
      if (form.slug !== tenant.slug) changes.slug = form.slug;
      showTenant(await requestJson(`/api/customers/${selectedId}/tenant`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
      }));
      onChanged();
    } catch (err) {
      console.error('Failed to update tenant:', err);
      if (err.fields) setFieldErrors(err.fields);
      else setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const { tenant: approved } = await requestJson(`/api/customers/${selectedId}/tenant/approve`, { method: 'POST' });
      showTenant(approved);
      onChanged();
    } catch (err) {
      console.error('Failed to approve tenant:', err);
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2>Tenant Setup</h2>
      <CustomerPicker customers={customers} selectedId={selectedId} onSelect={onSelect} />

      {error && <p className="field-error">Failed to load tenant: {error}</p>}
      {selectedId && !tenant && !error && <p>Loading...</p>}

      {tenant && (
        <form className="tenant-form" onSubmit={handleSave} noValidate>
          <div className={`mapping-status ${locked ? 'approved' : 'has-issues'}`}>
            <div>
              <strong>{locked ? 'Approved' : 'Pending review'}</strong>
              {locked && tenant.approvedAt && ` · Approved ${new Date(tenant.approvedAt).toLocaleString()}`}
            </div>
            {!locked && (
              <button type="button" className="submit-button" disabled={busy || dirty} onClick={handleApprove}>
                Approve tenant
              </button>
            )}
          </div>
          {dirty && !locked && <p className="muted">Save your changes before approving.</p>}

          <dl className="detail-list">
            <dt>Tenant ID</dt><dd><code>{tenant.id}</code></dd>
            <dt>Customer ID</dt><dd><code>{tenant.customerId}</code></dd>
            <dt>Region</dt><dd>{tenant.region}</dd>
            <dt>Status</dt><dd>{tenant.status}</dd>
          </dl>

          <div className="form-field">
            <label htmlFor="tenant-slug">Tenant slug</label>
            <input
              id="tenant-slug"
              type="text"
              value={form.slug}
              disabled={locked}
              aria-invalid={Boolean(fieldErrors.slug)}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
            {fieldErrors.slug && <span className="field-error">{fieldErrors.slug}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="tenant-plan">Plan</label>
            <select
              id="tenant-plan"
              value={form.plan}
              disabled={locked}
              aria-invalid={Boolean(fieldErrors.plan)}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
            >
              {PLANS.map(plan => <option key={plan.id} value={plan.id}>{plan.label}</option>)}
            </select>
            {fieldErrors.plan && <span className="field-error">{fieldErrors.plan}</span>}
          </div>

          {fieldErrors.form && <p className="field-error">{fieldErrors.form}</p>}
          {actionError && <p className="field-error">{actionError}</p>}

          {!locked && (
            <button type="submit" className="secondary-button" disabled={busy || !dirty}>
              Save changes
            </button>
          )}
        </form>
      )}
    </div>
  );
}
