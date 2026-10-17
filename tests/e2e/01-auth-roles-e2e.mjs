import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

const ROLES_TO_TEST = [
  {
    role: 'super_admin',
    name: 'Super Admin',
    email: 'superadmin@next-generpsolutions.com',
    password: 'AdminPass#2026',
    expectedRoute: '/dashboard',
    allowedMenus: ['Dashboard', 'Academics', 'Admissions', 'Accounts', 'CRM', 'Placement', 'Settings', 'Audit Logs'],
    forbiddenRoutes: [],
  },
  {
    role: 'admin',
    name: 'Operations Admin',
    email: 'admin@next-generpsolutions.com',
    password: 'AdminPass#2026',
    expectedRoute: '/dashboard',
    allowedMenus: ['Dashboard', 'Academics', 'Admissions', 'Accounts', 'CRM', 'Placement', 'Settings', 'Audit Logs'],
    forbiddenRoutes: [],
  },
  {
    role: 'counsellor',
    name: 'Academic Counsellor',
    email: 'counsellor@next-generpsolutions.com',
    password: 'CounsellorPass#2026',
    expectedRoute: '/crm/leads',
    allowedMenus: ['Leads', 'Follow-ups', 'Admissions'],
    forbiddenRoutes: ['/settings', '/audit-logs', '/accounts/approvals', '/accounts/expenses'],
  },
  {
    role: 'accountant',
    name: 'Accounts / Finance',
    email: 'accounts@next-generpsolutions.com',
    password: 'AccountsPass#2026',
    expectedRoute: '/accounts/fees',
    allowedMenus: ['Fees', 'Approvals', 'Payments', 'Receipts', 'Expenses', 'Vendors', 'Reports'],
    forbiddenRoutes: ['/settings', '/audit-logs', '/crm/leads'],
  },
  {
    role: 'onboarding_team',
    name: 'Student Onboarding',
    email: 'onboarding@next-generpsolutions.com',
    password: 'OnboardPass#2026',
    expectedRoute: '/onboarding',
    allowedMenus: ['Onboarding', 'Students', 'Batches'],
    forbiddenRoutes: ['/settings', '/audit-logs', '/accounts/approvals'],
  },
  {
    role: 'trainer',
    name: 'Trainer / Faculty',
    email: 'vikram.fico@next-generpsolutions.com',
    password: 'TrainerPass#2026',
    expectedRoute: '/academics/courses',
    allowedMenus: ['Courses', 'Batches', 'Attendance', 'Assignments', 'Assessments', 'Schedule', 'SAP Servers'],
    forbiddenRoutes: ['/accounts/fees', '/accounts/approvals', '/settings', '/audit-logs', '/crm/leads'],
  },
  {
    role: 'student',
    name: 'Enrolled Student',
    email: 'amit.gupta@student.next-gen.com',
    password: 'StudentPass#2026',
    expectedRoute: '/portal',
    allowedMenus: ['Dashboard', 'Courses', 'Attendance', 'Assignments', 'Assessments', 'Certificates'],
    forbiddenRoutes: ['/dashboard', '/crm/leads', '/accounts/fees', '/accounts/approvals', '/settings', '/audit-logs', '/onboarding'],
  },
  {
    role: 'placement_coordinator',
    name: 'Placement Coordinator',
    email: 'placement@next-generpsolutions.com',
    password: 'PlacementPass#2026',
    expectedRoute: '/placement',
    allowedMenus: ['Placement Dashboard', 'Enrollments'],
    forbiddenRoutes: ['/settings', '/audit-logs', '/accounts/approvals'],
  },
];

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await chromium.launch({ channel: 'msedge', headless: true });
  }
}

