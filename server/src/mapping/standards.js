/**
 * Platform data standards: the target schema every customer's data is mapped onto.
 *
 * Each field lists header aliases seen in customer exports. Each enum lists the source values
 * known to mean each standard value. Matching ignores case, spaces, and punctuation.
 * Anything not listed is left unmapped for a person to resolve during review.
 */

const ENUMS = {
  clientStatus: {
    active: ['Active', 'A'],
    inactive: ['Inactive', 'I', 'Dormant'],
    pending: ['Pending', 'P', 'Suspended']
  },
  entityType: {
    corporation: ['Corporation', 'CORP', 'Limited Company'],
    s_corporation: ['S-Corporation', 'SCORP'],
    llc: ['LLC', 'LLP'],
    partnership: ['Partnership', 'PART'],
    sole_proprietor: ['Sole Proprietorship', 'SOLE', 'Sole Trader'],
    non_profit: ['Non-Profit', 'NPROF']
  },
  paymentTerms: {
    due_on_receipt: ['Due on Receipt', 'COD', 'Immediate'],
    net_14: ['Net 14', '14 Days'],
    net_15: ['Net 15', '15 Days'],
    net_30: ['Net 30', '30 Days'],
    net_45: ['Net 45', '45 Days'],
    net_60: ['Net 60', '60 Days']
  },
  activeFlag: {
    active: ['Active', 'Y', 'Yes', '1', 'True'],
    inactive: ['Inactive', 'N', 'No', '0', 'False', 'Dormant']
  },
  contactMethod: {
    email: ['Email'],
    phone: ['Phone'],
    sms: ['SMS', 'Text']
  },
  accountType: {
    asset: ['Asset', 'Assets'],
    liability: ['Liability', 'Liabilities'],
    equity: ['Equity', 'Capital'],
    revenue: ['Revenue', 'Income'],
    expense: ['Expense', 'Direct Costs', 'Overheads', 'Finance Costs']
  },
  debitCredit: {
    debit: ['Debit', 'DR', 'D'],
    credit: ['Credit', 'CR', 'C']
  },
  transactionStatus: {
    completed: ['Cleared', 'Posted', 'Reconciled'],
    pending: ['Pending', 'Unreconciled'],
    cancelled: ['Voided', 'Void', 'Cancelled']
  },
  paymentMethod: {
    wire: ['Wire Transfer', 'Wire'],
    ach: ['ACH', 'EFT', 'BACS', 'Direct Deposit'],
    bank_transfer: ['Bank Transfer', 'Bank'],
    check: ['Check', 'Cheque'],
    credit_card: ['Credit Card', 'Card', 'Card Payment'],
    cash: ['Cash', 'Petty Cash'],
    direct_debit: ['Direct Debit', 'Standing Order'],
    bank_fee: ['Bank Charge', 'Fee'],
    journal_entry: ['Journal Entry', 'JE'],
    financing: ['Financing', 'Lease', 'HP']
  }
};

/**
 * @typedef {Object} StandardField
 * @property {string} key - Standard field name
 * @property {string} label - Human-readable name
 * @property {'string'|'number'|'date'|'enum'} type
 * @property {boolean} required
 * @property {string} [enum] - Key into ENUMS when type is 'enum'
 * @property {string[]} aliases - Source headers known to mean this field
 */

