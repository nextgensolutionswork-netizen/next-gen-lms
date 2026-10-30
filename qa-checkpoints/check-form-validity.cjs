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

  const invalidLabels = await page.locator('form').evaluate(f => {
    return Array.from(f.elements)
      .filter(el => !el.checkValidity())
      .map(el => {
        const parent = el.closest('div');
        const label = parent ? parent.querySelector('label')?.innerText : null;
        return { label, type: el.type, placeholder: el.placeholder, value: el.value };
      });
  });

  console.log('Invalid field labels:', JSON.stringify(invalidLabels, null, 2));

  await browser.close();
})();
