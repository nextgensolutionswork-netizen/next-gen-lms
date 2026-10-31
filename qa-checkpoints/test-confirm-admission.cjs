const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { assertIsolatedQaDatabase, assertTargetApplicationIsolatedQa } = require('../scripts/database-preflight.cjs');

async function testFullAdmissionSubmission() {
  assertIsolatedQaDatabase(process.env.NEXT_PUBLIC_SUPABASE_URL || 'mock-sap-lms');
  await assertTargetApplicationIsolatedQa('http://localhost:3001');

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
    } else if (res.url().includes('/api/admissions') || res.url().includes('/api/fees/proof')) {
      console.log(`[HTTP ${res.status()}]:`, res.url());
    }
  });

  const artifactDir = path.resolve('C:/Users/THINKPAD T490/.gemini/antigravity/brain/79586744-6d9a-46db-9f54-0e678a035153');

  console.log('1. Logging in as Counsellor (Ananya Desai)...');
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'counsellor@next-generpsolutions.com');
  await page.fill('input[type="password"]', 'CounsellorPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'));

  console.log('2. Navigating to http://localhost:3001/admissions?convertLeadId=lead-01...');
  await page.goto('http://localhost:3001/admissions?convertLeadId=lead-01', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('3. Filling Student Details (Address & DOB)...');
  const dobInput = page.locator('input[type="date"]').first();
  await dobInput.fill('2000-01-15');

  const addressInput = page.locator('input[placeholder*="House #"]');
  await addressInput.fill('Plot 12, Hitec City, Hyderabad');

  console.log('4. Toggling "Collect Payment" checkbox...');
  const paymentCheckbox = page.locator('input[type="checkbox"]').last();
  await paymentCheckbox.check();
  await page.waitForTimeout(500);

  console.log('5. Filling Payment Details...');
  const amountInput = page.locator('input[type="number"][max]').first();
  if (await amountInput.count() > 0) {
    await amountInput.fill('20000');
  }

  const utrInput = page.locator('input[placeholder*="UTR-9823419082"]');
  if (await utrInput.count() > 0) {
    await utrInput.fill('UTR-9823419082');
  }

  const testFilePath = path.resolve('qa-checkpoints/sample-proof.png');
  const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(testFilePath, pngBuffer);

  console.log('6. Uploading Payment Proof...');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(testFilePath);
  await page.waitForTimeout(3000);

  // Take screenshot right before submitting
  await page.screenshot({ path: path.join(artifactDir, 'live-test-admissions-filled-ready.png') });
  console.log('Ready to submit screenshot saved.');

  console.log('7. Clicking "Confirm Admission & Submit Payment"...');
  const confirmBtn = page.locator('button:has-text("Confirm Admission & Submit Payment")').first();
  await confirmBtn.click();

  // Wait 4 seconds for processing
  await page.waitForTimeout(4000);

  // Take screenshot of result
  const shotPath = path.join(artifactDir, 'live-test-admissions-confirmed-success.png');
  await page.screenshot({ path: shotPath });
  console.log('Success screenshot saved to:', shotPath);

  // Check page content
  const pageText = await page.locator('body').innerText();
  const hasSuccess = pageText.includes('Successfully') || pageText.includes('Receipt') || pageText.includes('Admission Confirmed') || pageText.includes('ADM-');
  console.log('Did admission complete successfully?', hasSuccess);

  await browser.close();
}

testFullAdmissionSubmission().catch(console.error);
