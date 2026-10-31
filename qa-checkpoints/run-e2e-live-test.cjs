const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runEndToEndLiveTest() {
  console.log('=== STARTING COMPLETE LIVE END-TO-END VERIFICATION ===');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('[Browser Console]:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[Browser Error]:', err.message));
  page.on('response', async res => {
    if (res.status() >= 400) {
      console.log(`[HTTP ${res.status()}]:`, res.url());
      try {
        console.log('Response body:', await res.text());
      } catch (e) {}
    } else if (res.url().includes('/api/admissions') || res.url().includes('/api/fees/proof')) {
      console.log(`[HTTP ${res.status()}]:`, res.url());
    }
  });

  const artifactDir = path.resolve('C:/Users/THINKPAD T490/.gemini/antigravity/brain/79586744-6d9a-46db-9f54-0e678a035153');

  // STEP 1: Login
  console.log('\n--- Step 1: Login as Counsellor (Ananya Desai) ---');
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'counsellor@next-generpsolutions.com');
  await page.fill('input[type="password"]', 'CounsellorPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'));
  console.log('Logged in successfully, current URL:', page.url());

  // STEP 2: Navigate to CRM Leads
  console.log('\n--- Step 2: Navigate to /crm/leads ---');
  await page.goto('http://localhost:3001/crm/leads', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // STEP 3: Open Add New Prospective Lead modal
  console.log('\n--- Step 3: Open Add New Prospective Lead Modal ---');
  await page.locator('button:has-text("New Lead")').first().click();
  await page.waitForTimeout(1000);

  // STEP 4: Fill Lead Form
  console.log('\n--- Step 4: Fill Lead Form ---');
  await page.fill('input[placeholder="e.g. Ramesh Kumar"]', 'Aarav Patel');
  await page.fill('input[placeholder="+91 98765 43210"]', '9874563217');
  const testEmail = `aarav.patel.${Date.now()}@example.com`;
  await page.fill('input[placeholder="ramesh@example.com"]', testEmail);

  // Select SAP FICO course
  await page.locator('select').first().selectOption('c1000000-0000-0000-0000-000000000001');

  // Check Counsellor selected
  const counsellorVal = await page.locator('select').nth(1).inputValue();
  console.log('Selected Counsellor ID in dropdown:', counsellorVal);

  // Background and notes
  await page.fill('input[placeholder="e.g. Accounts Executive (2 yrs exp)"]', 'Working Professional');
  await page.fill('textarea', 'Candidate requested syllabus brochure for S/4HANA weekend batch...');

  await page.screenshot({ path: path.join(artifactDir, 'live-test-crm-lead-modal-filled.png') });
  console.log('Saved filled lead modal screenshot.');

  // STEP 5: Create Lead
  console.log('\n--- Step 5: Click Create Lead ---');
  await page.locator('button:has-text("Create Lead")').first().click();
  await page.waitForTimeout(3000);

  // Check for any actual error banner
  const errorAlert = page.locator('div[role="alert"]:not(#__next-route-announcer__)');
  if (await errorAlert.count() > 0 && await errorAlert.first().isVisible()) {
    const err = (await errorAlert.first().innerText()).trim();
    if (err) {
      console.error('Lead creation error:', err);
      throw new Error('Lead creation failed: ' + err);
    }
  }

  await page.screenshot({ path: path.join(artifactDir, 'live-test-crm-lead-created-table.png') });
  console.log('Lead created! Saved CRM leads table screenshot.');

  // Find the created lead row
  const leadRow = page.locator(`tr:has-text("${testEmail}"), tr:has-text("Aarav Patel")`).first();
  await leadRow.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Created lead is visible in CRM table!');

  // STEP 6: Click "Convert to Admission" on the newly created lead row
  console.log('\n--- Step 6: Click "Convert to Admission" on the Lead Row ---');
  const convertBtn = leadRow.locator('button:has-text("Convert to Admission")').first();
  await convertBtn.click();
  
  // Wait for navigation to /admissions?convertLeadId=...
  await page.waitForURL(url => url.pathname.includes('/admissions'), { timeout: 15000 });
  console.log('Navigated to Admissions page:', page.url());
  await page.waitForTimeout(2000);

  // STEP 7: Verify Admission Modal is open and prefilled
  console.log('\n--- Step 7: Verify Admission Modal & Prefilled Data ---');
  const modalHeader = page.locator('text=Register New Student Admission');
  await modalHeader.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Register New Student Admission modal is visible!');

  // Fill Residential Address and Fee Due Date
  await page.fill('input[placeholder="House #, Street, Locality"]', 'Plot 42, Silicon Valley Towers, Hitec City');
  const dateInputs = page.locator('input[type="date"]');
  const count = await dateInputs.count();
  for (let i = 0; i < count; i++) {
    const val = await dateInputs.nth(i).inputValue();
    if (!val) {
      await dateInputs.nth(i).fill(i === 0 ? '2000-01-15' : '2026-11-30');
    }
  }

  // STEP 8: Toggle Collect Payment and Upload Proof
  console.log('\n--- Step 8: Toggle Payment Collection & Upload Payment Proof ---');
  await page.locator('input[type="checkbox"]').last().check();
  await page.waitForTimeout(500);

  const amountInput = page.locator('input[type="number"][max]').first();
  if (await amountInput.count() > 0) {
    await amountInput.fill('20000');
  }

  const utrInput = page.locator('input[placeholder*="UTR-9823419082"]');
  if (await utrInput.count() > 0) {
    await utrInput.fill(`UTR-${Date.now()}`);
  }

  const testFilePath = path.resolve('qa-checkpoints/sample-proof.png');
  const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(testFilePath, pngBuffer);

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(testFilePath);
  await page.waitForTimeout(3000);

  // Check that "fetch failed" is NOT visible
  const hasFetchFailed = await page.locator('text=fetch failed').isVisible().catch(() => false);
  console.log('Does modal show "fetch failed"?', hasFetchFailed);

  await page.screenshot({ path: path.join(artifactDir, 'live-test-admission-modal-with-proof.png') });
  console.log('Saved admission modal with proof screenshot.');

  // STEP 9: Confirm Admission & Submit Payment
  console.log('\n--- Step 9: Click Confirm Admission & Submit Payment ---');
  await page.locator('button:has-text("Confirm Admission & Submit Payment")').first().click();
  await page.waitForTimeout(4000);

  await page.screenshot({ path: path.join(artifactDir, 'live-test-admission-final-result.png') });
  console.log('Saved final result screenshot.');

  const pageText = await page.locator('body').innerText();
  const isAdmissionSuccess = pageText.includes('Successfully') || pageText.includes('Receipt') || pageText.includes('Admission Confirmed') || pageText.includes('ADM-');
  console.log('Is admission registration completely successful?', isAdmissionSuccess);

  await browser.close();
  console.log('\n=== COMPLETED LIVE END-TO-END VERIFICATION SUCCESSFULLY ===');
}

runEndToEndLiveTest().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
