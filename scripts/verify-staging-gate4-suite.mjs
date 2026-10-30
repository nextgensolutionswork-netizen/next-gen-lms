import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const outputDir = path.resolve('docs/audits/staging-verification-2026-10-26/gate4');
const screenshotsDir = path.join(outputDir, 'screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

const widths = (process.env.AUDIT_WIDTHS || '375,768,1366,1440').split(',').map(Number);

const accounts = {
  super_admin: {
    email: 'staging.superadmin@next-gen-staging.local',
    password: 'StagingPass#2026',
  },
  student: {
    email: 'staging.student.1@next-gen-staging.local',
    password: 'StagingPass#2026',
  },
};

function discover(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? discover(path.join(dir, e.name))
      : e.name === 'page.tsx'
      ? [path.join(dir, e.name)]
      : []
  );
}

const routes = discover('app')
  .map(
    (file) =>
      '/' +
      path
        .dirname(file)
        .split(path.sep)
        .slice(1)
        .filter((p) => !p.startsWith('('))
        .join('/')
  )
  .sort();

const refs = {
  '/certificate/verify/[id]': 'CERT-2026-FICO-0091',
  '/students/[id]': '52000000-0000-0000-0000-000000000001',
  '/accounts/receipts/[id]': 'REC-2026-000001',
};

const results = [];
const logins = [];
const contexts = new Map();

async function runGate4Sweep() {
  console.log('='.repeat(80));
  console.log(' RELEASE GATE 4: 4-WIDTH RESPONSIVE ROUTE SWEEP ACROSS STAGING');
  console.log(` Target Server:  ${BASE_URL} (Supabase Staging neiccpnxftfmmwnvtgdy)`);
  console.log(` Viewport Widths: ${widths.join(', ')} px`);
  console.log(` Routes to Check: ${routes.length}`);
  console.log('='.repeat(80));

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  async function getContextForRole(role) {
    if (contexts.has(role)) return contexts.get(role);

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.set(role, context);

    if (role === 'public') return context;

    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    console.log(`Authenticating ${role} session (${accounts[role].email})...`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('input[type=email]').fill(accounts[role].email);
    await page.locator('input[type=password]').fill(accounts[role].password);
    await page.locator('button[type=submit]').click();

    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    logins.push({ role, success: true, finalUrl: page.url() });
    console.log(`✓ Authenticated ${role} -> ${page.url()}`);
    await page.close();

    return context;
  }

  try {
    for (const route of routes) {
      const role =
        ['/', '/login'].includes(route) || route.startsWith('/certificate/verify')
          ? 'public'
          : route === '/portal'
          ? 'student'
          : 'super_admin';

      const context = await getContextForRole(role);
      const target = route.replace('[id]', refs[route] || 'missing-record');
      const page = await context.newPage();
      page.setDefaultTimeout(20000);

      const entry = {
        route,
        target,
        role,
        httpStatus: null,
        finalPath: null,
        errors: [],
        viewports: [],
        pass: false,
      };

      page.on('pageerror', (err) => entry.errors.push(err.message));

      try {
        const response = await page.goto(`${BASE_URL}${target}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });

        if (route === '/accounts/installments') {
          await page.waitForURL('**/accounts/fees', { timeout: 15000 }).catch(() => {});
        }

        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        // Wait for any initial record loading banners to resolve
        await page
          .getByText(/^(Loading student profile|Loading authorized receipt|Loading your workspace)/)
          .waitFor({ state: 'hidden', timeout: 10000 })
          .catch(() => {});

        entry.httpStatus = response ? response.status() : null;
        entry.finalPath = new URL(page.url()).pathname;

        const bodyText = await page.locator('body').innerText();
        const hasUnexpectedNotFound =
          (bodyText.includes('Student profile not found') && target.includes('52000000')) ||
          (bodyText.includes('Receipt Not Found') && target.includes('REC-2026-000001'));

        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(150);

          const measurement = await page.evaluate(() => {
            const main = document.querySelector('main');
            const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
            return {
              documentWidth: document.documentElement.scrollWidth,
              windowInnerWidth: window.innerWidth,
              overflow,
              mainWidth: main?.clientWidth || null,
              mainScrollWidth: main?.scrollWidth || null,
            };
          });

          let drawerWorks = null;
          if (width < 1024) {
            const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
            if (await toggle.isVisible()) {
              await toggle.click();
              const dialog = page.getByRole('dialog', { name: 'Main navigation' });
              const opened = await dialog.isVisible();
              await page.keyboard.press('Escape');
              await page.waitForTimeout(100);
              const closed = !(await dialog.isVisible());
              drawerWorks = opened && closed;
            }
          }

          const screenshotName = `${route.replace(/[^a-z0-9]/gi, '_') || 'root'}-${width}.png`;
          await page.screenshot({
            path: path.join(screenshotsDir, screenshotName),
            timeout: 15000,
            animations: 'disabled',
          });

          entry.viewports.push({
            width,
            ...measurement,
            drawerWorks,
            screenshot: screenshotName,
          });
        }

        const expectedPath =
          route === '/'
            ? '/login'
            : route === '/accounts/installments'
            ? '/accounts/fees'
            : target;

        const allViewportsPass = entry.viewports.every(
          (v) => !v.overflow && v.drawerWorks !== false
        );

        entry.pass =
          entry.httpStatus !== null &&
          entry.httpStatus < 400 &&
          entry.finalPath === expectedPath &&
          !hasUnexpectedNotFound &&
          entry.errors.length === 0 &&
          allViewportsPass;

        console.log(
          `${entry.pass ? '✓ PASS' : '✗ FAIL'} [${role}]: ${route} -> ${entry.finalPath} (HTTP ${entry.httpStatus})`
        );
      } catch (err) {
        entry.pass = false;
        entry.errors.push(err.message);
        console.error(`✗ FAIL: ${route} - ${err.message}`);
      } finally {
        results.push(entry);
        await page.close();
      }
    }
  } finally {
    fs.writeFileSync(
      path.join(outputDir, 'gate4-route-sweep-evidence.json'),
      JSON.stringify({ baseUrl: BASE_URL, widths, logins, results }, null, 2)
    );
    await browser.close();
  }

  const passedRoutes = results.filter((r) => r.pass).length;
  console.log('\n' + '='.repeat(80));
  console.log(` GATE 4 ROUTE SWEEP SUMMARY: ${passedRoutes} / ${results.length} ROUTES PASSED`);
  console.log(` TOTAL VIEWPORT CHECKS:       ${passedRoutes * widths.length} / ${results.length * widths.length} PASSED`);
  console.log('='.repeat(80));

  if (passedRoutes !== results.length) {
    process.exit(1);
  }
}

runGate4Sweep().catch((err) => {
  console.error('GATE 4 FATAL ERROR:', err);
  process.exit(1);
});
