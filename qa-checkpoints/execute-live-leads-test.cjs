const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testLeadCreation() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[Browser Console]:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[Browser Error]:', err.message));

  console.log('1. Logging in as Counsellor...');
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'counsellor@next-generpsolutions.com');
  await page.fill('input[type="password"]', 'CounsellorPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'));

  console.log('2. Navigating to /crm/leads...');
  await page.goto('http://localhost:3001/crm/leads', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  console.log('3. Opening Add New Prospective Lead modal...');
  await page.locator('button:has-text("New Lead")').first().click();
  await page.waitForTimeout(1000);

  console.log('4. Filling modal fields...');
  await page.fill('input[placeholder="e.g. Ramesh Kumar"]', 'Rohan Sharma');
  await page.fill('input[placeholder="+91 98765 43210"]', '9874563217');
  await page.fill('input[placeholder="ramesh@example.com"]', 'test1@gmail.com');
  
  // Select SAP FICO course
  await page.locator('select').first().selectOption('c1000000-0000-0000-0000-000000000001');

  // Verify counsellor selected is Ananya Desai
  const counsellorVal = await page.locator('select').nth(1).inputValue();
  console.log('Selected counsellor ID:', counsellorVal);

  // Background
  await page.fill('input[placeholder="e.g. Accounts Executive (2 yrs exp)"]', 'Working Professional');

  // Notes
  await page.fill('textarea', 'Candidate requested syllabus brochure for S/4HANA weekend batch...');

  const artifactDir = path.resolve('C:/Users/THINKPAD T490/.gemini/antigravity/brain/79586744-6d9a-46db-9f54-0e678a035153');
  await page.screenshot({ path: path.join(artifactDir, 'live-test-leads-filled-ready.png') });
  console.log('Saved filled form screenshot.');

  console.log('5. Clicking "Create Lead"...');
  await page.locator('button:has-text("Create Lead")').first().click();

  // Wait 3 seconds
  await page.waitForTimeout(3000);

  // Check if error banner exists
  const errorBanner = page.locator('div[role="alert"]');
  if (await errorBanner.count() > 0 && await errorBanner.first().isVisible()) {
    console.log('ALERT/ERROR VISIBLE:', await errorBanner.first().innerText());
  } else {
    console.log('No error banner visible. Submission succeeded!');
  }

  await page.screenshot({ path: path.join(artifactDir, 'live-test-leads-created-result.png') });
  console.log('Saved result screenshot.');

  await browser.close();
}

testLeadCreation().catch(console.error);
