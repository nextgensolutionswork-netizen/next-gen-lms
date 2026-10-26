import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const output = 'docs/audits/page-browser-2026-10-26';
fs.mkdirSync(output, { recursive: true });
const accounts = JSON.parse(fs.readFileSync('.local-role-logins.json', 'utf8'));
const results = [];
function discover(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? discover(file) : entry.name === 'page.tsx' ? [file] : [];
  });
}
const routes = discover('app').map(file => '/' + path.dirname(file).split(path.sep).slice(1).filter(part => !part.startsWith('(')).join('/')).sort();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = new Map();
const auth = [];
async function contextFor(role) {
  if (contexts.has(role)) return contexts.get(role);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  contexts.set(role, context);
  if (role === 'public') return context;
  const account = accounts.find(item => item.role === role);
  if (!account) { auth.push({ role, success: false, reason: 'No configured test account' }); return context; }
  const page = await context.newPage();
  try {
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('input[type="email"]').first().fill(account.email);
    await page.locator('input[type="password"]').first().fill(account.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000 });
    auth.push({ role, success: true, landing: new URL(page.url()).pathname });
  } catch {
    auth.push({ role, success: false, reason: 'Login did not reach an authenticated page' });
  } finally { await page.close(); }
  return context;
}
const ids = {};
function save() { fs.writeFileSync(`${output}/results.json`, JSON.stringify({ base, auth, results }, null, 2)); }
try {
  for (const route of routes) {
    const role = route === '/' || route === '/login' || route.startsWith('/certificate/verify') ? 'public' : route === '/portal' ? 'student' : 'super_admin';
    const context = await contextFor(role);
    const target = route.replace('[id]', ids[route] || 'audit-missing-record');
    const result = { route, target, role, status: 'PENDING', errors: [], apiFailures: [], interactions: [] };
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && response.url().startsWith(`${base}/api/`)) result.apiFailures.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    try {
      const started = Date.now();
      const response = await page.goto(base + target, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      result.loadMs = Date.now() - started;
      result.httpStatus = response?.status();
      result.finalPath = new URL(page.url()).pathname;
      result.title = await page.title();
      if (role !== 'public' && result.finalPath.startsWith('/login')) {
        result.status = 'BLOCKED_LOGIN';
      } else if (result.finalPath !== target && route !== '/') {
        result.status = 'REDIRECTED';
      } else {
        const body = await page.locator('body').innerText();
        result.headings = await page.locator('h1,h2,h3').allTextContents();
        result.visibleButtons = await page.locator('button:visible').count();
        result.visibleForms = await page.locator('form:visible').count();
        result.status = result.httpStatus >= 400 || /Application error:|Internal Server Error|Maximum update depth exceeded/.test(body) || result.errors.length ? 'FAIL' : 'PASS_SMOKE';
        if (route.includes('[id]') && ids[route] && /Receipt Not Found|Student profile not found/i.test(body)) {
          result.status = 'ISSUES';
          result.contentWarning = 'A discovered record link rendered a not-found state';
        }
        if (route.includes('[id]') && !ids[route]) result.recordCoverage = 'Missing-record state only';
        const links = await page.locator('a[href]').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
        for (const [pattern, prefix] of [['/students/[id]', '/students/'], ['/accounts/receipts/[id]', '/accounts/receipts/'], ['/certificate/verify/[id]', '/certificate/verify/']]) {
          const found = links.find(href => href?.startsWith(prefix) && href.length > prefix.length);
          if (found) ids[pattern] = found.slice(prefix.length).split(/[?#]/)[0];
        }
        const main = page.locator('main').first();
        const search = main.locator('input[placeholder*="Search" i], input[type="search"]').first();
        if (await search.isVisible().catch(() => false)) {
          const previous = await search.inputValue();
          await search.fill('audit-no-match-726194');
          await page.waitForTimeout(500);
          result.interactions.push({ control: 'Search', outcome: 'Accepts input; cleared after check' });
          await search.fill(previous);
          await page.waitForTimeout(300);
        }
        result.desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        const slug = route.replace(/[^a-z0-9]/gi, '_') || 'root';
        await page.screenshot({ path: `${output}/${slug}-desktop.png` });
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(300);
        result.mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        result.mobileMain = await page.evaluate(() => {
          const main = document.querySelector('main');
          return main ? { width: main.clientWidth, scrollWidth: main.scrollWidth } : null;
        });
        await page.screenshot({ path: `${output}/${slug}-mobile.png` });
        if (result.apiFailures.length || result.mobileOverflow || result.desktopOverflow || (result.mobileMain && result.mobileMain.scrollWidth > result.mobileMain.width + 1)) result.status = result.status === 'FAIL' ? 'FAIL' : 'ISSUES';
      }
    } catch (error) {
      result.status = 'FAIL';
      result.errors.push(error.message);
    } finally {
      if (result.errors.length && result.status === 'PASS_SMOKE') result.status = 'FAIL';
      results.push(result);
      save();
      console.log(`${route}: ${result.status} (HTTP ${result.httpStatus ?? 'unknown'})`);
      await page.close();
    }
  }
} finally { save(); await browser.close(); }