export async function runAuthAndRolesTests() {
  console.log('='.repeat(80));
  console.log(' PHASE 2 — AUTHENTICATION AND ROLE-BASED ACCESS CONTROL (RBAC) PLAYWRIGHT E2E');
  console.log('='.repeat(80));

  const browser = await launchBrowser();
  const results = [];

  for (const roleConfig of ROLES_TO_TEST) {
    console.log(`\nTesting Role: [${roleConfig.name}] (${roleConfig.role}) ...`);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LMS-Playwright-E2E/1.0',
    });

    const page = await context.newPage();
    const roleReport = {
      role: roleConfig.role,
      name: roleConfig.name,
      loginSuccess: false,
      landingUrl: null,
      expectedUrl: roleConfig.expectedRoute,
      urlMatch: false,
      menusFound: [],
      forbiddenBlocked: [],
      logoutSuccess: false,
      sessionExpiredRedirect: false,
      consoleErrors: [],
    };

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        roleReport.consoleErrors.push(msg.text());
      }
    });

    try {
      // 1. Navigate to Login Page
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });

      // 2. Select demo account or fill form
      // Fill in credentials explicitly to test form input handling
      const emailInput = page.locator('input[type="email"], input#email').first();
      const passwordInput = page.locator('input[type="password"], input#password').first();

      await emailInput.fill(roleConfig.email);
      await passwordInput.fill(roleConfig.password);

      // Click submit button
      const submitButton = page.locator('button[type="submit"]:has-text("Sign In"), button[type="submit"]').first();
      await Promise.all([
        page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
        submitButton.click(),
      ]);

      await page.waitForTimeout(1000);
      const currentUrl = new URL(page.url()).pathname;
      roleReport.landingUrl = currentUrl;
      roleReport.loginSuccess = currentUrl !== '/login';
      roleReport.urlMatch = currentUrl.startsWith(roleConfig.expectedRoute);

      console.log(` - Login Status: ${roleReport.loginSuccess ? 'SUCCESS' : 'FAILED'} (Landed at ${currentUrl}, Expected: ${roleConfig.expectedRoute})`);

      // 3. Inspect Navigation & Menus
      const sidebarLinks = await page.locator('aside a, nav a, header a').allInnerTexts();
      roleReport.menusFound = sidebarLinks.map((s) => s.trim()).filter(Boolean);

      // 4. Test RBAC Enforcement: Attempt to navigate to Forbidden Routes
      for (const forbiddenRoute of roleConfig.forbiddenRoutes) {
        await page.goto(`${BASE_URL}${forbiddenRoute}`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(500);
        const resolvedPath = new URL(page.url()).pathname;
        const isBlocked = resolvedPath !== forbiddenRoute || (await page.locator('text=Access Denied, text=Unauthorized, text=Forbidden').isVisible().catch(() => false));
        roleReport.forbiddenBlocked.push({
          route: forbiddenRoute,
          resolvedPath,
          blocked: isBlocked,
        });
        console.log(` - Forbidden Route [${forbiddenRoute}]: ${isBlocked ? 'BLOCKED (Safe)' : 'UNSAFE (Allowed Access!)'}`);
      }

      // 5. Test Logout Functionality
      const logoutButton = page.locator('button:has-text("Sign Out"), button:has-text("Logout"), button[title="Sign out"], button[aria-label="Logout"]').first();
      if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await Promise.all([
          page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
          logoutButton.click(),
        ]);
        await page.waitForTimeout(500);
        const afterLogoutUrl = new URL(page.url()).pathname;
        roleReport.logoutSuccess = afterLogoutUrl === '/login' || afterLogoutUrl === '/';
        console.log(` - Logout Test: ${roleReport.logoutSuccess ? 'PASSED (Redirected to login)' : 'FAILED'}`);
      } else {
        // Clear cookies to test session expiration
        console.log(' - Logout button not directly visible in header/sidebar, evaluating session expiration directly...');
      }

      // 6. Test Session Invalidation / Expiration
      try {
        await context.clearCookies();
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(500);
        const expiredUrl = new URL(page.url()).pathname;
        roleReport.sessionExpiredRedirect = expiredUrl === '/login';
        console.log(` - Session Invalidation Defense: ${roleReport.sessionExpiredRedirect ? 'PASSED (Redirected to /login)' : 'FAILED'}`);
      } catch (sessErr) {
        roleReport.sessionExpiredRedirect = false;
        console.log(` - Session Invalidation Defense Error: ${sessErr.message}`);
      }

    } catch (err) {
      console.error(` Error testing role ${roleConfig.role}:`, err.message);
      roleReport.error = err.message;
    } finally {
      await context.close();
    }

    results.push(roleReport);
  }

  await browser.close();
  return results;
}

if (process.argv[1]?.endsWith('01-auth-roles-e2e.mjs')) {
  runAuthAndRolesTests()
    .then((results) => {
      console.log('\n' + '='.repeat(80));
      console.log(' PHASE 2 TEST SUMMARY:');
      console.table(results.map((r) => ({
        Role: r.role,
        Login: r.loginSuccess ? 'PASS' : 'FAIL',
        Landed: r.landingUrl,
        Expected: r.expectedUrl,
        RBAC_Blocked: r.forbiddenBlocked.every((f) => f.blocked) ? 'ALL_SAFE' : 'VIOLATIONS_FOUND',
        Session_Guard: r.sessionExpiredRedirect ? 'PASS' : 'FAIL',
      })));
      console.log('='.repeat(80));
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
