const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[Browser Console]:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[Browser Error]:', err.message));

  // Login
  console.log('Logging in...');
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'counsellor@next-generpsolutions.com');
  await page.fill('input[type="password"]', 'CounsellorPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'));

  console.log('Navigating to leads...');
  await page.goto('http://localhost:3001/crm/leads', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  await page.locator('button:has-text("New Lead")').first().click();
  await page.waitForTimeout(1000);

  // Get inputs
  const inputs = await page.locator('input').evaluateAll(els => els.map(e => ({
    name: e.name,
    placeholder: e.placeholder,
    id: e.id,
    type: e.type,
    value: e.value,
    required: e.required
  })));
  console.log('Inputs found in modal:', JSON.stringify(inputs, null, 2));

  // Check selects
  const selects = await page.locator('select').evaluateAll(els => els.map(s => ({
    name: s.name,
    id: s.id,
    value: s.value,
    options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
  })));
  console.log('Selects found in modal:', JSON.stringify(selects, null, 2));

  await browser.close();
})();
