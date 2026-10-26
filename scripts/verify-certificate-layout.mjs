import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const output = 'docs/audits/browser-fix-2026-10-26';
const { base, remoteDatabaseEnabled } = JSON.parse(fs.readFileSync(`${output}/local-isolation.json`, 'utf8'));
assert.equal(remoteDatabaseEnabled, false);
assert.equal(base, 'http://localhost:3001');
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  await page.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  await page.goto(base + '/certificate/verify/CERT-2026-FICO-0091');
  await page.getByText('Authentic & Verified Certificate').waitFor();
  // Layout-only stress fixture: no persisted records are changed.
  await page.locator('h3.font-serif').evaluate(el => { el.textContent = 'SyntheticUnbrokenStudentName'.repeat(8); });
  await page.locator('strong.font-mono').evaluate(el => { el.textContent = 'SYNTHETIC-CERTIFICATE-'.repeat(12); });
  for (const width of [375, 768, 1366, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('h3.font-serif,strong.font-mono')].every(e => e.scrollWidth <= e.clientWidth || getComputedStyle(e).display === 'inline'));
    assert.ok(fits, `long certificate text must fit at ${width}`);
    await page.screenshot({ path: `${output}/certificate-long-text-${width}.png`, fullPage: true });
    results.push({ width, longTextFits: fits });
  }
  await page.goto(base + '/certificate/verify/CERT-2026-FICO-0091');
  await page.getByText('Authentic & Verified Certificate').waitFor();
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${output}/certificate-print.pdf`, format: 'A4', printBackground: true });
  assert.ok(fs.statSync(`${output}/certificate-print.pdf`).size > 1000);
  results.push({ printPdfGenerated: true });
  await page.emulateMedia({ media: 'screen' });
  await page.goto(base + '/certificate/verify/' + 'SYNTHETIC-INVALID-'.repeat(20));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  results.push({ invalidLongIdFits: true });
  console.log('PASS: long certificate names/IDs at four widths, invalid long ID, and A4 print artifact.');
} finally { fs.writeFileSync(`${output}/certificate-layout.json`, JSON.stringify(results, null, 2)); await browser.close(); }
