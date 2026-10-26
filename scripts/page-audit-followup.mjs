import fs from 'node:fs';
import { chromium } from 'playwright';
const base = 'http://localhost:3000';
const output = 'docs/audits/page-browser-2026-10-26';
const account = JSON.parse(fs.readFileSync('.local-role-logins.json', 'utf8')).find(a => a.role === 'super_admin');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const findings = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + '/login');
  await page.locator('input[type=email]').fill(account.email);
  await page.locator('input[type=password]').fill(account.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000 });
  await page.goto(base + '/accounts/receipts');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  const link = page.locator('main a[href^="/accounts/receipts/"]').first();
  const href = await link.getAttribute('href');
  await link.click();
  await page.waitForURL(base + href, { timeout: 30000 });
  const receiptPage = page;
  await receiptPage.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  findings.push({ check: 'Receipt via registry link', path: href, finalPath: new URL(receiptPage.url()).pathname, headings: await receiptPage.locator('main h1,main h2,main h3').allTextContents() });
  await receiptPage.reload({ waitUntil: 'domcontentloaded' });
  await receiptPage.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  findings.push({ check: 'Same receipt after reload', headings: await receiptPage.locator('main h1,main h2,main h3').allTextContents() });
  await page.goto(base + '/students');
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  const studentLink = page.locator('main a[href^="/students/"]').first();
  const studentHref = await studentLink.getAttribute('href');
  await studentLink.click();
  await page.waitForURL(base + studentHref, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  findings.push({ check: 'Student via directory link', path: studentHref, notFound: await page.getByText('Student profile not found.', { exact: true }).isVisible(), headings: await page.locator('main h1,main h2,main h3').allTextContents() });
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  findings.push({ check: 'Same student after reload', notFound: await page.getByText('Student profile not found.', { exact: true }).isVisible(), headings: await page.locator('main h1,main h2,main h3').allTextContents() });
  for (const route of ['/dashboard', '/academics/batches', '/crm/leads']) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(base + route, { waitUntil: 'domcontentloaded' });
    await page.locator('aside').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    findings.push({ check: 'Mobile workspace geometry', route, ...await page.evaluate(() => {
      const main = document.querySelector('main'), sidebar = document.querySelector('aside');
      return { viewport: innerWidth, sidebarWidth: sidebar?.getBoundingClientRect().width, mainWidth: main?.getBoundingClientRect().width, mainScrollWidth: main?.scrollWidth, mainClientWidth: main?.clientWidth };
    }) });
  }
} finally {
  fs.writeFileSync(`${output}/followup.json`, JSON.stringify(findings, null, 2));
  console.log(JSON.stringify(findings, null, 2));
  await browser.close();
}
