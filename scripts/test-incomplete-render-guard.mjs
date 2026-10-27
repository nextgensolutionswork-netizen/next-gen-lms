import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';

async function testIncompleteGuard() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('1. Logging in as Admin...');
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input[type=email]').fill('admin@next-generpsolutions.com');
    await page.locator('input[type=password]').fill('AdminPass#2026');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    console.log('✓ Reached Dashboard');

    // Intercept /api/fees/receipts to simulate a receipt with incomplete financial data (payment_amount: 0)
    console.log('2. Setting up route interception for incomplete financial data (payment_amount: 0)...');
    await page.route('**/api/fees/receipts', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (json?.snapshot?.receipts) {
        json.snapshot.receipts.push({
          id: 'rcpt-incomplete-sim-001',
          receipt_number: 'REC-INCOMPLETE-001',
          payment_id: 'pay-incomplete-sim',
          student_id: 'stu-01',
          student_name: 'Simulated Incomplete Student',
          admission_number: 'ADM-SIM-001',
          course_name: 'SAP S/4HANA Finance (FICO)',
          payment_amount: 0,
          amount: 0,
          payment_mode: 'UPI',
          payment_date: '2026-10-27',
          remaining_balance: 0,
          authorized_by: 'Accountant',
          institute_name: 'Next-Gen ERP Solutions',
          institute_address: 'Plot 42, Hitec City',
          institute_phone: '+91 98765 43210',
          created_at: new Date().toISOString(),
          tenant_id: 'default',
        });
      }
      await route.fulfill({ response, json });
    });

    console.log('3. Navigating to /accounts/receipts/REC-INCOMPLETE-001...');
    await page.goto(`${BASE_URL}/accounts/receipts/REC-INCOMPLETE-001`);

    // Wait for the Incomplete Financial Record heading to be visible
    const incompleteHeading = page.getByRole('heading', { name: 'Incomplete Financial Record' });
    await incompleteHeading.waitFor({ state: 'visible', timeout: 15000 });
    console.log('✓ Incomplete Financial Record guard rendered successfully');

    const alertContainer = page.locator('div[role=alert]').filter({ hasText: 'Incomplete Financial Record' });
    const alertText = await alertContainer.innerText();
    console.log('\n--- Rendered Guard Alert Text ---');
    console.log(alertText);
    console.log('---------------------------------\n');

    assert(alertText.includes('Incomplete Financial Record'), 'Must display Incomplete Financial Record warning');
    assert(alertText.includes('cannot be finalized or issued with zero or unverified payment amounts'), 'Must explain restriction');
    assert.equal(await page.locator('article').count(), 0, 'Official receipt article must NOT be rendered');
    assert.equal(await page.getByRole('button', { name: /Print/i }).count(), 0, 'Print button must NOT be present');
    assert.equal(await page.getByRole('button', { name: /Download PDF/i }).count(), 0, 'Download PDF button must NOT be present');
    assert.equal(await page.getByRole('button', { name: /Share/i }).count(), 0, 'Share button must NOT be present');

    await page.screenshot({ path: 'docs/audits/incomplete-financial-record-guard.png' });
    console.log('✓ Screenshot saved to docs/audits/incomplete-financial-record-guard.png');
    console.log('✓ Verification successful: Incomplete financial records CANNOT appear as finalized receipts or be printed/downloaded!');

    await page.unrouteAll({ behavior: 'ignoreErrors' });
  } finally {
    await browser.close();
  }
}

testIncompleteGuard().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
