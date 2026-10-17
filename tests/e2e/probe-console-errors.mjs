import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const failedRequests = [];
  page.on('response', async (res) => {
    if (res.status() >= 400) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch {}
      failedRequests.push({
        url: res.url(),
        status: res.status(),
        method: res.request().method(),
        body: bodyText.slice(0, 200),
      });
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });

  // Test Student Portal
  console.log('\n--- Probing Student Portal (/portal) ---');
  await page.goto('http://localhost:3000/login');
  await page.fill('input#email', 'amit.gupta@student.next-gen.com');
  await page.fill('input#password', 'StudentPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(2000);

  console.log('Landed at:', page.url());
  console.log('Failed Requests on Student Portal:');
  console.table(failedRequests);

  await browser.close();
})();
