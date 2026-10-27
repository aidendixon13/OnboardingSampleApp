/**
 * Customer data bundle loader
 * Reads a zip shaped like a sample-data customer folder and parses its four CSV datasets.
 */

const AdmZip = require('adm-zip');
const { parseCsv } = require('./csv');

const DATASETS = [
  { key: 'clients', file: 'clients.csv' },
  { key: 'contacts', file: 'contacts.csv' },
  { key: 'chartOfAccounts', file: 'chart_of_accounts.csv' },
  { key: 'transactions', file: 'transactions.csv' }
];

// Files that OS zip tools add on their own
const IGNORED = [/^__MACOSX\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/i, /(^|\/)desktop\.ini$/i];

class BundleError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super('Customer data bundle is invalid');
    this.name = 'BundleError';
    this.problems = problems;
  }
}

/**
 * Finds the folder that holds the datasets: the zip root, or a single top-level folder
 * (what "Send to > Compressed folder" or `zip -r` on the folder produces).
 * @param {string[]} paths
 * @returns {{ prefix: string, problems: string[] }}
 */
function resolveRoot(paths) {
  const topLevel = new Set(paths.map(p => (p.includes('/') ? p.split('/')[0] + '/' : '')));
  if (topLevel.size === 1 && !topLevel.has('')) {
    return { prefix: [...topLevel][0], problems: [] };
  }
  if (topLevel.has('')) {
    return { prefix: '', problems: [] };
  }
  return {
    prefix: '',
    problems: [`Zip must contain one customer folder, found ${topLevel.size}: ${[...topLevel].join(', ')}`]
  };
}

/**
 * Loads and validates a customer data bundle.
 * @param {Buffer} buffer - Zip file contents
 * @param {string} [fileName] - Original upload name, used when the zip has no top-level folder
 * @returns {{ sourceName: string, datasets: Record<string, { file: string, headers: string[], rows: Record<string, string>[] }> }}
 * @throws {BundleError} with every problem found, so the upload can be fixed in one pass
 */
function loadCustomerBundle(buffer, fileName = '') {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (err) {
    throw new BundleError([`File is not a readable zip archive (${err.message})`]);
  }

  const files = zip.getEntries()
    .filter(e => !e.isDirectory)
    .map(e => ({ path: e.entryName.replace(/\\/g, '/'), entry: e }))
    .filter(f => !IGNORED.some(re => re.test(f.path)));

  if (files.length === 0) {
    throw new BundleError(['Zip is empty']);
  }

  const { prefix, problems } = resolveRoot(files.map(f => f.path));
  if (problems.length > 0) {
    throw new BundleError(problems);
  }

  const byName = new Map();
  const unexpected = [];
  for (const f of files) {
    const relative = f.path.slice(prefix.length);
    const known = DATASETS.find(d => d.file === relative.toLowerCase());
    if (!known) {
      unexpected.push(f.path);
      continue;
    }
    byName.set(known.file, f.entry);
  }

  const errors = [];
  if (unexpected.length > 0) {
    errors.push(`Unexpected file(s): ${unexpected.join(', ')}`);
  }

  const datasets = {};
  for (const { key, file } of DATASETS) {
    const entry = byName.get(file);
    if (!entry) {
      errors.push(`Missing ${file}`);
      continue;
    }
    let parsed;
    try {
      parsed = parseCsv(entry.getData().toString('utf8'));
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
      continue;
    }
    errors.push(...parsed.errors.map(e => `${file}: ${e}`));
    datasets[key] = { file, headers: parsed.headers, rows: parsed.rows };
  }

  if (errors.length > 0) {
    throw new BundleError(errors);
  }

  const sourceName = prefix ? prefix.slice(0, -1) : fileName.replace(/\.zip$/i, '');
  return { sourceName, datasets };
}

module.exports = { loadCustomerBundle, BundleError, DATASETS };
