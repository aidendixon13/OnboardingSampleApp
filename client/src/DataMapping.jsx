import React, { useEffect, useState } from 'react';
import { CustomerPicker } from './CustomerPicker';

async function requestJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `HTTP ${res.status}`);
    error.issues = body.issues;
    throw error;
  }
  return body;
}

function FieldDetail({ datasetLabel, field, standards, locked, onEdit }) {
  if (field.type === 'date') {
    if (locked) return <span>Format <code>{field.dateFormat}</code></span>;
    return (
      <select
        aria-label={`${datasetLabel} ${field.label} date format`}
        className={field.dateFormat ? '' : 'select-needs-review'}
        value={field.dateFormat || ''}
        onChange={(e) => onEdit({ dateFormat: e.target.value })}
      >
        <option value="" disabled>Choose a format</option>
        {standards.dateFormats.map(format => (
          <option key={format} value={format} disabled={!field.dateFormatCandidates.includes(format)}>
            {format}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'enum') {
    const targets = standards.enums[field.enum];
    return (
      <ul className="value-map">
        {field.values.map(v => (
          <li key={v.source}>
            <code>{v.source}</code> →{' '}
            {locked ? (
              <code>{v.target}</code>
            ) : (
              <select
                aria-label={`${datasetLabel} ${field.label} value ${v.source}`}
                className={v.target ? '' : 'select-needs-review'}
                value={v.target || ''}
                onChange={(e) => onEdit({ values: { [v.source]: e.target.value || null } })}
              >
                <option value="">not mapped</option>
                {targets.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return <span className="samples">{field.samples.join(', ')}</span>;
}

function SourceSelect({ datasetLabel, field, headers, locked, onEdit }) {
  if (locked) {
    return field.source ? <code>{field.source}</code> : <span className="muted">not provided</span>;
  }
  return (
    <select
      aria-label={`${datasetLabel} ${field.label} source column`}
      className={!field.source && field.required ? 'select-needs-review' : ''}
      value={field.source || ''}
      onChange={(e) => onEdit({ source: e.target.value || null })}
    >
      <option value="">{field.required ? '— missing —' : '— not provided —'}</option>
      {headers.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}

function DatasetMapping({ datasetKey, dataset, standards, locked, onEdit, rowErrors }) {
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
          {dataset.fields.map(field => {
            const edit = (change) => onEdit(datasetKey, field.key, change);
            const rowError = rowErrors[`${datasetKey}.${field.key}`];
            return (
              <tr key={field.key} className={!field.source && field.required ? 'row-needs-review' : ''}>
                <td>
                  {field.label}
                  {field.required && <span className="required-mark" title="Required"> *</span>}
                </td>
                <td>
                  <SourceSelect datasetLabel={dataset.label} field={field} headers={dataset.headers} locked={locked} onEdit={edit} />
                </td>
                <td>
                  {field.source && <FieldDetail datasetLabel={dataset.label} field={field} standards={standards} locked={locked} onEdit={edit} />}
                  {rowError && <div className="field-error">{rowError}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {dataset.unmappedHeaders.length > 0 && (
        <p className="muted">Unused source columns: {dataset.unmappedHeaders.join(', ')}</p>
      )}
    </section>
  );
}

/** Review the pre-populated mapping, fix what it could not match, and approve it. */
export function DataMappingTab({ customers, selectedId, onSelect, onChanged }) {
  const [mapping, setMapping] = useState(null);
  const [standards, setStandards] = useState(null);
  const [error, setError] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [approveError, setApproveError] = useState(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    requestJson('/api/standards')
      .then(setStandards)
      .catch(err => {
        console.error('Failed to load standards:', err);
        setError(err.message);
      });
  }, []);

  useEffect(() => {
    setMapping(null);
    setError(null);
    setRowErrors({});
    setApproveError(null);
    if (!selectedId) return;
    requestJson(`/api/customers/${selectedId}/mapping`)
      .then(setMapping)
      .catch(err => {
        console.error('Failed to load mapping:', err);
        setError(err.message);
      });
  }, [selectedId]);

  const handleEdit = async (datasetKey, fieldKey, change) => {
    const rowKey = `${datasetKey}.${fieldKey}`;
    setRowErrors(({ [rowKey]: _cleared, ...rest }) => rest);
    setApproveError(null);
    try {
      const updated = await requestJson(`/api/customers/${selectedId}/mapping/${datasetKey}/${fieldKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change)
      });
      setMapping(updated);
      onChanged();
    } catch (err) {
      console.error('Failed to update mapping:', err);
      setRowErrors(prev => ({ ...prev, [rowKey]: err.message }));
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setApproveError(null);
    try {
      const { mapping: approved } = await requestJson(`/api/customers/${selectedId}/mapping/approve`, { method: 'POST' });
      setMapping(approved);
      onChanged();
    } catch (err) {
      console.error('Failed to approve mapping:', err);
      setApproveError(err.message);
    } finally {
      setApproving(false);
    }
  };

  const locked = mapping?.status === 'approved';

  return (
    <div>
      <h2>Data Mapping</h2>
      <CustomerPicker customers={customers} selectedId={selectedId} onSelect={onSelect} />

      {error && <p className="field-error">Failed to load mapping: {error}</p>}
      {selectedId && !(mapping && standards) && !error && <p>Loading...</p>}

      {mapping && standards && (
        <>
          <div className={`mapping-status ${locked ? 'approved' : mapping.issues.length ? 'has-issues' : 'ready'}`}>
            <div>
              <strong>{locked ? 'Approved' : 'Draft'}</strong>
              {' · '}
              {locked
                ? `Approved ${new Date(mapping.approvedAt).toLocaleString()}`
                : mapping.issues.length === 0
                  ? 'Everything is mapped. Ready to approve.'
                  : `${mapping.issues.length} item(s) need review`}
            </div>
            {!locked && (
              <button
                type="button"
                className="submit-button"
                disabled={approving || mapping.issues.length > 0}
                onClick={handleApprove}
              >
                {approving ? 'Approving...' : 'Approve mapping'}
              </button>
            )}
          </div>
          {approveError && <p className="field-error">Could not approve: {approveError}</p>}
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
            <DatasetMapping
              key={key}
              datasetKey={key}
              dataset={dataset}
              standards={standards}
              locked={locked}
              onEdit={handleEdit}
              rowErrors={rowErrors}
            />
          ))}
        </>
      )}
    </div>
  );
}
