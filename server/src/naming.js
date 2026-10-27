/**
 * Naming helpers for customers and tenants
 */

/**
 * Turns an export folder name into a readable customer name to pre-fill intake.
 * "CustomerC_PremierBookkeeping" -> "Premier Bookkeeping", "ABCAccounting" -> "ABC Accounting"
 * @param {string} sourceName
 * @returns {string}
 */
function suggestCustomerName(sourceName) {
  return sourceName
    .replace(/^Customer[A-Z0-9]?_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lowercase, hyphenated tenant slug from a customer name.
 * @param {string} name
 * @returns {string}
 */
function toTenantSlug(name) {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  if (!slug) {
    throw new Error(`Cannot build a tenant slug from customer name "${name}"`);
  }
  return slug;
}

module.exports = { suggestCustomerName, toTenantSlug };