/** @type {Record<string, { label: string, fields: StandardField[] }>} */
const STANDARDS = {
  clients: {
    label: 'Clients',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'string', required: true, aliases: ['Client ID', 'clientCode', 'customer_id'] },
      { key: 'name', label: 'Name', type: 'string', required: true, aliases: ['Client Name', 'companyName', 'business_name'] },
      { key: 'entityType', label: 'Entity type', type: 'enum', enum: 'entityType', required: true, aliases: ['Business Type', 'entityType', 'legal_structure'] },
      { key: 'status', label: 'Status', type: 'enum', enum: 'clientStatus', required: true, aliases: ['Status', 'clientStatus', 'account_status'] },
      { key: 'startDate', label: 'Start date', type: 'date', required: true, aliases: ['Date Onboarded', 'startDate', 'registration_date'] },
      { key: 'taxId', label: 'Tax ID', type: 'string', required: false, aliases: ['Tax ID', 'federalTaxId', 'tax_reference'] },
      { key: 'annualRevenue', label: 'Annual revenue', type: 'number', required: false, aliases: ['Annual Revenue', 'yearlyRevenue', 'gross_revenue'] },
      { key: 'industry', label: 'Industry', type: 'string', required: false, aliases: ['Industry', 'sectorCode', 'industry_sector'] },
      { key: 'paymentTerms', label: 'Payment terms', type: 'enum', enum: 'paymentTerms', required: false, aliases: ['Payment Terms', 'billingTerms', 'credit_terms'] },
      { key: 'primaryContact', label: 'Primary contact', type: 'string', required: false, aliases: ['Primary Contact', 'mainContact', 'key_contact_name'] }
    ]
  },
  contacts: {
    label: 'Contacts',
    fields: [
      { key: 'contactId', label: 'Contact ID', type: 'string', required: true, aliases: ['Contact ID', 'contactId', 'contact_ref'] },
      { key: 'clientId', label: 'Client ID', type: 'string', required: true, aliases: ['Client ID', 'clientCode', 'customer_id'] },
      { key: 'firstName', label: 'First name', type: 'string', required: true, aliases: ['First Name', 'firstName', 'given_name'] },
      { key: 'lastName', label: 'Last name', type: 'string', required: true, aliases: ['Last Name', 'lastName', 'family_name'] },
      { key: 'email', label: 'Email', type: 'string', required: false, aliases: ['Email', 'emailAddress'] },
      { key: 'phone', label: 'Phone', type: 'string', required: false, aliases: ['Phone', 'phoneNumber', 'telephone'] },
      { key: 'role', label: 'Role', type: 'string', required: false, aliases: ['Role', 'jobTitle', 'position'] },
      { key: 'status', label: 'Status', type: 'enum', enum: 'activeFlag', required: true, aliases: ['Status', 'isActive', 'contact_status'] },
      { key: 'preferredContactMethod', label: 'Preferred contact method', type: 'enum', enum: 'contactMethod', required: false, aliases: ['Preferred Contact Method', 'communicationPreference', 'preferred_channel'] },
      { key: 'department', label: 'Department', type: 'string', required: false, aliases: ['Department', 'businessUnit', 'division'] }
    ]
  },
  chartOfAccounts: {
    label: 'Chart of accounts',
    fields: [
      { key: 'accountNumber', label: 'Account number', type: 'string', required: true, aliases: ['Account Number', 'acctCode', 'nominal_code'] },
      { key: 'name', label: 'Account name', type: 'string', required: true, aliases: ['Account Name', 'acctName', 'account_title'] },
      { key: 'accountType', label: 'Account type', type: 'enum', enum: 'accountType', required: true, aliases: ['Account Type', 'acctCategory', 'category'] },
      { key: 'subType', label: 'Sub type', type: 'string', required: false, aliases: ['Sub Type', 'acctSubCategory', 'sub_category'] },
      { key: 'normalBalance', label: 'Normal balance', type: 'enum', enum: 'debitCredit', required: true, aliases: ['Normal Balance', 'balanceType', 'debit_credit'] },
      { key: 'status', label: 'Status', type: 'enum', enum: 'activeFlag', required: true, aliases: ['Status', 'activeFlag', 'is_active'] },
      { key: 'description', label: 'Description', type: 'string', required: false, aliases: ['Description', 'acctDescription', 'notes'] },
      { key: 'parentAccount', label: 'Parent account', type: 'string', required: false, aliases: ['Parent Account', 'parentAcctCode', 'parent_code'] }
    ]
  },
  transactions: {
    label: 'Transactions',
    fields: [
      { key: 'transactionId', label: 'Transaction ID', type: 'string', required: true, aliases: ['Transaction ID', 'txnId', 'transaction_ref'] },
      { key: 'date', label: 'Date', type: 'date', required: true, aliases: ['Date', 'txnDate', 'posting_date'] },
      { key: 'clientId', label: 'Client ID', type: 'string', required: true, aliases: ['Client ID', 'clientCode', 'customer_id'] },
      { key: 'accountNumber', label: 'Account number', type: 'string', required: true, aliases: ['Account Number', 'acctCode', 'nominal_code'] },
      { key: 'description', label: 'Description', type: 'string', required: false, aliases: ['Description', 'memo', 'narrative'] },
      { key: 'type', label: 'Debit / credit', type: 'enum', enum: 'debitCredit', required: true, aliases: ['Transaction Type', 'entryType', 'dr_cr'] },
      { key: 'amount', label: 'Amount', type: 'number', required: true, aliases: ['Amount', 'txnAmount', 'amount_gbp'] },
      { key: 'reference', label: 'Reference', type: 'string', required: false, aliases: ['Reference Number', 'docNumber', 'document_ref'] },
      { key: 'paymentMethod', label: 'Payment method', type: 'enum', enum: 'paymentMethod', required: false, aliases: ['Payment Method', 'paymentType', 'settlement_method'] },
      { key: 'status', label: 'Status', type: 'enum', enum: 'transactionStatus', required: true, aliases: ['Status', 'txnStatus', 'posting_status'] },
      { key: 'category', label: 'Category', type: 'string', required: false, aliases: ['Category', 'expenseCategory', 'cost_centre'] }
    ]
  }
};

/** Date formats a customer export may use, as [label, regex, (match) => { y, m, d }] */
const DATE_FORMATS = [
  ['YYYY-MM-DD', /^(\d{4})-(\d{2})-(\d{2})$/, m => ({ y: +m[1], m: +m[2], d: +m[3] })],
  ['MM/DD/YYYY', /^(\d{2})\/(\d{2})\/(\d{4})$/, m => ({ y: +m[3], m: +m[1], d: +m[2] })],
  ['DD/MM/YYYY', /^(\d{2})\/(\d{2})\/(\d{4})$/, m => ({ y: +m[3], m: +m[2], d: +m[1] })],
  ['DD-MM-YYYY', /^(\d{2})-(\d{2})-(\d{4})$/, m => ({ y: +m[3], m: +m[2], d: +m[1] })],
  ['MM-DD-YYYY', /^(\d{2})-(\d{2})-(\d{4})$/, m => ({ y: +m[3], m: +m[1], d: +m[2] })]
];

module.exports = { STANDARDS, ENUMS, DATE_FORMATS };
