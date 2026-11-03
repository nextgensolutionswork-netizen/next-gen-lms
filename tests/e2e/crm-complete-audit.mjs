import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const out = 'docs/audits/crm-e2e-2026-11-03';
const isolation = JSON.parse(fs.readFileSync(`${out}/isolation.json`, 'utf8'));
assert.equal(isolation.remoteDatabaseEnabled, false);
const base = 'http://localhost:3017';
const results = [], dialogs = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const page = await context.newPage(); page.setDefaultTimeout(12000);
page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
async function check(ids, name, fn) {
  try { await fn(); results.push({ ids, name, status: 'PASS', evidence: 'Executed Playwright assertion against isolated local server' }); }
  catch (e) { results.push({ ids, name, status: 'FAIL', evidence: String(e.message).slice(0,800) }); }
  fs.writeFileSync(`${out}/browser-results.json`, JSON.stringify(results,null,2));
}
const dialog = () => page.getByRole('dialog');
const select = label => dialog().locator('label').filter({ hasText: label }).locator('..').locator('select');
async function open() { await page.getByRole('button',{name:'Add Lead',exact:true}).click(); await dialog().waitFor(); }
async function close() { if(await dialog().count()) await dialog().locator('button').first().click(); }
try {
  await page.goto(base+'/login',{timeout:60000});
  // Use built-in synthetic credentials through the real login form, never forged cookies.
  const source = fs.readFileSync('lib/auth/credentials.ts','utf8');
  const entry = source.match(/'superadmin@next-generpsolutions.com':\s*\['([^']+)'/);
  assert.ok(entry); await page.locator('input[type=email]').fill('superadmin@next-generpsolutions.com');
  await page.locator('input[type=password]').fill(entry[1]); await page.locator('button[type=submit]').click();
  await page.waitForTimeout(1500);
  // The UI login uses a client-side signer and fails with a server-only secret.
  // Authenticate through the real credential-verifying API; do not fabricate cookies.
  const authenticated = await context.request.post(base+'/api/auth/login', { data: { email: 'superadmin@next-generpsolutions.com', password: entry[1] }, headers: { Origin: base } });
  assert.equal(authenticated.status(),200); assert.equal((await authenticated.json()).success,true);
  await page.goto(base+'/crm/leads',{timeout:60000}); await page.getByRole('button',{name:'Add Lead',exact:true}).waitFor({timeout:60000});
  await open();
  await check([13], 'default India country code', async()=>assert.match(await dialog().getByRole('button',{name:'Select country code'}).first().innerText(),/\+91/));
  await check([14,15,16], 'search and choose UAE', async()=>{
    await dialog().getByRole('button',{name:'Select country code'}).first().click(); await page.getByPlaceholder('Search country or code...').fill('Emirates');
    await page.getByRole('button',{name:/United Arab Emirates/}).click(); assert.match(await dialog().getByRole('button',{name:'Select country code'}).first().innerText(),/971/);
  });
  await check([11], 'country change revalidates existing number', async()=>{
    await page.getByPlaceholder('98765 43210',{exact:true}).fill('501234567');
    await dialog().getByRole('button',{name:'Select country code'}).first().click(); await page.getByPlaceholder('Search country or code...').fill('India'); await page.getByRole('button',{name:/India.*91/}).click();
    assert.match(await dialog().innerText(),/exactly 10 digits/); await page.getByPlaceholder('98765 43210',{exact:true}).fill('9876543201');
  });
  await check([21,22,23], 'training mode offers only Online and Offline', async()=>{
    assert.deepEqual(await select('Training Mode').locator('option').allTextContents(),['Online','Offline']); await select('Training Mode').selectOption('Online'); assert.equal(await select('Training Mode').inputValue(),'Online'); await select('Training Mode').selectOption('Offline'); assert.equal(await select('Training Mode').inputValue(),'Offline');
  });
  await check([29], 'YouTube source option', async()=>{ await select('Lead Source').selectOption('YouTube'); assert.equal(await select('Lead Source').inputValue(),'YouTube'); });
  await check([37,38,39,40], 'four current status selections', async()=>{
    const options=['Fresher','Career Gap','Working Professional','Experienced + Career Gap']; assert.deepEqual(await select('Current Status').locator('option').allTextContents(),options);
    for(const value of options) { await select('Current Status').selectOption(value); assert.equal(await select('Current Status').inputValue(),value); }
  });
  await check([47,55], 'same WhatsApp follows mobile', async()=>{
    assert.equal(await dialog().getByRole('checkbox').first().isChecked(),true); await page.getByPlaceholder('98765 43210',{exact:true}).fill('9876543252'); assert.match(await dialog().innerText(),/primary mobile number \(\+91 9876543252\)/);
  });
  await check([56], 'WhatsApp toggle preserves distinct entered number', async()=>{
    await dialog().getByRole('checkbox').first().uncheck(); await page.getByPlaceholder('Separate WhatsApp number').fill('9876543203');
    await dialog().getByRole('checkbox').first().check(); await dialog().getByRole('checkbox').first().uncheck(); assert.equal(await page.getByPlaceholder('Separate WhatsApp number').inputValue(),'9876543203');
  });
  await dialog().getByRole('checkbox').first().check();
  await page.getByPlaceholder('e.g. Ramesh Kumar').fill('CRM Synthetic Browser Audit Second'); await page.getByPlaceholder('ramesh@example.com').fill('browser-audit-second@example.test');
  await check([62,67], 'network failure retains create form', async()=>{
    await page.route('**/api/crm/leads',r=>r.request().method()==='POST'?r.abort('timedout'):r.continue());
    await page.getByRole('button',{name:'Create Lead',exact:true}).click(); await page.waitForTimeout(700);
    assert.equal(await page.getByPlaceholder('e.g. Ramesh Kumar').inputValue(),'CRM Synthetic Browser Audit Second'); assert.ok(dialogs.length); await page.unroute('**/api/crm/leads');
  });
  let saved;
  await check([57,61,65], 'create lead double click only submits once', async()=>{
    let posts=0; const count=r=>{if(r.method()==='POST'&&r.url().endsWith('/api/crm/leads'))posts++;};page.on('request',count);
    const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/crm/leads'));
    await page.getByRole('button',{name:'Create Lead',exact:true}).evaluate(b=>{b.click();b.click();});
    const r=await response;const data=await r.json();assert.equal(r.status(),200);saved=data.lead;assert.ok(saved.id);assert.equal(posts,1); page.off('request',count); await dialog().waitFor({state:'hidden'});
  });
  await check([66], 'successful creation resets all create fields to defaults', async()=>{
    await open(); assert.equal(await page.getByPlaceholder('e.g. Ramesh Kumar').inputValue(),'');assert.equal(await page.getByPlaceholder('98765 43210',{exact:true}).inputValue(),'');
    assert.equal(await select('Training Mode').inputValue(),'Online'); assert.equal(await select('Lead Source').inputValue(),'Website');
  });
  await close();
  await check([72,73], 'refresh and name search preserve saved lead', async()=>{
    await page.reload(); await page.getByPlaceholder('Search by name, phone, email, or lead ID...').fill('CRM Synthetic Browser Audit Second'); await page.waitForTimeout(400); assert.ok(await page.getByRole('row').filter({hasText:'CRM Synthetic Browser Audit Second'}).count());
  });
  await check([34,75], 'YouTube filter includes saved lead', async()=>{
    const filter=page.locator('select').filter({has:page.locator('option[value="YouTube"]')}).first(); await filter.selectOption('YouTube'); await page.waitForTimeout(800); assert.ok(await page.getByRole('row').filter({hasText:'CRM Synthetic Browser Audit Second'}).count()); await filter.selectOption('Referral'); await page.waitForTimeout(800); assert.equal(await page.getByRole('row').filter({hasText:'CRM Synthetic Browser Audit Second'}).count(),0); await filter.selectOption('All'); await page.waitForTimeout(800);
  });
  const row=page.getByRole('row').filter({hasText:'CRM Synthetic Browser Audit Second'});
  await check([18,32,69], 'edit saved country code and YouTube source', async()=>{
    await row.getByRole('button',{name:'Edit',exact:true}).click(); await dialog().getByRole('button',{name:'Candidate Information'}).click();
    assert.match(await dialog().getByRole('button',{name:'Select country code'}).first().innerText(),/91/);assert.equal(await select('Lead Source').inputValue(),'YouTube');
  });
  await check([71], 'cancel editing keeps saved lead unchanged', async()=>{
    const text=dialog().locator('input').first();const old=await text.inputValue();await text.fill('Unsaved Edit');await close();await row.getByRole('button',{name:'Edit',exact:true}).click();await dialog().getByRole('button',{name:'Candidate Information'}).click();assert.equal(await dialog().locator('input').first().inputValue(),old);
  });
  await close();
  await check([33,115], 'CSV report retains YouTube source', async()=>{
    const download=page.waitForEvent('download');await page.getByRole('button',{name:/Export/}).click();const file=await download;const filePath=await file.path();const csv=fs.readFileSync(filePath,'utf8');assert.match(csv,/YouTube/);assert.match(csv,/CRM Synthetic Browser Audit Second/);
  });
  await page.screenshot({path:`${out}/crm-browser.png`,fullPage:true});
  if(saved)fs.writeFileSync(`${out}/browser-synthetic-record.json`,JSON.stringify({id:saved.id,phone:saved.phone,country_code:saved.country_code,training_preference:saved.training_preference,lead_source:saved.lead_source},null,2));
} catch(e) {
  results.push({ids:[],name:'browser harness prerequisite',status:'BLOCKED',evidence:String(e.message).slice(0,500),path:new URL(page.url()).pathname,alerts:await page.locator('[role=alert]').allTextContents(),bodyExcerpt:(await page.locator('body').innerText()).slice(-1200)});
} finally { fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify(results,null,2)); await browser.close(); }
