import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const output = 'docs/audits/browser-fix-2026-10-26';
const isolation = JSON.parse(fs.readFileSync(`${output}/local-isolation.json`, 'utf8'));
const base = isolation.base;
assert.equal(base, 'http://localhost:3001');
assert.equal(isolation.remoteDatabaseEnabled, false);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
async function context(email, password) {
  const c = await browser.newContext({ viewport: { width: 375, height: 900 } });
  await c.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  if (email) {
    const response = await c.request.post(base + '/api/auth/login', { form: { email, password }, headers: { origin: base }, maxRedirects: 0 });
    assert.equal(response.status(), 303);
    assert.ok(!response.headers().location.includes('/login'));
  }
  return c;
}
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); console.log(`PASS: ${name}`); }
  catch (error) { results.push({ name, pass: false, error: error.message }); console.log(`FAIL: ${name}: ${error.message}`); }
  fs.writeFileSync(`${output}/detail-navigation.json`, JSON.stringify({ mode: isolation.mode, results }, null, 2));
}
try {
  const admin = await context('superadmin@next-generpsolutions.com', 'AdminPass#2026');
  const page = await admin.newPage();
  page.setDefaultTimeout(30000);
  for (const [directory, id, ready] of [
    ['/students', 'stu-01', 'Academic & Enrollment Snapshot'],
    ['/accounts/receipts', 'rcpt-01', 'REC-2026-0001'],
  ]) {
    await check(`${directory}: direct, refresh, directory link, back and forward (3 cycles)`, async () => {
      for (let i = 0; i < 3; i++) {
        await page.goto(`${base}${directory}/${id}`);
        await page.getByText(ready, { exact: true }).first().waitFor();
        await page.reload();
        await page.getByText(ready, { exact: true }).first().waitFor();
        await page.goto(base + directory);
        await page.locator(`main a[href="${directory}/${id}"]`).first().click();
        await page.waitForURL(`${base}${directory}/${id}`);
        await page.getByText(ready, { exact: true }).first().waitFor();
        await page.goBack();
        await page.waitForURL(base + directory);
        await page.goForward();
        await page.getByText(ready, { exact: true }).first().waitFor();
      }
    });
    await check(`${directory}: confirmed invalid ID`, async () => {
      await page.goto(`${base}${directory}/synthetic-nonexistent-record`);
      await page.getByText(directory === '/students' ? 'Student profile not found.' : 'Receipt Not Found', { exact: true }).waitFor();
      assert.equal(await page.getByText(ready, { exact: true }).count(), 0);
    });
  }
  await check('Receipt transport failure shows retry, never Not Found or first receipt', async () => {
    await page.route('**/api/fees/receipts', r => r.fulfill({ status: 503, json: { success: false } }));
    await page.goto(base + '/accounts/receipts/rcpt-01');
    await page.getByRole('button', { name: 'Retry loading receipt' }).waitFor();
    assert.equal(await page.getByText('Receipt Not Found', { exact: true }).count(), 0);
    await page.unroute('**/api/fees/receipts');
    await page.getByRole('button', { name: 'Retry loading receipt' }).click();
    await page.getByText('REC-2026-0001', { exact: true }).first().waitFor();
  });
  await check('Anonymous receipt API and detail access blocked', async () => {
    const guest = await context();
    const response = await guest.request.get(base + '/api/fees/receipts');
    assert.ok([401, 403].includes(response.status()));
    const p = await guest.newPage();
    await p.goto(base + '/accounts/receipts/rcpt-01');
    assert.equal(new URL(p.url()).pathname, '/login');
    await guest.close();
  });
  await check('Synthetic student server-form login, portal and receipt ownership isolation', async () => {
    const student = await context('amit.gupta@student.next-gen.com', 'StudentPass#2026');
    const p = await student.newPage();
    await p.goto(base + '/portal');
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    assert.equal(new URL(p.url()).pathname, '/portal');
    const response = await student.request.get(base + '/api/fees/receipts');
    assert.equal(response.status(), 200);
    const { snapshot } = await response.json();
    assert.ok(snapshot.receipts.length > 0);
    assert.ok(snapshot.receipts.every(r => r.student_id === 'stu-01'));
    const other = (await (await admin.request.get(base + '/api/fees/receipts')).json()).snapshot.receipts.find(r => r.student_id !== 'stu-01');
    assert.ok(other, 'fixture must include another student receipt');
    await p.goto(`${base}/accounts/receipts/${other.id}`);
    await p.getByText('Receipt Not Found', { exact: true }).waitFor();
    assert.equal(await p.getByText(other.receipt_number, { exact: true }).count(), 0);
    await student.close();
  });
} finally { await browser.close(); }
if (results.some(r => !r.pass)) process.exitCode = 1;
