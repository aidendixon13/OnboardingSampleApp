import React from 'react';

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
