const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { assertIsolatedQaDatabase, assertTargetApplicationIsolatedQa } = require('../scripts/database-preflight.cjs');

async function testFullAdmissionsFlow() {
  assertIsolatedQaDatabase(process.env.NEXT_PUBLIC_SUPABASE_URL || 'mock-sap-lms');
  await assertTargetApplicationIsolatedQa('http://localhost:3001');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[Browser Console]:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[Browser Error]:', err.message));
  page.on('requestfailed', req => console.log('[Request Failed]:', req.url(), req.failure()?.errorText));
  page.on('response', async res => {
    if (res.status() >= 400) {
      console.log(`[HTTP ${res.status()}]:`, res.url());
      try {
        const text = await res.text();
        console.log('Response body:', text);
      } catch (e) {}
    } else if (res.url().includes('/api/fees/proof')) {
      console.log(`[HTTP ${res.status()}]:`, res.url());
      try {
        const text = await res.text();
        console.log('Proof Response body:', text);
      } catch (e) {}
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

  console.log('3. Toggling "Collect Payment" checkbox...');
  // Find payment checkbox
  const paymentCheckbox = page.locator('input[type="checkbox"]').last();
  await paymentCheckbox.check();
  await page.waitForTimeout(1000);

  console.log('4. Filling Payment Details...');
  // Fill amount
  const amountInput = page.locator('input[type="number"][max]').first();
  if (await amountInput.count() > 0) {
    await amountInput.fill('20000');
  }

  // Fill UTR ref
  const utrInput = page.locator('input[placeholder*="UTR-9823419082"]');
  if (await utrInput.count() > 0) {
    await utrInput.fill('UTR-9823419082');
  }

  // Create test proof image if not exists
  const testFilePath = path.resolve('qa-checkpoints/sample-proof.png');
  const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(testFilePath, pngBuffer);

  console.log('5. Uploading Payment Proof...');
  // The file input is inside FileUpload
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(testFilePath);

  // Wait 4 seconds for upload processing
  await page.waitForTimeout(4000);

  // Take screenshot of modal with uploaded proof
  const shotPath = path.join(artifactDir, 'live-test-admissions-with-proof.png');
  await page.screenshot({ path: shotPath });
  console.log('Screenshot saved to:', shotPath);

  // Check if "fetch failed" error exists
  const fetchFailed = await page.locator('text=fetch failed').isVisible().catch(() => false);
  console.log('Is "fetch failed" visible?', fetchFailed);

  // Check if any error alert exists
  const alerts = await page.locator('.text-red-700, .text-red-600, [role="alert"]').allInnerTexts();
  console.log('Visible alert messages:', alerts);

  await browser.close();
}

testFullAdmissionsFlow().catch(console.error);
