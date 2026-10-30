import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const outputDir = path.resolve('docs/audits/staging-verification-2026-10-26');
fs.mkdirSync(outputDir, { recursive: true });

const results = [];
function record(name, pass, details = {}) {
  results.push({ name, pass, timestamp: new Date().toISOString(), ...details });
  console.log(`${pass ? '✓ PASS' : '✗ FAIL'}: ${name}`);
  if (!pass && details.error) console.error('  Error:', details.error);
  fs.writeFileSync(
    path.join(outputDir, 'gate3-auth-navigation-evidence.json'),
    JSON.stringify({ baseUrl: BASE_URL, stagingProject: 'neiccpnxftfmmwnvtgdy', results }, null, 2)
  );
}

async function runGate3Tests() {
  console.log('='.repeat(80));
  console.log(' RELEASE GATE 3: GENUINE AUTH, PROFILE/RECEIPT NAVIGATION & NEGATIVE ACCESS');
  console.log(` Target Server:  ${BASE_URL} (Supabase Staging neiccpnxftfmmwnvtgdy)`);
  console.log('='.repeat(80));

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    // -------------------------------------------------------------------------
    // TEST 3.1: Live Student Form Login, Cookies & Session Refresh Persistence
    // -------------------------------------------------------------------------
    console.log('\n--- Running Test 3.1: Live Student Auth & Session Refresh ---');
    const studentContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const studentPage = await studentContext.newPage();
    studentPage.setDefaultTimeout(20000);

    try {
      await studentPage.goto(`${BASE_URL}/login`);
      await studentPage.locator('input[type=email]').fill('staging.student.1@next-gen-staging.local');
      await studentPage.locator('input[type=password]').fill('StagingPass#2026');
      await studentPage.locator('button[type=submit]').click();

      await studentPage.waitForURL(url => url.pathname === '/portal', { timeout: 15000 });
      await studentPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      const cookies = await studentContext.cookies();
      const authCookie = cookies.find(c => c.name === 'next_gen_auth_user');
      const sigCookie = cookies.find(c => c.name === 'next_gen_auth_user_sig');
      assert.ok(authCookie, 'Authentication cookie next_gen_auth_user must be present');
      assert.ok(sigCookie, 'Cookie signature next_gen_auth_user_sig must be present');

      // Refresh persistence check
      await studentPage.reload();
      await studentPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      assert.equal(new URL(studentPage.url()).pathname, '/portal', 'Reload must maintain /portal route');

      await studentPage.screenshot({ path: path.join(outputDir, 'gate3-student-portal-live.png') });
      record('Test 3.1: Live Student Auth & Session Refresh Persistence', true, {
        user: 'staging.student.1@next-gen-staging.local',
        finalUrl: studentPage.url(),
        cookieCount: cookies.length
      });
    } catch (err) {
      record('Test 3.1: Live Student Auth & Session Refresh Persistence', false, { error: err.message });
    }

    // -------------------------------------------------------------------------
    // TEST 3.2: Student LMS Boundary Isolation (Enforced by Middleware)
    // -------------------------------------------------------------------------
    console.log('\n--- Running Test 3.2: Student LMS Boundary Isolation ---');
    try {
      const restrictedRoutes = ['/dashboard', '/students', '/accounts/fees', '/crm/leads'];
      for (const route of restrictedRoutes) {
        await studentPage.goto(`${BASE_URL}${route}`);
        await studentPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        const currentPath = new URL(studentPage.url()).pathname;
        assert.equal(currentPath, '/portal', `Navigating to ${route} as student must redirect to /portal, got ${currentPath}`);
      }
      record('Test 3.2: Student LMS Boundary Isolation (Protected Routes Redirect to /portal)', true, {
        checkedRoutes: restrictedRoutes
      });
    } catch (err) {
      record('Test 3.2: Student LMS Boundary Isolation', false, { error: err.message });
    }

    // -------------------------------------------------------------------------
    // TEST 3.3: Student Financial Privacy & Receipt Negative Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- Running Test 3.3: Student Financial Privacy & Negative Isolation ---');
    try {
      // 3.3.1 Attempting to view another student's receipt: REC-2026-000001
      await studentPage.goto(`${BASE_URL}/accounts/receipts/REC-2026-000001`);
      await studentPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      
      const bodyText = await studentPage.locator('body').innerText();
      const hasRestricted = bodyText.includes('Access Restricted') || bodyText.includes('Receipt Not Found');
      assert.ok(hasRestricted, 'Student must not view another student receipt. Expected Access Restricted or Receipt Not Found');
      assert.ok(!bodyText.includes('Workflow Candidate 6098'), 'Candidate PII must never leak to another student');

      await studentPage.screenshot({ path: path.join(outputDir, 'gate3-student-receipt-restricted.png') });

      // 3.3.2 Nonexistent receipt ID
      await studentPage.goto(`${BASE_URL}/accounts/receipts/non-existent-rec-9999`);
      await studentPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const nonexistentBody = await studentPage.locator('body').innerText();
      assert.ok(nonexistentBody.includes('Receipt Not Found'), 'Invalid receipt ID must show Receipt Not Found');
      assert.ok(!nonexistentBody.includes('Twenty Thousand'), 'Must NEVER fall back to another receipt');

      record('Test 3.3: Student Financial Privacy & Receipt Negative Isolation', true, {
        receiptDenialVerified: true,
        nonexistentHandledCorrectly: true
      });
    } catch (err) {
      record('Test 3.3: Student Financial Privacy & Receipt Negative Isolation', false, { error: err.message });
    }

    await studentPage.close();
    await studentContext.close();

    // -------------------------------------------------------------------------
    // TEST 3.4: Live Admin Auth, Directory & Student Profile Navigation
    // -------------------------------------------------------------------------
    console.log('\n--- Running Test 3.4: Live Admin Auth, Directory & Student Profile Navigation ---');
    const adminContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const adminPage = await adminContext.newPage();
    adminPage.setDefaultTimeout(20000);

    try {
      await adminPage.goto(`${BASE_URL}/login`);
      await adminPage.locator('input[type=email]').fill('staging.superadmin@next-gen-staging.local');
      await adminPage.locator('input[type=password]').fill('StagingPass#2026');
      await adminPage.locator('button[type=submit]').click();

      await adminPage.waitForURL(url => url.pathname === '/dashboard', { timeout: 15000 });
      await adminPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      // Navigate to /students directory
      await adminPage.goto(`${BASE_URL}/students`);
      await adminPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const directoryBody = await adminPage.locator('body').innerText();
      assert.ok(directoryBody.includes('STU-STG-001'), 'Student directory must display staging student STU-STG-001');

      // Navigate directly to student profile by UUID
      await adminPage.goto(`${BASE_URL}/students/52000000-0000-0000-0000-000000000001`);
      await adminPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const profileBody1 = await adminPage.locator('body').innerText();
      assert.ok(profileBody1.includes('Staging Enrolled Candidate 001'), 'Profile must display candidate name');
      assert.ok(profileBody1.includes('STU-STG-001'), 'Profile must display student code');

      // Reload test on student profile (no intermittent not found)
      await adminPage.reload();
      await adminPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const profileBodyReload = await adminPage.locator('body').innerText();
      assert.ok(profileBodyReload.includes('Staging Enrolled Candidate 001'), 'Reloaded profile must remain loaded');

      await adminPage.screenshot({ path: path.join(outputDir, 'gate3-admin-student-profile.png') });

      // Navigate to invalid student ID
      await adminPage.goto(`${BASE_URL}/students/non-existent-student-uuid`);
      await adminPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const invalidProfileBody = await adminPage.locator('body').innerText();
      assert.ok(invalidProfileBody.includes('Student profile not found'), 'Nonexistent student must show "Student profile not found."');

      record('Test 3.4: Live Admin Auth, Directory & Student Profile Navigation', true, {
        directoryVerified: true,
        profileLoadsByUUID: true,
        profileSurvivesReload: true,
        invalidProfileShowsNotFound: true
      });
    } catch (err) {
      record('Test 3.4: Live Admin Auth, Directory & Student Profile Navigation', false, { error: err.message });
    }

    // -------------------------------------------------------------------------
    // TEST 3.5: Admin Receipt Navigation & Negative State
    // -------------------------------------------------------------------------
    console.log('\n--- Running Test 3.5: Admin Receipt Navigation & Negative State ---');
    try {
      await adminPage.goto(`${BASE_URL}/accounts/receipts`);
      await adminPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      // Admin accesses REC-2026-000001
      await adminPage.goto(`${BASE_URL}/accounts/receipts/REC-2026-000001`);
      await adminPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const recBody = await adminPage.locator('body').innerText();
      assert.ok(recBody.includes('REC-2026-000001'), 'Authorized admin must see receipt REC-2026-000001');

      await adminPage.screenshot({ path: path.join(outputDir, 'gate3-admin-receipt-view.png') });

      // Admin accesses invalid receipt
      await adminPage.goto(`${BASE_URL}/accounts/receipts/non-existent-rec-0000`);
      await adminPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const invalidRecBody = await adminPage.locator('body').innerText();
      assert.ok(invalidRecBody.includes('Receipt Not Found'), 'Invalid receipt must display Receipt Not Found');

      record('Test 3.5: Admin Receipt Navigation & Negative State', true, {
        adminReceiptAccessVerified: true,
        receiptNotFoundStateVerified: true
      });
    } catch (err) {
      record('Test 3.5: Admin Receipt Navigation & Negative State', false, { error: err.message });
    }

    await adminPage.close();
    await adminContext.close();

    // -------------------------------------------------------------------------
    // TEST 3.6: Anonymous Access Denied & Public Route Allow
    // -------------------------------------------------------------------------
    console.log('\n--- Running Test 3.6: Anonymous Access & Public Routes ---');
    const guestContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const guestPage = await guestContext.newPage();
    guestPage.setDefaultTimeout(15000);

    try {
      // 3.6.1 Protected route redirection to login
      await guestPage.goto(`${BASE_URL}/dashboard`);
      const redirectedPath = new URL(guestPage.url()).pathname;
      assert.equal(redirectedPath, '/login', 'Anonymous access to /dashboard must redirect to /login');

      // 3.6.2 Public certificate verify route allowed
      await guestPage.goto(`${BASE_URL}/certificate/verify/CERT-2026-FICO-0091`);
      await guestPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const certPath = new URL(guestPage.url()).pathname;
      assert.ok(certPath.includes('/certificate/verify'), 'Public certificate verification must be accessible without login');

      record('Test 3.6: Anonymous Access Denied & Public Route Accessible', true, {
        anonymousDashboardRedirected: true,
        publicCertificateAccessible: true
      });
    } catch (err) {
      record('Test 3.6: Anonymous Access Denied & Public Route Accessible', false, { error: err.message });
    }

    await guestPage.close();
    await guestContext.close();

  } finally {
    await browser.close();
  }

  const passedCount = results.filter(r => r.pass).length;
  console.log('\n' + '='.repeat(80));
  console.log(` GATE 3 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('='.repeat(80));

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runGate3Tests().catch((err) => {
  console.error('GATE 3 FATAL ERROR:', err);
  process.exit(1);
});
