import { chromium } from 'playwright';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const AUTH_COOKIE_SECRET = 'next-gen-lms-secure-auth-secret-2026';

function createAuthSessionCookies(user) {
  const cookieVal = encodeURIComponent(JSON.stringify(user));
  const sig = crypto.createHmac('sha256', AUTH_COOKIE_SECRET).update(cookieVal).digest('hex');
  return [
    { name: 'next_gen_auth_user', value: cookieVal, domain: 'localhost', path: '/' },
    { name: 'next_gen_auth_user_sig', value: sig, domain: 'localhost', path: '/' },
  ];
}

const VIEWPORTS = [
  { name: 'Desktop Ultra-Wide', width: 1920, height: 1080, type: 'desktop' },
  { name: 'Laptop Standard', width: 1366, height: 768, type: 'laptop' },
  { name: 'Tablet Portrait', width: 768, height: 1024, type: 'tablet' },
  { name: 'Mobile Handset', width: 375, height: 667, type: 'mobile' },
];

const PAGES_TO_TEST = [
  {
    path: '/login',
    name: 'Authentication Login',
    user: null,
  },
  {
    path: '/dashboard',
    name: 'Admin Executive Dashboard',
    user: { id: 'usr-admin-01', email: 'admin@next-generpsolutions.com', role: 'admin', is_active: true, tenant_id: 'default' },
  },
  {
    path: '/crm/leads',
    name: 'CRM Lead Management',
    user: { id: 'usr-counsellor', email: 'counsellor@next-generpsolutions.com', role: 'counsellor', is_active: true, tenant_id: 'default' },
  },
  {
    path: '/accounts/fees',
    name: 'Accounts & Fee Collection',
    user: { id: 'usr-accountant', email: 'accounts@next-generpsolutions.com', role: 'accountant', is_active: true, tenant_id: 'default' },
  },
  {
    path: '/accounts/approvals',
    name: 'Accounts Fee Approvals Queue',
    user: { id: 'usr-accountant', email: 'accounts@next-generpsolutions.com', role: 'accountant', is_active: true, tenant_id: 'default' },
  },
  {
    path: '/onboarding',
    name: 'Student Onboarding Command Center',
    user: { id: 'usr-onboarding-01', email: 'onboarding@next-generpsolutions.com', role: 'onboarding_team', is_active: true, tenant_id: 'default' },
  },
  {
    path: '/academics/batches',
    name: 'Academics Cohort Management',
    user: { id: 'usr-trainer-fico', email: 'vikram.fico@next-generpsolutions.com', role: 'trainer', is_active: true, tenant_id: 'default' },
  },
  {
    path: '/portal',
    name: 'Student Learning Portal',
    user: { id: 'stu-01', email: 'amit.gupta@student.next-gen.com', role: 'student', is_active: true, tenant_id: 'default' },
  },
];

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await chromium.launch({ channel: 'msedge', headless: true });
  }
}

export async function runResponsiveUiAudit() {
  console.log('='.repeat(80));
  console.log(' PHASE 8: RESPONSIVE UI AND CROSS-DEVICE AUDIT');
  console.log(' Viewports: Desktop (1920x1080), Laptop (1366x768), Tablet (768x1024), Mobile (375x667)');
  console.log('='.repeat(80));

  const browser = await launchBrowser();
  const results = [];

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n--- Auditing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);

      for (const target of PAGES_TO_TEST) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.type === 'mobile',
          hasTouch: vp.type === 'mobile' || vp.type === 'tablet',
        });

        if (target.user) {
          const cookies = createAuthSessionCookies(target.user);
          await context.addCookies(cookies);
        }

        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        const start = Date.now();
        await page.goto(`${BASE_URL}${target.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        const durationMs = Date.now() - start;

        // 1. Check Horizontal Overflow
        const overflow = await page.evaluate(() => {
          const docWidth = document.documentElement.scrollWidth;
          const winWidth = window.innerWidth;
          const bodyWidth = document.body.scrollWidth;
          return {
            hasOverflow: docWidth > winWidth + 5 || bodyWidth > winWidth + 5,
            scrollWidth: Math.max(docWidth, bodyWidth),
            viewportWidth: winWidth,
            overflowPx: Math.max(0, Math.max(docWidth, bodyWidth) - winWidth),
          };
        });

        // 2. Count interactive elements
        const buttonCount = await page.locator('button, a[href], input, select').count();

        // 3. Check for visible navigation header or mobile menu toggle
        const navVisible = await page.locator('header, nav, aside, [aria-label*="menu"], [aria-label*="sidebar"]').first().isVisible().catch(() => false);

        // 4. Check table container responsiveness
        const tableCount = await page.locator('table').count();
        let tableScrollable = true;
        if (tableCount > 0 && (vp.type === 'mobile' || vp.type === 'tablet')) {
          tableScrollable = await page.evaluate(() => {
            const tables = Array.from(document.querySelectorAll('table'));
            return tables.every((tbl) => {
              let parent = tbl.parentElement;
              while (parent && parent !== document.body) {
                const style = window.getComputedStyle(parent);
                if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
                  return true;
                }
                parent = parent.parentElement;
              }
              return false;
            });
          });
        }

        const passed = !overflow.hasOverflow && pageErrors.length === 0;

        results.push({
          viewport: vp.name,
          dimensions: `${vp.width}x${vp.height}`,
          page: target.name,
          path: target.path,
          status: passed ? 'PASSED' : overflow.hasOverflow ? 'OVERFLOW_WARN' : 'FAILED',
          overflowPx: overflow.overflowPx,
          buttonsDetected: buttonCount,
          navAccessible: navVisible,
          tablesResponsive: tableCount === 0 || tableScrollable,
          errors: pageErrors.length,
          renderMs: durationMs,
        });

        console.log(` - [${vp.name}] ${target.name} (${target.path}): ${passed ? 'PASS' : 'WARN'} | Overflow: ${overflow.overflowPx}px | Interactive: ${buttonCount} | Tables: ${tableCount}`);

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\n' + '='.repeat(80));
  console.log(' RESPONSIVE UI AUDIT SUMMARY MATRIX:');
  console.table(results);
  console.log('='.repeat(80));

  return results;
}

if (process.argv[1]?.endsWith('05-responsive-ui-e2e.mjs')) {
  runResponsiveUiAudit()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Responsive UI audit failed:', err);
      process.exit(1);
    });
}
