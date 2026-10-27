import React, { useState, useEffect } from 'react';
import { CustomerInfoTab, DataSummary, ImportUpload } from './CustomerInfo';
import { DataMappingTab } from './DataMapping';
import { TenantSetupTab } from './TenantSetup';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customer-info', label: 'Customer Info' },
  { id: 'data-mapping', label: 'Data Mapping' },
  { id: 'tenant-setup', label: 'Tenant Setup' }
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [onboardingData, setOnboardingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Uploaded data waiting for intake, and the customer most recently created from it
  const [stagedImport, setStagedImport] = useState(null);
  const [createdCustomer, setCreatedCustomer] = useState(null);
  // Customer the step pages (mapping, tenant) are working on
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  const openStep = (tab, customerId) => {
    setSelectedCustomerId(customerId);
    setActiveTab(tab);
  };

  const startIntake = (staged) => {
    setCreatedCustomer(null);
    setStagedImport(staged);
    setActiveTab('customer-info');
  };

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
        // Step pages default to the first customer in the queue
        setSelectedCustomerId(prev => prev || data[0]?.customerId || null);
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
          <DashboardTab
            data={onboardingData}
            loading={loading}
            error={error}
            onImported={startIntake}
            onOpenStep={openStep}
          />
        )}
        {activeTab === 'customer-info' && (
          <CustomerInfoTab
            staged={stagedImport}
            created={createdCustomer}
            customers={onboardingData}
            selectedId={selectedCustomerId}
            onSelect={setSelectedCustomerId}
            onClearImport={() => setStagedImport(null)}
            onCreated={(result) => {
              setStagedImport(null);
              setCreatedCustomer(result);
              setSelectedCustomerId(result.customer.id);
              loadOnboarding();
            }}
            onReviewMapping={(customerId) => {
              setCreatedCustomer(null);
              openStep('data-mapping', customerId);
            }}
            onDone={() => {
              setCreatedCustomer(null);
              setActiveTab('dashboard');
            }}
          />
        )}
        {activeTab === 'data-mapping' && (
          <DataMappingTab
            customers={onboardingData}
            selectedId={selectedCustomerId}
            onSelect={setSelectedCustomerId}
            onChanged={loadOnboarding}
          />
        )}
        {activeTab === 'tenant-setup' && (
          <TenantSetupTab
            customers={onboardingData}
            selectedId={selectedCustomerId}
            onSelect={setSelectedCustomerId}
            onChanged={loadOnboarding}
          />
        )}
      </main>
    </div>
  );
}

function DashboardTab({ data, loading, error, onImported, onOpenStep }) {
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

  return (
    <div>
      <ImportUpload onImported={onImported} />

      {data.length === 0 ? (
        <div className="placeholder"><p>No customers in the onboarding queue</p></div>
      ) : (
        <OnboardingQueue data={data} onOpenStep={onOpenStep} />
      )}
    </div>
  );
}

function OnboardingQueue({ data, onOpenStep }) {
  return (
    <div>
      <h2>Onboarding Queue</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        {data.length} customer(s) awaiting onboarding
      </p>

      {data.map(item => (
        <div key={item.customerId} className="customer-card">
          <h3>
            <button type="button" className="card-title-button" onClick={() => onOpenStep('customer-info', item.customerId)}>
              {item.customerName}
            </button>
          </h3>
          <div className="customer-meta">
            <span>📍 {item.customerRegion}</span>
            <span>🏭 {item.customerIndustry}</span>
          </div>

          {item.tenant && (
            <div className="tenant-line">
              Tenant <code>{item.tenant.slug}</code> · {item.tenant.plan} · {item.tenant.status}
            </div>
          )}
          {item.mapping && (
            <div className="tenant-line">
              Mapping {item.mapping.status}
              {item.mapping.issueCount > 0 && ` · ${item.mapping.issueCount} to review`}
              {' · '}
              <button type="button" className="link-button" onClick={() => onOpenStep('data-mapping', item.customerId)}>
                Review mapping
              </button>
            </div>
          )}
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

export default App;
