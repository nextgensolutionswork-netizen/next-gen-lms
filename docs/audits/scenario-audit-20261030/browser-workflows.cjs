const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { chromium } = require('playwright');
const { scratch } = JSON.parse(fs.readFileSync(path.join(__dirname, 'run-paths.json'), 'utf8').replace(/^\uFEFF/, ''));
const base = 'http://localhost:3182';
const result = { mode: 'Actual Next development server, isolated mock database and local disk storage', checks: [], errors: [], network: [] };
async function run(name, fn) { try { await fn(); result.checks.push({ name, result: 'PASS' }); } catch (e) { result.checks.push({ name, result: 'FAIL', error: e.message }); } }
(async () => {
  const health = await (await fetch(base + '/api/database/health')).json();
  result.preflight = { isLive: health.isLive, databaseProject: health.databaseProject, storageProject: health.storageProject, storageBackend: health.storageBackend, storageRoot: path.join(scratch, 'data', 'payment-proofs') };
  assert.equal(health.isLive, false); assert.equal(health.databaseProject, 'mock-sap-lms'); assert.equal(health.storageProject, 'mock-sap-lms'); assert.equal(health.storageBackend, 'local_disk_mock');
  assert.ok(!fs.existsSync(path.join(scratch, '.env.local')));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // Read repository's synthetic demo credentials in memory; never include them in evidence.
    const source = fs.readFileSync(path.join(scratch, 'lib/auth/credentials.ts'), 'utf8');
    for (const role of ['counsellor', 'accounts']) {
      const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(15000);
      await context.route('**/*', route => { const u = new URL(route.request().url()); return ['localhost','127.0.0.1'].includes(u.hostname) && u.port === '3182' ? route.continue() : route.abort(); });
      page.on('pageerror', e => result.errors.push({ role, error: e.message }));
      page.on('console', m => { if(m.type()==='error') result.errors.push({role, console:m.text().slice(0,300)}); });
      page.on('response', async r => { if(r.status()>=400) { let body=''; if(new URL(r.url()).pathname.startsWith('/api/')) { try { const j=await r.json(); body=String(j.error||'').slice(0,300); } catch {} } result.network.push({role,path:new URL(r.url()).pathname,status:r.status(),error:body}); } });
      const email = `${role}@next-generpsolutions.com`;
      const match = source.match(new RegExp("'"+email.replaceAll('.', '\\.')+"': \\['([^']+)'")); assert.ok(match);
      await run(`${role}: real login and role landing`, async () => {
        await page.goto(base + '/login'); await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(match[1]);
        await page.locator('button[type=submit]').click(); await page.waitForURL(u=>!u.pathname.startsWith('/login'), {timeout:45000});
        await page.screenshot({path:path.join(__dirname,`${role}-landing.png`),fullPage:true});
      });
      await run(`${role}: reload retains authenticated session`, async () => { await page.reload(); await page.waitForTimeout(1200); assert.ok(!new URL(page.url()).pathname.startsWith('/login')); });
      if(role==='counsellor') {
        await run('counsellor: open CRM and required-field validation', async () => {
          await page.goto(base+'/crm/leads'); await page.getByRole('button',{name:'New Lead',exact:true}).click(); await page.getByRole('button',{name:'Create Lead',exact:true}).click();
          assert.ok(await page.locator('input:invalid').count()>0);
        });
        await run('counsellor: save synthetic lead and reload', async () => {
          await page.getByPlaceholder('e.g. Ramesh Kumar').fill('Synthetic Scenario Audit'); await page.getByPlaceholder('+91 98765 43210').fill('9990001234'); await page.getByPlaceholder('ramesh@example.com').fill('scenario@example.invalid');
          await page.getByRole('button',{name:'Create Lead',exact:true}).click(); await page.waitForTimeout(1000); result.crmSave={alerts:await page.getByRole('alert').allTextContents(), visibleBeforeReload:await page.getByText('Synthetic Scenario Audit',{exact:true}).count()}; await page.screenshot({path:path.join(__dirname,'crm-after-submit.png'),fullPage:true}); await page.getByText('Synthetic Scenario Audit',{exact:true}).waitFor();
          await page.reload(); await page.getByText('Synthetic Scenario Audit',{exact:true}).waitFor(); await page.screenshot({path:path.join(__dirname,'crm-reloaded.png'),fullPage:true});
        });
      } else {
        await run('accountant: open approvals and navigate back', async () => { await page.goto(base+'/accounts/approvals'); await page.getByRole('heading').first().waitFor(); await page.goto(base+'/accounts/fees'); await page.goBack(); await page.waitForURL('**/accounts/approvals'); assert.equal(new URL(page.url()).pathname,'/accounts/approvals'); await page.screenshot({path:path.join(__dirname,'accountant-approvals.png'),fullPage:true}); });
      }
      await run(`${role}: expired cookies deny payment API`, async () => { await context.clearCookies(); const r=await context.request.get(base+'/api/fees/payments'); assert.equal(r.status(),401); });
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{result.fatal=e.message;process.exitCode=1}).finally(()=>{fs.writeFileSync(path.join(__dirname,'browser-workflows-recheck.json'),JSON.stringify(result,null,2)); if(result.checks.some(c=>c.result==='FAIL'))process.exitCode=1; console.log(JSON.stringify(result,null,2));});
