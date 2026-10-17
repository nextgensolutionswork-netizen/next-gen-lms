import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await chromium.launch({ channel: 'msedge', headless: true });
  }
}

export async function runLoginSecurityE2E() {
  console.log('='.repeat(80));
  console.log(' NEXT GEN LMS — LOGIN SECURITY & CREDENTIAL URL LEAKAGE PLAYWRIGHT E2E');
  console.log('='.repeat(80));

  const browser = await launchBrowser();
  const testResults = [];

  function recordResult(name, passed, details = '') {
    testResults.push({ name, passed, details });
    const mark = passed ? '✓ PASS' : '✗ FAIL';
    console.log(` [${mark}] ${name} ${details ? '— ' + details : ''}`);
  }

  // =========================================================================
  // SUITE 1: JAVASCRIPT DISABLED (CRITICAL AUDIT DEFECT VERIFICATION)
  // =========================================================================
  console.log('\n--- SUITE 1: JAVASCRIPT DISABLED (NO-JS NATIVE FORM SUBMISSION) ---');
  {
    const noJsContext = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1440, height: 900 },
    });

    const requestsLogged = [];

    // Test 1.1: Super Admin Login without JavaScript
    {
      const page = await noJsContext.newPage();
      page.on('request', (req) => {
        requestsLogged.push({ method: req.method(), url: req.url() });
      });

      await page.goto(`${BASE_URL}/login`);

      // Verify <noscript> security banner is visible
      const noScriptText = await page.content();
      const hasNoScriptWarning = noScriptText.includes('JavaScript is disabled');
      recordResult('No-JS 1.1: Noscript security banner rendered in HTML', hasNoScriptWarning);

      // Verify form method is strictly POST and action is /api/auth/login
      const formMethod = await page.getAttribute('form[action="/api/auth/login"]', 'method');
      const formAction = await page.getAttribute('form[action="/api/auth/login"]', 'action');
      recordResult(
        'No-JS 1.2: Form element specifies method=POST and action=/api/auth/login',
        formMethod?.toUpperCase() === 'POST' && formAction === '/api/auth/login',
        `method="${formMethod}", action="${formAction}"`
      );

      // Fill credentials
      await page.fill('input#email, input[name="email"]', 'superadmin@next-generpsolutions.com');
      await page.fill('input#password, input[name="password"]', 'AdminPass#2026');

      // Click submit button (triggers native browser form POST)
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }),
        page.click('button[type="submit"]'),
      ]);

      const landedUrl = page.url();
      const path = new URL(landedUrl).pathname;
      const hasNoPasswordInUrl = !landedUrl.includes('password') && !landedUrl.includes('AdminPass');
      const landedAtDashboard = path === '/dashboard';

      recordResult(
        'No-JS 1.3: Super Admin successfully authenticated without JavaScript',
        landedAtDashboard,
        `Landed at: ${path}`
      );
      recordResult(
        'No-JS 1.4: ZERO secret credentials exposed in URL upon native POST',
        hasNoPasswordInUrl,
        `URL: ${landedUrl}`
      );

      // Verify request log has ZERO GET requests with password query parameters
      const leakedGetRequests = requestsLogged.filter(
        (r) => r.method === 'GET' && (r.url.includes('password=') || r.url.includes('AdminPass'))
      );
      recordResult(
        'No-JS 1.5: Server access log verification: Zero GET requests with credentials',
        leakedGetRequests.length === 0,
        leakedGetRequests.length === 0 ? 'Zero GET leakages' : `Leaked: ${leakedGetRequests[0].url}`
      );

      await page.close();
    }

    // Test 1.2: Student Login without JavaScript
    {
      const page = await noJsContext.newPage();
      await page.goto(`${BASE_URL}/login`);

      await page.fill('input#email, input[name="email"]', 'amit.gupta@student.next-gen.com');
      await page.fill('input#password, input[name="password"]', 'StudentPass#2026');

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }),
        page.click('button[type="submit"]'),
      ]);

      const landedUrl = page.url();
      const path = new URL(landedUrl).pathname;
      const hasNoPasswordInUrl = !landedUrl.includes('password') && !landedUrl.includes('StudentPass');

      recordResult(
        'No-JS 1.6: Student authenticated and redirected to /portal without JavaScript',
        path === '/portal',
        `Landed at: ${path}`
      );
      recordResult(
        'No-JS 1.7: Student password never exposed in URL',
        hasNoPasswordInUrl,
        `URL: ${landedUrl}`
      );

      await page.close();
    }

    // Test 1.3: Accountant Login without JavaScript
    {
      const page = await noJsContext.newPage();
      await page.goto(`${BASE_URL}/login`);

      await page.fill('input#email, input[name="email"]', 'accounts@next-generpsolutions.com');
      await page.fill('input#password, input[name="password"]', 'AccountsPass#2026');

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }),
        page.click('button[type="submit"]'),
      ]);

      const landedUrl = page.url();
      const path = new URL(landedUrl).pathname;
      const hasNoPasswordInUrl = !landedUrl.includes('password') && !landedUrl.includes('AccountsPass');

      recordResult(
        'No-JS 1.8: Accountant authenticated and redirected to /accounts/fees without JavaScript',
        path === '/accounts/fees',
        `Landed at: ${path}`
      );
      recordResult(
        'No-JS 1.9: Accountant password never exposed in URL',
        hasNoPasswordInUrl,
        `URL: ${landedUrl}`
      );

      await page.close();
    }

    // Test 1.4: Invalid Credentials without JavaScript
    {
      const page = await noJsContext.newPage();
      await page.goto(`${BASE_URL}/login`);

      const fakeSecretPassword = 'TopSecretWrongPassword#9999';
      await page.fill('input#email, input[name="email"]', 'admin@next-generpsolutions.com');
      await page.fill('input#password, input[name="password"]', fakeSecretPassword);

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }),
        page.click('button[type="submit"]'),
      ]);

      const landedUrl = page.url();
      const hasNoPasswordInUrl = !landedUrl.includes(fakeSecretPassword) && !landedUrl.includes('password=');
      const hasErrorParam = landedUrl.includes('error=invalid_credentials');

      recordResult(
        'No-JS 1.10: Invalid credentials safely rejected without password leakage in URL',
        hasNoPasswordInUrl && hasErrorParam,
        `Redirected to: ${landedUrl}`
      );

      await page.close();
    }

    // Test 1.5: Direct Insecure GET Navigation Intercepted by Middleware
    {
      const page = await noJsContext.newPage();
      const dirtyUrl = `${BASE_URL}/login?email=victim%40example.com&password=InsecureUrlPassword123%23`;

      await page.goto(dirtyUrl, { waitUntil: 'load' });
      const currentUrl = page.url();

      const passwordStripped = !currentUrl.includes('InsecureUrlPassword123%23') && !currentUrl.includes('password=');
      const hasInsecureWarning = currentUrl.includes('error=insecure_request');

      recordResult(
        'No-JS 1.11: Middleware strips passwords from incoming GET query parameters immediately',
        passwordStripped && hasInsecureWarning,
        `Sanitized URL: ${currentUrl}`
      );

      await page.close();
    }

    await noJsContext.close();
  }

  // =========================================================================
  // SUITE 2: JAVASCRIPT ENABLED (FULL INTERACTIVE REGRESSION SUITE)
  // =========================================================================
  console.log('\n--- SUITE 2: JAVASCRIPT ENABLED (INTERACTIVE CLIENT SUITE) ---');
  {
    const jsContext = await browser.newContext({
      javaScriptEnabled: true,
      viewport: { width: 1440, height: 900 },
    });

    const ROLES_TEST = [
      { role: 'super_admin', email: 'superadmin@next-generpsolutions.com', pass: 'AdminPass#2026', dest: '/dashboard' },
      { role: 'admin', email: 'admin@next-generpsolutions.com', pass: 'AdminPass#2026', dest: '/dashboard' },
      { role: 'accountant', email: 'accounts@next-generpsolutions.com', pass: 'AccountsPass#2026', dest: '/accounts/fees' },
      { role: 'counsellor', email: 'counsellor@next-generpsolutions.com', pass: 'CounsellorPass#2026', dest: '/crm/leads' },
      { role: 'trainer', email: 'vikram.fico@next-generpsolutions.com', pass: 'TrainerPass#2026', dest: '/academics/courses' },
      { role: 'placement_coordinator', email: 'placement@next-generpsolutions.com', pass: 'PlacementPass#2026', dest: '/placement' },
      { role: 'support', email: 'support@next-generpsolutions.com', pass: 'SupportPass#2026', dest: '/support' },
      { role: 'onboarding_team', email: 'onboarding@next-generpsolutions.com', pass: 'OnboardPass#2026', dest: '/onboarding' },
      { role: 'student', email: 'amit.gupta@student.next-gen.com', pass: 'StudentPass#2026', dest: '/portal' },
    ];

    for (const r of ROLES_TEST) {
      await jsContext.clearCookies();
      const page = await jsContext.newPage();
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      await page.fill('input#email', r.email);
      await page.fill('input#password', r.pass);

      await Promise.all([
        page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ]);

      await page.waitForTimeout(500);
      const landed = new URL(page.url()).pathname;
      const hasNoPassword = !page.url().includes('password') && !page.url().includes(r.pass);

      recordResult(
        `JS 2.1 [${r.role}]: Authenticated and redirected to ${r.dest}`,
        landed === r.dest && hasNoPassword,
        `Landed at: ${landed}`
      );

      await page.close();
    }

    // Test 2.2: Interactive Invalid Password
    {
      const freshContext = await browser.newContext({ javaScriptEnabled: true, viewport: { width: 1440, height: 900 } });
      const page = await freshContext.newPage();
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

      await page.fill('input#email', 'admin@next-generpsolutions.com');
      await page.fill('input#password', 'WrongInteractivePassword#123');
      await page.click('button[type="submit"]');

      await page.locator('[role="alert"]').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      const errorTexts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
      const errorText = errorTexts.join(' ');
      const url = page.url();

      const errorShown = errorText.includes('Unable to sign in') || errorText.includes('Check your email');
      const urlClean = !url.includes('WrongInteractivePassword') && !url.includes('password=');

      recordResult(
        'JS 2.2: Interactive wrong password shows safe error message with zero URL leakage',
        errorShown && urlClean,
        `Alert text: "${errorText.trim()}", URL: ${url}`
      );

      await page.close();
      await freshContext.close();
    }

    // Test 2.3: Logout and Session Invalidation
    {
      await jsContext.clearCookies();
      const page = await jsContext.newPage();
      // First login as admin
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('input#email', 'admin@next-generpsolutions.com');
      await page.fill('input#password', 'AdminPass#2026');
      await Promise.all([
        page.waitForNavigation().catch(() => {}),
        page.click('button[type="submit"]'),
      ]);

      // Navigate to logout endpoint
      await page.goto(`${BASE_URL}/api/auth/logout`, { waitUntil: 'networkidle' });
      const postLogoutUrl = page.url();
      recordResult(
        'JS 2.3: Logout redirects cleanly to /login?notice=logged_out',
        postLogoutUrl.includes('/login?notice=logged_out')
      );

      // Attempt protected page navigation without session
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      const deflectedUrl = page.url();
      recordResult(
        'JS 2.4: Unauthenticated protected access deflected to login with safe redirectTo',
        deflectedUrl.includes('redirectTo=%2Fdashboard') || deflectedUrl.includes('redirectTo=/dashboard')
      );

      await page.close();
    }

    // Test 2.4: Deep link redirection preserves destination after login
    {
      const page = await jsContext.newPage();
      await page.goto(`${BASE_URL}/login?redirectTo=/accounts/fees`, { waitUntil: 'networkidle' });

      await page.fill('input#email', 'accounts@next-generpsolutions.com');
      await page.fill('input#password', 'AccountsPass#2026');
      await Promise.all([
        page.waitForNavigation().catch(() => {}),
        page.click('button[type="submit"]'),
      ]);

      await page.waitForTimeout(500);
      const landed = new URL(page.url()).pathname;
      recordResult(
        'JS 2.5: Safe deep link honored post-login (/accounts/fees)',
        landed === '/accounts/fees',
        `Landed at: ${landed}`
      );

      await page.close();
    }

    await jsContext.close();
  }

  await browser.close();

  // Print Summary Table
  console.log('\n' + '='.repeat(80));
  console.log(' PLAYWRIGHT LOGIN SECURITY E2E TEST RESULTS:');
  console.log('='.repeat(80));
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(` Total Checks: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(` Status: ${failed === 0 ? 'ALL CHECKS PASSED (100% SECURE)' : 'SOME CHECKS FAILED'}`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('login-security-e2e.mjs')) {
  runLoginSecurityE2E()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal Playwright E2E error:', err);
      process.exit(1);
    });
}
