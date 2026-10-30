const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[Browser Console]:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[Browser Error]:', err.message));
  page.on('response', async res => {
    if (res.status() >= 400) {
      console.log('HTTP ' + res.status() + ' on ' + res.url());
      try {
        console.log(await res.text());
      } catch (e) {}
    }
  });

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'counsellor@next-generpsolutions.com');
  await page.fill('input[type="password"]', 'CounsellorPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'));

  await page.goto('http://localhost:3001/admissions?convertLeadId=lead-01', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.locator('input[type="date"]').first().fill('2000-01-15');
  await page.locator('input[placeholder*="House #"]').fill('Plot 12, Hitec City, Hyderabad');

  await page.locator('input[type="checkbox"]').last().check();
  await page.waitForTimeout(500);

  const amountInput = page.locator('input[type="number"][max]').first();
  if (await amountInput.count() > 0) {
    await amountInput.fill('20000');
  }

  const utrInput = page.locator('input[placeholder*="UTR-9823419082"]');
  if (await utrInput.count() > 0) {
    await utrInput.fill('UTR-9823419082');
  }

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('qa-checkpoints/sample-proof.png');
  await page.waitForTimeout(2000);

  console.log('Clicking submit...');
  await page.locator('button:has-text("Confirm Admission & Submit Payment")').first().click();
  await page.waitForTimeout(3000);

  // Check what is on the screen
  const alerts = await page.locator('[role="alert"], .text-red-700, .text-red-600, .bg-red-50').allInnerTexts();
  console.log('Alerts on screen:', alerts);

  const modalOpen = await page.locator('button:has-text("Confirm Admission & Submit Payment")').isVisible();
  console.log('Is admission modal still open?', modalOpen);

  const successHeading = await page.locator('h3, h2').allInnerTexts();
  console.log('Headings:', successHeading);

  await browser.close();
})();
