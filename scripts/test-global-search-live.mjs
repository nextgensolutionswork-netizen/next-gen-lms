import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';

async function testGlobalSearchLive() {
  console.log('='.repeat(80));
  console.log(' LIVE GLOBAL SEARCH VERIFICATION (SEARCH-001)');
  console.log(` Target Server: ${BASE_URL}`);
  console.log(' Query: REC-2026-000001');
  console.log('='.repeat(80));

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    // 1. Login as Super Admin
    console.log('\n[1/4] Logging in as Super Admin...');
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input[type=email]').fill('staging.superadmin@next-gen-staging.local');
    await page.locator('input[type=password]').fill('StagingPass#2026');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    console.log('✓ Reached Dashboard');

    // 2. Locate Global Search Input
    console.log('\n[2/4] Interacting with Global Search...');
    const searchInput = page.getByRole('searchbox', { name: 'Global search' });
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Found Global Search input');

    // 3. Type query and press Enter
    await searchInput.fill('REC-2026-000001');
    console.log('Typed "REC-2026-000001", pressing Enter...');
    await searchInput.press('Enter');

    // 4. Verify search results dropdown
    console.log('\n[3/4] Checking search results dropdown...');
    const resultLink = page.getByRole('link', { name: /REC-2026-000001/ });
    await resultLink.waitFor({ state: 'visible', timeout: 10000 });
    const linkText = await resultLink.innerText();
    console.log(`✓ Search result displayed:\n${linkText.split('\n').map(l => '   ' + l).join('\n')}`);

    // 5. Click the link to navigate to receipt
    console.log('\n[4/4] Navigating to receipt...');
    await resultLink.click();
    await page.waitForURL('**/accounts/receipts/REC-2026-000001', { timeout: 15000 });
    console.log('✓ Navigated to:', page.url());

    // Verify receipt content on page
    await page.getByText('REC-2026-000001', { exact: true }).first().waitFor({ timeout: 10000 });
    console.log('✓ Receipt page loaded REC-2026-000001 successfully!');

    await page.screenshot({ path: 'docs/audits/global-search-receipt-success.png' });
    console.log('✓ Screenshot saved to docs/audits/global-search-receipt-success.png');

    console.log('\n' + '='.repeat(80));
    console.log(' >>> SEARCH-001 VERIFICATION COMPLETE: ALL CHECKS PASSED! <<<');
    console.log('='.repeat(80));
  } finally {
    await browser.close();
  }
}

testGlobalSearchLive().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
