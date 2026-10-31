const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function verifyFreshSession() {
  console.log('=== STARTING FRESH AUTHENTICATED SESSION VERIFICATION ===');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // Ensure completely fresh incognito browser context (no pre-existing localStorage or cookies)
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const artifactDir = path.resolve('C:/Users/THINKPAD T490/.gemini/antigravity/brain/79586744-6d9a-46db-9f54-0e678a035153');

  // STEP 1: Login in fresh session
  console.log('\n--- Step 1: Fresh Login as Counsellor (Ananya Desai) ---');
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'counsellor@next-generpsolutions.com');
  await page.fill('input[type="password"]', 'CounsellorPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'));
  console.log('Logged in in fresh session, URL:', page.url());

  // STEP 2: Verify Lead is Converted in /crm/leads
  console.log('\n--- Step 2: Navigate to /crm/leads & Verify Converted Lead ---');
  await page.goto('http://localhost:3001/crm/leads', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Search or locate Aarav Patel (LD-2026-014)
  const leadRow = page.locator('tr:has-text("Aarav Patel"), tr:has-text("LD-2026-014")').first();
  await leadRow.waitFor({ state: 'visible', timeout: 10000 });
  const leadRowText = await leadRow.innerText();
  console.log('Found lead row in CRM:', leadRowText.replace(/\s+/g, ' '));
  const isConverted = leadRowText.includes('Converted');
  console.log('Is lead stage "Converted"?', isConverted);
  if (!isConverted) throw new Error('Lead is not marked as Converted!');

  await page.screenshot({ path: path.join(artifactDir, 'fresh-session-crm-converted-lead.png') });

  // STEP 3: Navigate to /admissions & Verify Admission Exists
  console.log('\n--- Step 3: Navigate to /admissions & Verify Admission ---');
  await page.goto('http://localhost:3001/admissions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const admissionRow = page.locator('tr:has-text("Aarav Patel"), tr:has-text("ADM-2026-0019")').first();
  await admissionRow.waitFor({ state: 'visible', timeout: 10000 });
  const admissionRowText = await admissionRow.innerText();
  console.log('Found admission row:', admissionRowText.replace(/\s+/g, ' '));
  const isAdmissionConfirmed = admissionRowText.includes('Confirmed');
  console.log('Is admission status "Confirmed"?', isAdmissionConfirmed);

  await page.screenshot({ path: path.join(artifactDir, 'fresh-session-admissions-confirmed.png') });

  // STEP 4: Login as Accountant to check Payment Approval Status
  console.log('\n--- Step 4: Login as Accountant to check Payment Approval Status ---');
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'accounts@next-generpsolutions.com');
  await page.fill('input[type="password"]', 'AccountsPass#2026');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'));

  await page.goto('http://localhost:3001/accounts/approvals?desk=payments', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const pageContent = await page.content();
  const hasAaravPayment = pageContent.includes('Aarav Patel') || pageContent.includes('ADM-2026-0019') || pageContent.includes('20,000');
  console.log('Does Accountant approvals desk show submitted payment pending verification?', hasAaravPayment);

  await page.screenshot({ path: path.join(artifactDir, 'fresh-session-accountant-pending-payments.png') });

  // STEP 5: Verify Payment Proof Download via Authorized Session
  console.log('\n--- Step 5: Verify Payment Proof Retrieval ---');
  const proofPath = '37a8eec1ce19687d132fe29051dca629d164e2c4958ba141d5f4133a33f0688f/fc1bf13cf814d1606b790bd6696dd98b2e62260f6827ef0a1a11a4af4fd70a2d/dcae0d69-8844-4efc-a26e-6635e35da121.png';
  const proofUrl = `http://localhost:3001/api/fees/proof?path=${encodeURIComponent(proofPath)}`;

  const proofResponse = await page.goto(proofUrl);
  console.log('Proof fetch HTTP status:', proofResponse.status());
  console.log('Proof content-type:', proofResponse.headers()['content-type']);
  const isProofRetrieved = proofResponse.status() === 200 && (proofResponse.headers()['content-type']?.includes('image') || proofResponse.headers()['content-type']?.includes('octet-stream'));
  console.log('Was payment proof successfully retrieved by authorized user?', isProofRetrieved);

  await browser.close();
  console.log('\n=== FRESH AUTHENTICATED SESSION VERIFICATION COMPLETE ===');
}

verifyFreshSession().catch(err => {
  console.error('Fresh session verification failed:', err);
  process.exit(1);
});
