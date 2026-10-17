import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000/login');
  await page.fill('input#email', 'admin@next-generpsolutions.com');
  await page.fill('input#password', 'AdminPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'));

  const res = await page.evaluate(async () => {
    const r = await fetch('/api/onboarding/analytics');
    return await r.json();
  });

  console.log('Eligible staff:', res.eligibleStaff);
  await browser.close();
})();
