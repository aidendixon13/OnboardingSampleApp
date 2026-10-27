// @ts-check
const path = require('path');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');

/** Zips a sample-data customer folder for upload. */
function sampleBundle(folder) {
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(__dirname, '..', '..', 'sample-data', folder), folder);
  return { name: `${folder}.zip`, mimeType: 'application/zip', buffer: zip.toBuffer() };
}

/** Fills the intake fields with a unique name so parallel tests don't collide. */
async function fillCustomerFields(page, name) {
  await page.getByLabel('Customer name').fill(name);
  await page.getByLabel('Industry').fill('Accounting');
  await page.getByLabel('Region').fill('United Kingdom');
  await page.getByLabel('Contact email').fill('ops@example.com');
}

test.describe('Onboarding Dashboard', () => {
  test('should display the dashboard heading', async ({ page }) => {
    await page.goto('/');

    // Verify the main heading is visible
    await expect(page.locator('h1')).toContainText('Onboarding Dashboard');
  });

  test('should show navigation tabs', async ({ page }) => {
    await page.goto('/');

    // Verify all navigation tabs are present
    await expect(page.locator('.tab')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customer Info' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data Mapping' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tenant Setup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import' })).toBeVisible();
  });

  test('should show the onboarding queue or its empty state', async ({ page }) => {
    await page.goto('/');

    // The queue starts empty; customers appear once added via Customer Info
    await expect(
      page.getByRole('heading', { name: 'Onboarding Queue' })
        .or(page.getByText('No customers in the onboarding queue'))
    ).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    await page.goto('/');

    // Customer Info starts with the data upload
    await page.getByRole('button', { name: 'Customer Info' }).click();
    await expect(page.locator('.import-upload h2')).toContainText('Import customer data');

    // Other tabs are still placeholders
    await page.getByRole('button', { name: 'Data Mapping' }).click();
    await expect(page.locator('.placeholder h2')).toContainText('Data Mapping');
  });

  test('should onboard a customer from an uploaded data folder', async ({ page }) => {
    await page.goto('/');

    // Upload from the dashboard opens the intake page with the name pre-filled
    await page.getByLabel('Customer data (.zip)').setInputFiles(sampleBundle('CustomerC_PremierBookkeeping'));
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.locator('.customer-form h2')).toContainText('Customer Info');
    await expect(page.getByLabel('Customer name')).toHaveValue('Premier Bookkeeping');
    await expect(page.locator('.import-summary')).toContainText('12 clients');

    // Missing fields are reported and nothing is created
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByText('Plan is required')).toBeVisible();

    const name = `Premier Bookkeeping ${Date.now()}`;
    await fillCustomerFields(page, name);
    await page.getByLabel('Plan').selectOption('professional');
    await page.getByRole('button', { name: 'Create customer' }).click();

    // Generated customer and tenant are shown
    const summary = page.locator('.created-summary');
    await expect(summary).toContainText(/cust_[0-9a-f-]+/);
    await expect(summary).toContainText(/tenant_[0-9a-f-]+/);
    await expect(summary).toContainText('premier-bookkeeping-');
    await expect(summary).toContainText('professional');

    // And the customer is in the queue at 25% with its data
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    const card = page.locator('.customer-card', { hasText: name });
    await expect(card).toBeVisible();
    await expect(card.locator('.progress-bar')).toContainText('25%');
    await expect(card.locator('.tenant-line')).toContainText('professional');
    await expect(card.locator('.data-summary')).toContainText('25 transactions');
  });

  test('should reject a data folder with malformed rows and say where', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Customer data (.zip)').setInputFiles(sampleBundle('CustomerA_ABCAccounting'));
    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.locator('.bundle-problems')).toContainText('chart_of_accounts.csv: Line 33');
    await expect(page.locator('.customer-form')).toHaveCount(0);
  });
});
