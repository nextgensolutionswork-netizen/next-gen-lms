import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const port = 3097;
const base = `http://localhost:${port}`;
const storage = mkdtempSync(path.join(tmpdir(), 'lms-crm-browser-'));
const secret = randomUUID();
const users = ['Radhika', 'Mohan', 'Admin'].map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i+1}`, full_name: name,
  email: `${name.toLowerCase()}@crm-fixture.invalid`, role: i === 2 ? 'admin' : 'counsellor',
  tenant_id: 'default', is_active: true, created_at: '', updated_at: '',
}));
writeFileSync(path.join(storage, 'institute_store.json'), JSON.stringify({ users, leads: [], admissions: [], auditLogs: [] }));
mkdirSync('evidence/crm-ownership', { recursive: true });
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', 'localhost', '--port', String(port)], {
  windowsHide: true,
  env: { ...process.env, NEXT_DIST_DIR: '.next-crm-local', NEXT_PUBLIC_APP_ENV: 'staging',
    LMS_TEST_STORAGE_DIR: storage, AUTH_COOKIE_SECRET: secret,
    NEXT_PUBLIC_SUPABASE_URL: 'https://mock-sap-lms.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mockAnonKey',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mockAnonKey', SUPABASE_SERVICE_ROLE_KEY: 'mockServiceRoleKey',
    NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore','pipe','pipe'],
});
let logs = '';
server.stdout.on('data', d => { logs += d; }); server.stderr.on('data', d => { logs += d; });
const cookie = user => {
 const value = encodeURIComponent(JSON.stringify(user));
 return `next_gen_auth_user=${value}; next_gen_auth_user_sig=${createHmac('sha256',secret).update(value).digest('hex')}`;
};
async function api(user, method = 'GET', body, query = '') {
 const r = await fetch(`${base}/api/crm/leads${query}`, { method, headers: { cookie: cookie(user), origin: base, 'content-type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}) });
 return { status:r.status, data:await r.json() };
}
let browser;
const checks = [];
try {
 for (let i=0;i<120;i++) {
   if (server.exitCode !== null) throw new Error(`Local server exited: ${server.exitCode}`);
   try { const r=await fetch(`${base}/login`); if(r.ok) break; } catch {}
   if (i===119) throw new Error('Local server did not start');
   await new Promise(r=>setTimeout(r,1000));
 }
 const created = await api(users[0],'POST',{ full_name:'Radhika Private Lead',phone:'9876543210',email:'private@crm-fixture.invalid',stage:'New',notes:'Private CRM note' });
 assert.equal(created.status,200,JSON.stringify(created.data)); assert.equal(created.data.lead.created_by,users[0].id); checks.push('authenticated creation');
 const leadId=created.data.lead.id;
 assert.equal((await api(users[1])).data.leads.length,0); checks.push('cross-user list');
 assert.equal((await api(users[1],'GET',undefined,`?leadId=${leadId}`)).status,403); checks.push('direct ID denial');
 assert.equal((await api(users[1],'PATCH',{leadId,updates:{notes:'tampered'}})).status,403); checks.push('cross-user edit');
 assert.equal((await api(users[0],'PATCH',{leadId,updates:{created_by:users[1].id}})).status,403); checks.push('immutable creator');
 assert.equal((await api(users[2])).data.leads.length,1); checks.push('admin access');
 browser = await chromium.launch({channel:'chrome',headless:true});
 const errors=[];
 for(const user of users.slice(0,2)) {
  const context=await browser.newContext();
  // Browser requests must never touch any hosted service during local verification.
  await context.route('**/*', route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await context.addCookies(cookie(user).split('; ').map(c=>{const p=c.indexOf('=');return {name:c.slice(0,p),value:c.slice(p+1),url:base};}));
  await context.addInitScript(({users,user})=>{
    localStorage.setItem('next_gen_lms_store_snapshot_v1',JSON.stringify({users,leads:[{id:'stale',full_name:'Stale Other User Lead',created_by:'another'}]}));
    localStorage.setItem('next_gen_auth_user',JSON.stringify(user));
  },{users,user});
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  const loaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/crm/leads' && r.status() === 200, { timeout: 90000 });
  const summaryLoaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/crm/summary' && r.status() === 200, { timeout: 90000 });
  await page.goto(`${base}/crm/leads`,{timeout:120000});
  await page.getByRole('heading',{name:'My Leads',exact:true}).waitFor({timeout:60000});
  await loaded;
  const metrics = await (await summaryLoaded).json();
  assert.equal(metrics.metrics.total,user.id===users[0].id?1:0);
  await page.waitForFunction(() => !document.querySelector('[aria-label="Lead statistics"]')?.textContent?.includes('—'));
  checks.push(`${user.full_name} scoped dashboard totals`);
  if (user.id === users[0].id) await page.getByText('Radhika Private Lead', {exact:true}).first().waitFor({timeout:60000});
  await page.screenshot({path:`evidence/crm-ownership/${user.full_name.toLowerCase()}.png`,fullPage:true});
  const text=await page.locator('body').innerText();
  assert.equal(text.includes('Stale Other User Lead'),false);
  assert.equal(text.includes('Radhika Private Lead'),user.id===users[0].id);
  checks.push(`${user.full_name} browser visibility and stale-cache isolation`);
  await context.close();
 }
 assert.deepEqual(errors,[]); checks.push('browser runtime errors');
 writeFileSync('evidence/crm-ownership/browser-results.json',JSON.stringify({passed:checks.length,failed:0,checks,storage:'isolated temporary fixture',hostedRequests:'blocked'},null,2));
 console.log(JSON.stringify({passed:checks.length,failed:0}));
} finally {
 await browser?.close();
 // Kill only this script's local server process tree on Windows.
 if(process.platform==='win32' && server.pid) await new Promise(resolve=>{const kill=spawn('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('exit',resolve);});
 else server.kill();
 writeFileSync('evidence/crm-ownership/local-server.log',logs);
}
