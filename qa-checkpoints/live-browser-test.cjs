const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runLiveTest() {
  console.log('Launching browser (msedge)...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Listen to console logs and unhandled errors
  page.on('console', msg => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.log('[Browser Error]:', err.message));

  const artifactDir = path.resolve('C:/Users/THINKPAD T490/.gemini/antigravity/brain/79586744-6d9a-46db-9f54-0e678a035153');

  try {
    console.log('Step 1: Navigate to http://localhost:3001/login');
    await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 30000 });

    console.log('Step 2: Sign in as Counsellor (Ananya Desai)');
    // Find demo account button for Counsellor or fill form
    const counsellorBtn = page.locator('button:has-text("Ananya Desai")').first();
    if (await counsellorBtn.count() > 0) {
      console.log('Clicking Ananya Desai quick-login button...');
      await counsellorBtn.click();
    } else {
      console.log('Filling login form...');
      await page.fill('input[type="email"]', 'counsellor@next-generpsolutions.com');
      await page.fill('input[type="password"]', 'CounsellorPass#2026');
      await page.click('button[type="submit"]');
    }

    console.log('Waiting for navigation after login...');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('Navigated to:', page.url());

    // WORKFLOW 1: Add New Prospective Lead on /crm/leads
    console.log('Step 3: Navigate to /crm/leads');
    await page.goto('http://localhost:3001/crm/leads', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log('Step 4: Click "+ New Lead" button');
    const newLeadBtn = page.locator('button:has-text("New Lead"), button:has-text("Add Lead")').first();
    await newLeadBtn.click();
    await page.waitForTimeout(1000);

    console.log('Step 5: Fill form fields as in user screenshot');
    // Name (if present or phone, email, course, counsellor, mode, source, status, notes)
    const nameInput = page.locator('input[placeholder*="name" i], input[name="fullName"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('Rohan Sharma');
    }
    
    await page.locator('input[placeholder*="phone" i], input[name="phone"], input[type="tel"]').first().fill('9874563217');
    await page.locator('input[placeholder*="email" i], input[name="email"]').first().fill('test1@gmail.com');
    
    // Select course: SAP S/4HANA Finance (FICO)
    const courseSelect = page.locator('select').first();
    await courseSelect.selectOption({ label: 'SAP S/4HANA Finance (FICO)' }).catch(async () => {
      // If label matching fails, try by value or text
      const options = await page.locator('select option').allTextContents();
      console.log('Available course options:', options);
      const ficoOption = options.find(o => o.includes('FICO'));
      if (ficoOption) await courseSelect.selectOption({ label: ficoOption.trim() });
    });

    // Counsellor dropdown: Ananya Desai
    const counsellorSelect = page.locator('select').nth(1);
    const counsellorOptions = await counsellorSelect.locator('option').allTextContents();
    console.log('Available counsellor options:', counsellorOptions);

    // Current Status / Background
    const statusInput = page.locator('input[placeholder*="Working" i], input[name="currentStatus"], select[name="currentStatus"]').first();
    if (await statusInput.count() > 0) {
      await statusInput.fill('Working Professional');
    }

    // Counsellor Notes
    const notesInput = page.locator('textarea').first();
    if (await notesInput.count() > 0) {
      await notesInput.fill('Candidate requested syllabus brochure for S/4HANA weekend batch...');
    }

    const filledShotPath = path.join(artifactDir, 'live-test-leads-modal-filled.png');
    await page.screenshot({ path: filledShotPath });
    console.log('Screenshot saved to:', filledShotPath);

    console.log('Step 6: Click "Create Lead" button');
    const submitBtn = page.locator('button:has-text("Create Lead")').first();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    const postSubmitShotPath = path.join(artifactDir, 'live-test-leads-post-submit.png');
    await page.screenshot({ path: postSubmitShotPath });
    console.log('Post-submit screenshot saved to:', postSubmitShotPath);

    // WORKFLOW 2: Admissions conversion & payment proof on /admissions
    console.log('Step 7: Navigate to /admissions?convertLeadId=lead-01');
    await page.goto('http://localhost:3001/admissions?convertLeadId=lead-01', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const admissionsShotPath = path.join(artifactDir, 'live-test-admissions-modal.png');
    await page.screenshot({ path: admissionsShotPath });
    console.log('Admissions screenshot saved to:', admissionsShotPath);

    // Check if error "fetch failed" is visible in admissions modal
    const fetchFailedError = page.locator('text=fetch failed');
    const hasFetchFailed = await fetchFailedError.count() > 0 && await fetchFailedError.isVisible();
    console.log('Does Admissions modal show "fetch failed"?', hasFetchFailed);

  } catch (err) {
    console.error('Test run error:', err);
    await page.screenshot({ path: path.join(artifactDir, 'live-test-error.png') }).catch(() => {});
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

runLiveTest();
