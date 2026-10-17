import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));

  await page.goto('http://localhost:3000/login');
  await page.fill('input#email', 'counsellor@next-generpsolutions.com');
  await page.fill('input#password', 'CounsellorPass#2026');
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  console.log('Post-login URL:', page.url());

  await page.waitForTimeout(1000);
  console.log('Main content:\n', await page.locator('main').innerText().catch(e => e.message));

  await browser.close();
})();
