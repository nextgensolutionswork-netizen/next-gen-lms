import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';

async function verify() {
  console.log('='.repeat(80));
  console.log(' FIN-REC-001 LIVE VERIFICATION: RECEIPT AMOUNT CONSISTENCY');
  console.log(` Target Server: ${BASE_URL}`);
  console.log(' Target Receipt: REC-2026-0001');
  console.log('='.repeat(80));

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Login as Admin
    console.log('\n[1/5] Logging in as Admin (default tenant)...');
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input[type=email]').fill('admin@next-generpsolutions.com');
    await page.locator('input[type=password]').fill('AdminPass#2026');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    console.log('✓ Reached Dashboard');

    // 2. Check Payments registry
    console.log('\n[2/5] Inspecting /accounts/payments registry...');
    await page.goto(`${BASE_URL}/accounts/payments`);
    await page.waitForSelector('table', { timeout: 15000 });

    // Switch to Historical tab
    const histBtn = page.getByRole('button', { name: /Historical Transactions/i });
    if (await histBtn.count() > 0) {
      await histBtn.click();
      await page.waitForTimeout(1000);
    }
    const paymentsTableText = await page.getByRole('table').innerText();
    assert(paymentsTableText.includes('REC-2026-0001'), 'Expected REC-2026-0001 in payments registry');
    assert(paymentsTableText.includes('20,000') || paymentsTableText.includes('₹20,000'), 'Expected ₹20,000 in payments registry');
    console.log('✓ Payments registry confirms REC-2026-0001 has ₹20,000 verified payment');

    // 3. Check Receipts registry list
    console.log('\n[3/5] Inspecting /accounts/receipts registry list...');
    await page.goto(`${BASE_URL}/accounts/receipts`);
    await page.waitForSelector('table', { timeout: 15000 });
    const receiptsTableText = await page.getByRole('table').innerText();
    assert(receiptsTableText.includes('REC-2026-0001'), 'Expected REC-2026-0001 in receipts registry');
    assert(receiptsTableText.includes('20,000') || receiptsTableText.includes('₹20,000'), 'Expected ₹20,000 in receipts registry row');
    console.log('✓ Receipts registry confirms REC-2026-0001 displays ₹20,000');

    // 4. Navigate to Receipt Detail page
    console.log('\n[4/5] Inspecting Receipt Detail page /accounts/receipts/REC-2026-0001...');
    await page.goto(`${BASE_URL}/accounts/receipts/REC-2026-0001`);
    await page.waitForSelector('article', { timeout: 15000 });

    const articleText = await page.locator('article').innerText();
    console.log('\n--- Rendered Receipt Text ---');
    console.log(articleText);
    console.log('-----------------------------\n');

    assert(articleText.includes('REC-2026-0001'), 'Receipt number REC-2026-0001 must be present');
    assert(articleText.includes('Amit Gupta'), 'Student name Amit Gupta must be present');
    assert(articleText.includes('₹20,000'), 'Amount ₹20,000 must be displayed on receipt');
    assert(articleText.includes('Twenty Thousand Rupees Only'), 'Amount in words must state Twenty Thousand Rupees Only');
    assert(articleText.includes('This payment\n₹20,000') || articleText.includes('This payment\r\n₹20,000'), 'This payment must show ₹20,000');

    await page.screenshot({ path: 'docs/audits/fin-rec-001-after.png' });
    console.log('✓ Screenshot saved to docs/audits/fin-rec-001-after.png');

    // 5. Test PDF download endpoint
    console.log('\n[5/5] Testing PDF download endpoint...');
    const pdfResponse = await page.request.get(`${BASE_URL}/api/receipts/REC-2026-0001/pdf?download=true`);
    assert.equal(pdfResponse.status(), 200, 'PDF endpoint should return 200');
    const pdfBuffer = await pdfResponse.body();
    assert(pdfBuffer.subarray(0, 5).toString('ascii') === '%PDF-', 'Must return valid PDF magic bytes');
    console.log(`✓ PDF endpoint returned HTTP 200, valid PDF (${pdfBuffer.length} bytes)`);

    console.log('\n' + '='.repeat(80));
    console.log(' >>> FIN-REC-001 VERIFICATION COMPLETE: ALL CHECKS PASSED! <<<');
    console.log('='.repeat(80));
  } finally {
    await browser.close();
  }
}

verify().catch((err) => {
  console.error('FATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
