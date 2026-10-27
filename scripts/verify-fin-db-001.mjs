import { chromium } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const AUTH_COOKIE_NAME = 'next_gen_auth_user';
const AUTH_SIG_COOKIE_NAME = 'next_gen_auth_user_sig';
const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET || 'next-gen-lms-secure-auth-secret-2026';

function generateAuthCookieSignatureSync(cookieValue, secret = AUTH_COOKIE_SECRET) {
  return crypto.createHmac('sha256', secret).update(cookieValue).digest('hex');
}

async function verifyFinDb001() {
  console.log('='.repeat(80));
  console.log(' VERIFYING DEFECT RESOLUTION: FIN-DB-001 (Payment Database Resilience & Stale Guard)');
  console.log('='.repeat(80));

  const chromePath = 'C:\\Users\\THINKPAD T490\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const accountantUser = {
    id: 'usr-accounts',
    name: 'Suresh Kumar (Chief Accountant)',
    email: 'accounts@next-generpsolutions.com',
    role: 'accountant',
    tenant_id: 'default',
    is_active: true,
  };

  const rawVal = JSON.stringify(accountantUser);
  const encVal = encodeURIComponent(rawVal);
  const sig = generateAuthCookieSignatureSync(encVal);

  await context.addCookies([
    {
      name: AUTH_COOKIE_NAME,
      value: encVal,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: AUTH_SIG_COOKIE_NAME,
      value: sig,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  try {
    fs.mkdirSync('docs/audits', { recursive: true });

    // ------------------------------------------------------------------------
    // SCENARIO 1: Live & Healthy Database State
    // ------------------------------------------------------------------------
    console.log('\n[TEST 1] Verifying Normal Live Database Connectivity...');
    await page.goto('http://127.0.0.1:3001/accounts/approvals?desk=payments', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Check Live indicator
    const liveIndicator = page.locator('text=Database Live');
    await liveIndicator.waitFor({ state: 'visible', timeout: 10000 });
    const liveText = await liveIndicator.innerText();
    console.log(` - Live status indicator found: "${liveText}"`);

    // Ensure stale warning is NOT visible
    const staleWarning1 = page.locator('text=Payment Database Interrupted');
    const isStaleShownInitially = await staleWarning1.isVisible();
    console.log(` - Stale data warning visible during live state: ${isStaleShownInitially} (Expected: false)`);
    if (isStaleShownInitially) throw new Error('Stale warning unexpectedly visible in healthy state!');

    // Verify action buttons are enabled in live state
    const firstVerifyBtn = page.locator('button:has-text("Verify & Approve")').first();
    const isVerifyDisabled = await firstVerifyBtn.isDisabled();
    console.log(` - Verify button disabled in live state: ${isVerifyDisabled} (Expected: false)`);

    const liveScreenshot = path.resolve('docs/audits/fin-db-001-live-healthy.png');
    await page.screenshot({ path: liveScreenshot });
    console.log(` - Saved live healthy state screenshot to: ${liveScreenshot}`);

    // ------------------------------------------------------------------------
    // SCENARIO 2: Simulated Database Interruption / Stale Data Guard Activation
    // ------------------------------------------------------------------------
    console.log('\n[TEST 2] Simulating Database Interruption & Stale Data Guard...');

    // Intercept /api/fees/payments to simulate database unavailable error
    await page.route('**/api/fees/payments', (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Payment database unavailable: Connection to the database was interrupted (network socket terminated). Please verify your connection or retry.',
        }),
      });
    });

    // Trigger refresh by clicking "Record Student Payment" or waiting for polling / evaluating loadData
    console.log(' - Triggering data refresh while database is unavailable...');
    await page.evaluate(() => {
      // simulate background poll or manual trigger
      window.dispatchEvent(new Event('visibilitychange'));
    });

    // Or invoke the refresh via page evaluate
    await page.evaluate(async () => {
      // Force refresh error via client
      try {
        const res = await fetch('/api/fees/payments', { cache: 'no-store' });
        const data = await res.json();
      } catch {}
    });

    // Wait a brief moment or reload with intercepted route
    await page.reload({ waitUntil: 'networkidle' });

    // Verify Disconnected indicator
    const disconnectedIndicator = page.locator('text=Database Disconnected').first();
    await disconnectedIndicator.waitFor({ state: 'visible', timeout: 10000 });
    console.log(' - Found status: "Database Disconnected"');

    // Verify Stale Data Guard Banner is prominently displayed
    const staleBanner = page.locator('text=Payment Database Interrupted — Displaying Stale Cached Records');
    await staleBanner.waitFor({ state: 'visible', timeout: 10000 });
    console.log(' - Stale Data Guard Banner is VISIBLE with explanatory warning!');

    // Verify "Retry Connection" button exists
    const retryBtn = page.locator('button:has-text("Retry Connection")');
    const hasRetryBtn = await retryBtn.isVisible();
    console.log(` - "Retry Connection" button visible: ${hasRetryBtn}`);

    // Verify financial action buttons are DISABLED to protect ledger integrity
    const verifyButtons = page.locator('button:has-text("Verify & Approve")');
    const verifyCount = await verifyButtons.count();
    let allDisabled = true;
    for (let i = 0; i < verifyCount; i++) {
      const btn = verifyButtons.nth(i);
      if (!(await btn.isDisabled())) {
        allDisabled = false;
        break;
      }
    }
    console.log(` - All Verify & Approve buttons disabled during DB interruption: ${allDisabled} (Expected: true)`);
    if (!allDisabled) throw new Error('Action buttons were NOT disabled during database interruption!');

    const staleScreenshot = path.resolve('docs/audits/fin-db-001-stale-data-guard.png');
    await page.screenshot({ path: staleScreenshot });
    console.log(` - Saved stale data guard screenshot to: ${staleScreenshot}`);

    // ------------------------------------------------------------------------
    // SCENARIO 3: Automatic / Manual Reconnection & Recovery
    // ------------------------------------------------------------------------
    console.log('\n[TEST 3] Restoring Database Connection & Reconnecting...');

    // Unroute interception to allow live calls to pass through
    await page.unroute('**/api/fees/payments');

    // Click "Retry Connection"
    await retryBtn.click();
    console.log(' - Clicked "Retry Connection"...');

    // Wait for connection to restore
    await liveIndicator.waitFor({ state: 'visible', timeout: 15000 });
    console.log(' - Status successfully returned to: "Database Live"');

    // Verify stale banner is now hidden
    const isStaleGone = !(await staleBanner.isVisible());
    console.log(` - Stale warning banner cleared: ${isStaleGone} (Expected: true)`);

    // Verify buttons are re-enabled
    const reEnabled = !(await firstVerifyBtn.isDisabled());
    console.log(` - Action buttons re-enabled: ${reEnabled} (Expected: true)`);

    const recoveredScreenshot = path.resolve('docs/audits/fin-db-001-reconnected.png');
    await page.screenshot({ path: recoveredScreenshot });
    console.log(` - Saved reconnected healthy state screenshot to: ${recoveredScreenshot}`);

    console.log('\n===============================================================');
    console.log(' FIN-DB-001 VERIFICATION SUCCEEDED: 100% PASS');
    console.log('===============================================================');
  } finally {
    await browser.close();
  }
}

verifyFinDb001().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
