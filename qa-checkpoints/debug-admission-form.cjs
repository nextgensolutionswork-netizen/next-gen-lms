const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[Browser Console]:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[Browser Error]:', err.message));
  page.on('response', async res => {
    if (res.status() >= 400) {
      console.log(`[HTTP ${res.status()}]:`, res.url());
      try {
        console.log('Error Body:', await res.text());
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

  // Check if form is valid and what required fields exist
  const formState = await page.locator('form').evaluate(f => {
    const invalidFields = [];
    for (const el of f.elements) {
      if (el.checkValidity && !el.checkValidity()) {
        invalidFields.push({ name: el.name, placeholder: el.placeholder, validationMessage: el.validationMessage, type: el.type });
      }
    }
    return invalidFields;
  }).catch(() => null);

  console.log('Invalid fields before filling payment:', formState);

  await page.locator('input[type="checkbox"]').last().check();
  await page.waitForTimeout(500);

  const formStateAfter = await page.locator('form').evaluate(f => {
    const invalidFields = [];
    for (const el of f.elements) {
      if (el.checkValidity && !el.checkValidity()) {
        invalidFields.push({ name: el.name, placeholder: el.placeholder, validationMessage: el.validationMessage, type: el.type });
      }
    }
    return invalidFields;
  }).catch(() => null);

  console.log('Invalid fields after checking payment checkbox:', formStateAfter);

  await browser.close();
})();
