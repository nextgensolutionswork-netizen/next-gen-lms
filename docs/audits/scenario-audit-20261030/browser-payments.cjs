const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
const {scratch}=JSON.parse(fs.readFileSync(path.join(__dirname,'run-paths.json'),'utf8').replace(/^\uFEFF/,''));
const base='http://localhost:3182', result={mode:'Browser-origin API workflow against actual isolated Next server; mock persistence, no Supabase',checks:[],network:[]};
(async()=>{
 const h=await(await fetch(base+'/api/database/health')).json();assert.equal(h.isLive,false);assert.equal(h.databaseProject,'mock-sap-lms');assert.equal(h.storageBackend,'local_disk_mock');result.preflight={database:h.databaseProject,storage:h.storageProject,backend:h.storageBackend};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const source=fs.readFileSync(path.join(scratch,'lib/auth/credentials.ts'),'utf8');
 const pages={};
 try{
  for(const role of ['counsellor','accounts']){
   const ctx=await browser.newContext();await ctx.route('**/*',r=>{const u=new URL(r.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)&&u.port==='3182'?r.continue():r.abort()});
   const email=role+'@next-generpsolutions.com',password=source.match(new RegExp("'"+email.replaceAll('.','\\.')+"': \\['([^']+)'"))[1];
   const login=await ctx.request.post(base+'/api/auth/login',{data:{email,password}});assert.equal(login.status(),200);
   pages[role]=await ctx.newPage();await pages[role].goto(base+'/accounts/fees');
  }
  async function post(role,url,body){const r=await pages[role].evaluate(async({url,body})=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}},{url,body});result.network.push({role,path:url,status:r.status,...(!r.body.success?{error:r.body.error}:{})});return r;}
  const course=fs.readFileSync(path.join(scratch,'lib/services/data-store.ts'),'utf8').match(/id: '(crs-[^']+)'/)[1];
  const a=await post('counsellor','/api/admissions',{student_name:'Synthetic Payment Audit',phone:'9990004321',email:'payment-audit@example.invalid',dob:'2000-01-01',gender:'Other',address:'Synthetic',city:'Synthetic',education:'Graduate',experience_years:0,current_employment_status:'Student',course_id:course,admission_date:'2026-10-30',course_fee:30000,discount:0,payment_plan:'Full Payment',idempotency_key:'scenario-audit-admission'});
  assert.equal(a.status,200);result.checks.push('pay-later admission saved');
  const proof=await pages.counsellor.evaluate(async()=>{const f=new FormData();f.set('file',new File([new Uint8Array([137,80,78,71])],'synthetic.png',{type:'image/png'}));const r=await fetch('/api/fees/proof',{method:'POST',body:f});return {status:r.status,body:await r.json()}});assert.equal(proof.status,200);result.checks.push('local proof uploaded');
  const adm=a.body.result, body={action:'record',input:{fee_id:adm.studentFee.id,student_id:adm.student.id,enrollment_id:adm.admission.id,amount_paid:1000,payment_mode:'Cash',payment_date:'2026-10-30',payment_proof_url:proof.body.url,idempotency_key:'scenario-payment-one'}};
  const p=await post('counsellor','/api/fees/payments',body);assert.equal(p.status,200);const id=p.body.payment?.id||p.body.result?.payment?.id;
  if(!id)throw Error('Payment response shape differs; inspect route without exposing full snapshot');
  result.checks.push('pending payment recorded');
  const dup=await post('counsellor','/api/fees/payments',body);assert.equal(dup.status,200);assert.equal(dup.body.payment.id,id);result.checks.push('duplicate submission returns same payment');
  const forbidden=await post('counsellor','/api/fees/payments',{action:'approve',paymentId:id});assert.ok(forbidden.status>=400);result.checks.push('counsellor cannot approve');
  const approved=await post('accounts','/api/fees/payments',{action:'approve',paymentId:id});assert.equal(approved.status,200);result.checks.push('accountant approval succeeds');
  await pages.accounts.reload();await pages.accounts.screenshot({path:path.join(__dirname,'payment-approved.png'),fullPage:true});
  const repeated=await post('accounts','/api/fees/payments',{action:'approve',paymentId:id});assert.ok(repeated.status>=400||repeated.body.payment.id===id);result.checks.push('repeat approval handled');
 }finally{await browser.close()}
})().catch(e=>{result.error=e.message;process.exitCode=1}).finally(()=>{fs.writeFileSync(path.join(__dirname,'browser-payments.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))});
