import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const output = 'docs/audits/browser-fix-2026-10-26';
fs.mkdirSync(output, { recursive: true });
const widths = (process.env.AUDIT_WIDTHS || '375,768,1366,1440').split(',').map(Number);
const isolation = JSON.parse(fs.readFileSync(`${output}/local-isolation.json`, 'utf8'));
if (base !== isolation.base || isolation.remoteDatabaseEnabled) throw new Error('This runner requires the independently isolated local fixture. Use a separately verified runner for Supabase staging.');
const accounts = {
  super_admin: { email: 'superadmin@next-generpsolutions.com', password: 'AdminPass#2026' },
  student: { email: 'amit.gupta@student.next-gen.com', password: 'StudentPass#2026' },
};
function discover(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? discover(path.join(dir, e.name)) : e.name === 'page.tsx' ? [path.join(dir, e.name)] : []);
}
const routes = discover('app').map(file => '/' + path.dirname(file).split(path.sep).slice(1).filter(p => !p.startsWith('(')).join('/')).sort();
const results = [], logins = [], contexts = new Map();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const refs = { '/certificate/verify/[id]': 'CERT-2026-FICO-0091' };
const save = () => fs.writeFileSync(`${output}/routes-${widths.join('-')}${process.env.AUDIT_ROUTES ? '-targeted' : ''}.json`, JSON.stringify({ base, mode: isolation.mode, logins, results }, null, 2));
async function contextFor(role) {
  if (contexts.has(role)) return contexts.get(role);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  contexts.set(role, context);
  if (role === 'public') return context;
  const page = await context.newPage();
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('input[type=email]').fill(accounts[role].email);
  await page.locator('input[type=password]').fill(accounts[role].password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  logins.push({ role, success: true, path: new URL(page.url()).pathname });
  await page.close();
  return context;
}
try {
  for (const route of routes.filter(r => !process.env.AUDIT_ROUTES || process.env.AUDIT_ROUTES.split(',').includes(r))) {
    const role = ['/', '/login'].includes(route) || route.startsWith('/certificate/verify') ? 'public' : route === '/portal' ? 'student' : 'super_admin';
    const context = await contextFor(role);
    const target = route.replace('[id]', refs[route] || 'missing-audit-record');
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    console.log(`Checking ${route} (${role})`);
    const entry = { route, target, role, errors: [], viewports: [] };
    page.on('pageerror', error => entry.errors.push(error.message));
    try {
      const response = await page.goto(base + target, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (route === '/accounts/installments') await page.waitForURL('**/accounts/fees', { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.getByText(/^(Loading student profile|Loading authorized receipt|Loading your workspace)/).waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
      entry.http = response.status();
      entry.finalPath = new URL(page.url()).pathname;
      entry.headings = await page.locator('h1,h2,h3').allTextContents();
      const body = await page.locator('body').innerText();
      entry.notFound = /Receipt Not Found|Student profile not found/.test(body);
      entry.alerts = await page.locator('[role=alert]').allTextContents();
      entry.session = await page.evaluate(() => ({ storedRole: JSON.parse(localStorage.getItem('next_gen_auth_user') || 'null')?.role || null, header: document.querySelector('header')?.innerText }));
      for (const [pattern, prefix] of [['/students/[id]', '/students/'], ['/accounts/receipts/[id]', '/accounts/receipts/']]) {
        const candidates = page.locator(`main a[href^="${prefix}"]`);
        const href = await candidates.count() ? await candidates.first().getAttribute('href') : null;
        if (href) refs[pattern] = href.slice(prefix.length).split(/[?#]/)[0];
      }
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const measurement = await page.evaluate(() => {
          const main = document.querySelector('main');
          const overflow = document.documentElement.scrollWidth > innerWidth + 1;
          const candidates = Array.from(document.querySelectorAll('body *')).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.right > innerWidth + 1 && !el.closest('dialog:not([open])') && !el.closest('table');
          }).slice(-12).map(el => ({ tag: el.tagName, class: el.className?.toString().slice(0, 150), right: Math.round(el.getBoundingClientRect().right) }));
          return { documentWidth: document.documentElement.scrollWidth, overflow, mainWidth: main?.clientWidth, mainScrollWidth: main?.scrollWidth, candidates: overflow ? candidates : [] };
        });
        let drawer = null;
        const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
        if (await toggle.isVisible()) {
          await toggle.click();
          drawer = await page.getByRole('dialog', { name: 'Main navigation' }).isVisible();
          await page.keyboard.press('Escape');
          drawer = drawer && !(await page.getByRole('dialog', { name: 'Main navigation' }).isVisible());
        }
        const filename = `${route.replace(/[^a-z0-9]/gi, '_') || 'root'}-${width}.png`;
        await page.screenshot({ path: path.join(output, filename), timeout: 20000, animations: 'disabled' });
        entry.viewports.push({ width, ...measurement, drawer, screenshot: filename });
      }
      const expected = route === '/' ? '/login' : route === '/accounts/installments' ? '/accounts/fees' : target;
      entry.pass = entry.http < 400 && entry.finalPath === expected && !entry.notFound && !entry.errors.length && !entry.alerts.some(Boolean) && entry.viewports.every(v => !v.overflow && v.drawer !== false);
    } catch (error) { entry.pass = false; entry.errors.push(error.message); }
    finally { results.push(entry); save(); console.log(`${route}: ${entry.pass ? 'PASS' : 'FAIL'}`); await page.close(); }
  }
} finally { save(); await browser.close(); }
