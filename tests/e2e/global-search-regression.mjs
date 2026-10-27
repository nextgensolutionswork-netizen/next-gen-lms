import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { GlobalSearch } from './components/layout/global-search';
    window.pending = [];
    window.fetch = (url, options) => new Promise(resolve => window.pending.push({url, options, resolve}));
    createRoot(document.getElementById('root')).render(<GlobalSearch />);
  ` }, bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' },
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const input = page.getByRole('searchbox', { name: 'Global search' });
  await input.fill('Alice & Bob');
  await input.press('Enter');
  await page.waitForFunction(() => window.pending.length === 1);
  assert.equal(await page.evaluate(() => window.pending[0].url), '/api/search?q=Alice%20%26%20Bob');
  await page.evaluate(() => window.pending[0].resolve({ ok: true, json: async () => ({ results: [{ id: 'one', title: 'Alice', reference: 'STU-1', kind: 'Student', href: '/students/one' }] }) }));
  await page.getByRole('link', { name: /Alice/ }).waitFor();
  assert.equal(await page.getByRole('link').getAttribute('href'), '/students/one');
  await input.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'A');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('link').count(), 0);
  await input.fill('unknown');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.evaluate(() => window.pending.at(-1).resolve({ ok: true, json: async () => ({ results: [] }) }));
  await page.getByText('No matching records found.').waitFor();
  await input.fill('broken'); await input.press('Enter');
  await page.evaluate(() => window.pending.at(-1).resolve({ ok: false, json: async () => ({ error: 'Search is unavailable. Please try again.' }) }));
  await page.getByText('Search is unavailable. Please try again.').waitFor();
  await input.fill('old'); await input.press('Enter');
  await input.fill('new');
  await page.evaluate(() => window.pending.at(-1).resolve({ ok: true, json: async () => ({ results: [{ title: 'STALE', id: 'old' }] }) }));
  assert.equal(await page.getByText('STALE').count(), 0);
  await input.fill('   '); await input.press('Enter');
  await page.getByText('Enter a name, code, email, or phone number.').waitFor();
  console.log('PASS: Enter, submit button, result link, keyboard focus, Escape, empty/error states and stale response cancellation.');
} finally { await browser.close(); }
