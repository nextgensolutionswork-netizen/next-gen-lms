const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testAdmissionsUpload() {
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

  // Take screenshot of opened modal
  await page.screenshot({ path: path.join(artifactDir, 'live-test-admissions-modal-opened.png') });
  console.log('Saved modal opened screenshot.');

  // Create a dummy image file
  const testFilePath = path.resolve('qa-checkpoints/sample-proof.png');
  // 1x1 transparent PNG buffer
  const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(testFilePath, pngBuffer);

  console.log('3. Setting file input for payment proof upload...');
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(testFilePath);

  // Wait for upload response
  await page.waitForTimeout(4000);

  // Take screenshot after upload
  await page.screenshot({ path: path.join(artifactDir, 'live-test-admissions-after-upload.png') });
  console.log('Saved after-upload screenshot.');

  // Check if error banner or fetch failed exists
  const alerts = await page.locator('.text-red-700, .text-red-600, .text-red-500, [role="alert"]').allInnerTexts();
  console.log('Any alerts/errors on page:', alerts);

  // Check if file upload succeeded (look for green check or file name)
  const isSuccess = await page.locator('text=sample-proof.png').isVisible().catch(() => false);
  console.log('Is sample-proof.png visible?', isSuccess);

  await browser.close();
}

testAdmissionsUpload().catch(console.error);
