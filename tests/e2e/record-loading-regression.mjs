import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {useRecordLoad} from './lib/hooks/use-record-load';
    window.pending = [];
    function App() {
      const [id, setId] = React.useState('one');
      window.selectRecord = setId;
      const load = React.useCallback(signal => new Promise((resolve, reject) => window.pending.push({id, signal, resolve, reject})), [id]);
      const result = useRecordLoad(id, load);
      return <><p id="state">{result.status}</p><p id="record">{result.data?.name}</p><button onClick={result.reload}>Retry</button></>;
    }
    createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
  ` },
  bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' },
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.pending.length > 0);
  assert.equal(await page.locator('#state').textContent(), 'loading');
  await page.evaluate(() => window.pending.at(-1).reject(new Error('Temporary network failure')));
  await page.waitForFunction(() => document.querySelector('#state').textContent === 'error');
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.waitForFunction(() => document.querySelector('#state').textContent === 'loading');
  await page.evaluate(() => window.pending.at(-1).resolve({ name: 'Authorized record one' }));
  await page.waitForFunction(() => document.querySelector('#record').textContent === 'Authorized record one');
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.evaluate(() => window.selectRecord('two'));
  await page.waitForFunction(() => window.pending.at(-1).id === 'two');
  assert.equal(await page.locator('#record').textContent(), '');
  await page.evaluate(() => window.pending.filter(p => p.id === 'one').forEach(p => p.resolve({ name: 'STALE PRIVATE RECORD' })));
  assert.equal(await page.locator('#state').textContent(), 'loading');
  assert.equal(await page.locator('#record').textContent(), '');
  await page.evaluate(() => window.pending.at(-1).resolve(null));
  await page.waitForFunction(() => document.querySelector('#state').textContent === 'missing');
  assert.equal(await page.evaluate(() => window.pending.filter(p => p.id === 'one').every(p => p.signal.aborted)), true);
  assert.deepEqual(errors, []);
  console.log('PASS: loading, retry, confirmed absence, cancellation, StrictMode and stale private response rejection.');
} finally { await browser.close(); }
