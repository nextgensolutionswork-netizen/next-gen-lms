const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const base='http://127.0.0.1:3127';
const roles=[['super_admin','superadmin@next-generpsolutions.com','AdminPass#2026'],['admin','admin@next-generpsolutions.com','AdminPass#2026'],['accountant','accounts@next-generpsolutions.com','AccountsPass#2026'],['counsellor','counsellor@next-generpsolutions.com','CounsellorPass#2026'],['trainer','vikram.fico@next-generpsolutions.com','TrainerPass#2026'],['placement_coordinator','placement@next-generpsolutions.com','PlacementPass#2026'],['support','support@next-generpsolutions.com','SupportPass#2026'],['onboarding_team','onboarding@next-generpsolutions.com','OnboardPass#2026'],['student','amit.gupta@student.next-gen.com','StudentPass#2026']];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const result={environment:'isolated production build; mock backend; no operational .env/data',layouts:[],login:[],roleAttempts:[],routes:[],blockedExternalHosts:[],pageErrors:[]};
 async function context(options={}) {const c=await browser.newContext(options);await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.protocol==='http:'&&u.port==='3127'&&['127.0.0.1','localhost'].includes(u.hostname))return r.continue();result.blockedExternalHosts.push(u.hostname);return r.abort();});return c;}
 try {
  for(const [name,width,height] of [['desktop',1440,900],['laptop',1280,800],['tablet',768,1024],['mobile',390,844]]){
   const c=await context({viewport:{width,height}}),p=await c.newPage();p.on('pageerror',e=>result.pageErrors.push(e.message));const res=await p.goto(base+'/login',{waitUntil:'networkidle'});result.layouts.push({name,status:res.status(),email:await p.locator('#email').isVisible(),password:await p.locator('#password').isVisible(),overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});await p.screenshot({path:path.join(__dirname,`login-${name}.png`),fullPage:true});await c.close();
  }
  for(const js of [false,true]){
   const c=await context({javaScriptEnabled:js}),p=await c.newPage();const requests=[];p.on('request',r=>requests.push({url:r.url(),method:r.method()}));await p.goto(base+'/login',{waitUntil:'networkidle'});await p.locator('#email').fill('audit-missing@example.test');await p.locator('#password').fill('SyntheticAuditOnly!2026');await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.waitForTimeout(1500);result.login.push({javascript:js,url:p.url(),credentialInAnyUrl:requests.some(r=>/password=|SyntheticAuditOnly/.test(r.url)),authRequests:requests.filter(r=>r.url.includes('/api/auth/')).map(r=>({method:r.method,path:new URL(r.url).pathname})),alert:await p.locator('[role=alert]').allTextContents()});await c.close();
  }
  for(const [role,email,password] of roles){
   const c=await context(),p=await c.newPage();p.on('pageerror',e=>result.pageErrors.push(e.message));await p.goto(base+'/login',{waitUntil:'networkidle'});await p.locator('#email').fill(email);await p.locator('#password').fill(password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.waitForTimeout(3500);result.roleAttempts.push({role,path:new URL(p.url()).pathname,alert:await p.locator('[role=alert]').allTextContents(),scope:'synthetic bundled role, not Supabase Auth'});await c.close();
  }
  const c=await context(),p=await c.newPage();
  const inv=JSON.parse(fs.readFileSync(path.join(__dirname,'route-inventory.json'),'utf8'));
  for(const item of inv.pages.filter(x=>x.route!=='/login'&&!x.route.includes('['))){const r=await p.goto(base+item.route,{waitUntil:'domcontentloaded'});result.routes.push({route:item.route,status:r.status(),landed:new URL(p.url()).pathname,scope:'anonymous navigation only'});}
  await c.close();
 }finally{result.blockedExternalHosts=[...new Set(result.blockedExternalHosts)];fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(result,null,2));await browser.close();console.log(JSON.stringify({layouts:result.layouts,login:result.login,roleAttempts:result.roleAttempts,routes:result.routes.length,blockedExternalHosts:result.blockedExternalHosts,pageErrors:result.pageErrors}));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
