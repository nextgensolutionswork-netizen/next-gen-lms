const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'counsellor@next-generpsolutions.com');
  await page.fill('input[type="password"]', 'CounsellorPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'));

  await page.goto('http://localhost:3001/admissions?convertLeadId=lead-01', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('Current URL:', page.url());
  const bodyText = await page.locator('body').innerText();
  console.log('Body snippet:', bodyText.slice(0, 500));
  
  // Check if modal exists
  const modalHeader = page.locator('text=Register New Student Admission');
  console.log('Is Register New Student Admission modal visible?', await modalHeader.isVisible().catch(() => false));

  // Check all inputs
  const inputs = await page.locator('input').evaluateAll(els => els.map(e => ({
    name: e.name,
    placeholder: e.placeholder,
    type: e.type,
    className: e.className
  })));
  console.log('All inputs on page:', JSON.stringify(inputs, null, 2));

  await browser.close();
})();
