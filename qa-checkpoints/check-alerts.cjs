const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'counsellor@next-generpsolutions.com');
  await page.fill('input[type="password"]', 'CounsellorPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'));

  await page.goto('http://localhost:3001/crm/leads', { waitUntil: 'networkidle' });
  const alerts = await page.locator('[role="alert"]').evaluateAll(els => els.map(el => ({ text: el.innerText, html: el.outerHTML })));
  console.log('Alerts on /crm/leads before clicking anything:', alerts);
  await browser.close();
})();
