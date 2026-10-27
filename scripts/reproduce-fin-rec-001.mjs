import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';

async function reproduce() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('1. Logging in as Admin (default tenant)...');
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input[type=email]').fill('admin@next-generpsolutions.com');
    await page.locator('input[type=password]').fill('AdminPass#2026');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });

    console.log('2. Navigating to /accounts/payments...');
    await page.goto(`${BASE_URL}/accounts/payments`);
    await page.waitForSelector('table', { timeout: 15000 });
    const paymentRowText = await page.getByRole('table').innerText().catch(() => '');
    console.log('Payments table snippet has REC-2026-0001?', paymentRowText.includes('REC-2026-0001'));
    if (!paymentRowText.includes('REC-2026-0001')) {
      // Check historical tab
      console.log('Checking Historical tab...');
      const histTab = page.getByRole('button', { name: /Historical|Legacy/i });
      if (await histTab.count() > 0) {
        await histTab.click();
        await page.waitForTimeout(1000);
        const histTable = await page.getByRole('table').innerText().catch(() => '');
        console.log('Historical tab table has REC-2026-0001?', histTable.includes('REC-2026-0001'));
      }
    }

    console.log('3. Navigating to /accounts/receipts/REC-2026-0001...');
    await page.goto(`${BASE_URL}/accounts/receipts/REC-2026-0001`);
    await page.waitForSelector('article', { timeout: 15000 });
    await page.screenshot({ path: 'docs/audits/reproduce-fin-rec-001-before.png' });

    const articleText = await page.locator('article').innerText();
    console.log('--- Receipt Detail Page Article Text ---');
    console.log(articleText);
    console.log('----------------------------------------');
  } finally {
    await browser.close();
  }
}

reproduce().catch(console.error);
