import React, { useEffect, useState } from 'react';

/** Pick which customer in the queue a step page is working on. */
export function CustomerPicker({ customers, selectedId, onSelect }) {
  if (customers.length === 0) {
    return <div className="placeholder"><p>No customers yet. Import customer data to start onboarding.</p></div>;
  }
  return (
    <div className="form-field customer-picker">
      <label htmlFor="customer-picker">Customer</label>
      <select id="customer-picker" value={selectedId || ''} onChange={(e) => onSelect(e.target.value)}>
        <option value="" disabled>Choose a customer</option>
        {customers.map(c => <option key={c.customerId} value={c.customerId}>{c.customerName}</option>)}
      </select>
    </div>
  );
}

function FieldDetail({ field }) {
  if (field.type === 'date') {
    return field.dateFormat
      ? <span>Format <code>{field.dateFormat}</code></span>
      : <span className="needs-review">Format unclear{field.dateFormatCandidates.length > 1 ? `: ${field.dateFormatCandidates.join(' or ')}` : ''}</span>;
  }
  if (field.type === 'enum') {
    return (
      <ul className="value-map">
        {field.values.map(v => (
          <li key={v.source}>
            <code>{v.source}</code> → {v.target ? <code>{v.target}</code> : <span className="needs-review">not mapped</span>}
          </li>
        ))}
      </ul>
    );
  }
  return <span className="samples">{field.samples.join(', ')}</span>;
}

function DatasetMapping({ dataset }) {
  return (
    <section className="dataset-mapping">
      <h3>{dataset.label}</h3>
      <table className="mapping-table">
        <thead>
          <tr>
            <th>Standard field</th>
            <th>Source column</th>
            <th>Values</th>
          </tr>
        </thead>
        <tbody>
          {dataset.fields.map(field => (
            <tr key={field.key} className={!field.source && field.required ? 'row-needs-review' : ''}>
              <td>
                {field.label}
                {field.required && <span className="required-mark" title="Required"> *</span>}
              </td>
              <td>
                {field.source
                  ? <code>{field.source}</code>
                  : <span className={field.required ? 'needs-review' : 'muted'}>{field.required ? 'missing' : 'not provided'}</span>}
              </td>
              <td>{field.source && <FieldDetail field={field} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dataset.unmappedHeaders.length > 0 && (
        <p className="muted">Unused source columns: {dataset.unmappedHeaders.join(', ')}</p>
      )}
    </section>
  );
}

/** Shows the pre-populated mapping from a customer's data to the platform standards. */
export function DataMappingTab({ customers, selectedId, onSelect }) {
  const [mapping, setMapping] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setMapping(null);
    setError(null);
    if (!selectedId) return;
    fetch(`/api/customers/${selectedId}/mapping`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        setMapping(body);
      })
      .catch(err => {
        console.error('Failed to load mapping:', err);
        setError(err.message);
      });
  }, [selectedId]);

  return (
    <div>
      <h2>Data Mapping</h2>
      <CustomerPicker customers={customers} selectedId={selectedId} onSelect={onSelect} />

      {error && <p className="field-error">Failed to load mapping: {error}</p>}
      {selectedId && !mapping && !error && <p>Loading...</p>}

      {mapping && (
        <>
          <div className={`mapping-status ${mapping.issues.length ? 'has-issues' : 'ready'}`}>
            <strong>{mapping.status === 'approved' ? 'Approved' : 'Draft'}</strong>
            {' · '}
            {mapping.issues.length === 0
              ? 'Everything is mapped'
              : `${mapping.issues.length} item(s) need review`}
          </div>
          {mapping.issues.length > 0 && (
            <ul className="bundle-problems mapping-issues">
              {mapping.issues.map(issue => (
                <li key={`${issue.dataset}-${issue.field}-${issue.message}`}>
                  {mapping.datasets[issue.dataset].label}: {issue.message}
                </li>
              ))}
            </ul>
          )}
          {Object.entries(mapping.datasets).map(([key, dataset]) => (
            <DatasetMapping key={key} dataset={dataset} />
          ))}
        </>
      )}
    </div>
  );
}
