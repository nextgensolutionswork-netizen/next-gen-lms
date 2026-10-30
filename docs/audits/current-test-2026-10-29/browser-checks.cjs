const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const base='http://localhost:3013',out=__dirname,root=path.resolve(out,'../../..');
const source=fs.readFileSync(path.join(root,'tests/e2e/01-auth-roles-e2e.mjs'),'utf8');
const accounts=Function('return '+source.match(/const ROLES_TO_TEST = (\[[\s\S]*?\n\]);/)[1])();
const results={mode:'current source; synthetic local adapter; outbound browser traffic blocked',roles:[],crm:{},network:[],pageErrors:[]};
const save=()=>fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});
try {for(const account of accounts){
 const context=await browser.newContext(),page=await context.newPage();
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 page.on('pageerror',e=>{results.pageErrors.push({role:account.role,message:e.message});save()});
 page.on('response',async r=>{if(r.status()>=400){const u=new URL(r.url());results.network.push({role:account.role,path:u.pathname,status:r.status()});save()}});
 const entry={role:account.role,permissions:[]};results.roles.push(entry);
 try{await page.goto(base+'/login',{waitUntil:'networkidle',timeout:90000});
 await page.locator('input[type=email]').fill(account.email);await page.locator('input[type=password]').fill(account.password);await page.locator('button[type=submit]').click();
 await page.waitForURL(u=>!u.pathname.startsWith('/login'),{timeout:30000});entry.login=true;entry.landed=new URL(page.url()).pathname;entry.expected=account.expectedRoute;entry.redirectPass=entry.landed===account.expectedRoute;
 if(account.role==='counsellor'){
 await page.goto(base+'/crm/leads',{waitUntil:'networkidle',timeout:90000});results.crm.open=true;
 await page.getByRole('button',{name:'New Lead',exact:true}).click();await page.getByRole('button',{name:'Create Lead',exact:true}).click();
 results.crm.requiredFields=await page.locator('form input:invalid').count();
 await page.getByPlaceholder('e.g. Ramesh Kumar').fill('Audit Synthetic Lead');await page.getByPlaceholder('+91 98765 43210').fill('9990001234');await page.getByPlaceholder('ramesh@example.com').fill('audit.synthetic@example.invalid');
 results.crm.selectionValues=await page.locator('form select').evaluateAll(es=>es.slice(0,2).map(e=>({value:e.value,exists:[...e.options].some(o=>o.value===e.value)})));
 await page.getByRole('button',{name:'Create Lead',exact:true}).click();await page.waitForTimeout(700);
 const search=page.getByPlaceholder('Search by name, phone, email, or lead ID...');await search.fill('Audit Synthetic Lead');results.crm.savedVisible=await page.locator('tbody').innerText().then(t=>t.includes('Audit Synthetic Lead'));
 await page.screenshot({path:path.join(out,'crm-after-save.png')});
 await page.reload({waitUntil:'networkidle'});await search.fill('Audit Synthetic Lead');results.crm.persistedAfterRefresh=await page.locator('tbody').innerText().then(t=>t.includes('Audit Synthetic Lead'));
 await search.fill('no-such-audit-lead');results.crm.searchExcludes=!(await page.locator('tbody').innerText()).includes('Audit Synthetic Lead');await search.fill('Audit Synthetic Lead');
 await page.getByRole('button',{name:'Lost',exact:true}).click();results.crm.stageFilterExcludes=!(await page.locator('tbody').innerText()).includes('Audit Synthetic Lead');await page.getByRole('button',{name:'All',exact:true}).click();
 }
 for(const route of account.forbiddenRoutes){await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForTimeout(500);entry.permissions.push({route,final:new URL(page.url()).pathname,blocked:new URL(page.url()).pathname!==route});}
 }catch(e){entry.error=e.message;}finally{save();console.log(account.role+': '+(entry.login?'login completed':'failed'));await context.close();}
 }}finally{save();await browser.close();}})().catch(e=>{results.harnessError=e.message;save();process.exitCode=1;});
