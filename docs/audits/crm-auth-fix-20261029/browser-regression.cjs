const fs=require('fs'), path=require('path'), assert=require('assert/strict');
const {build}=require('esbuild'), {chromium}=require('playwright');
const {scratch}=JSON.parse(fs.readFileSync(path.join(__dirname,'run-paths.json'),'utf8').replace(/^\uFEFF/,''));
const stubs={
 'next/link':`import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}`,
 'next/navigation':`export const useRouter=()=>({push(){}})`,
 '@/components/bulk-import-modal':`export const BulkImportModal=()=>null`,
 '@/components/providers/auth-provider':`export const useAuth=()=>({user:window.auditStore.users[0],role:'counsellor',hasPermission:()=>true})`,
 '@/lib/services/data-store':`export const store=window.auditStore`,
 '@/lib/services/admission-service':`export const createAdmissionWorkflow=async()=>{throw Error('Not under test')}`,
 '@/lib/supabase/db':`export const isLiveSupabaseEnabled=()=>true;export const createClient=()=>({from(table){const q={select(){return q},eq(){return q},in(){return q},order(){return Promise.resolve(window.optionsFail?{error:{message:'Synthetic options denied'},data:null}:{error:null,data:table==='courses'?window.auditStore.courses:window.auditStore.users})}};return q}})`,
 '@/lib/services/crm-service':`export const getLeads=async()=>{const r=await fetch('/mock-leads');if(!r.ok)throw Error('Synthetic read rejected');const rows=await r.json();window.auditStore.leads=rows;return rows};export async function createLead(data){window.submissions.push(data);const r=await fetch('/mock-leads',{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error((await r.json()).error);return await r.json()} export const updateLeadStage=async()=>{throw Error('Synthetic stage save rejected')};export const bulkAssignLeads=async()=>{};export const bulkUpdateLeadStage=async()=>{};`
};
(async()=>{
 const bundle=await build({absWorkingDir:scratch,stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Page from './app/(dashboard)/crm/leads/page';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:scratch,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:scratch}));}}]});
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();let failSave=true,rows=[];
 const result={mode:'actual current CRM component; intercepted synthetic backend and auth',checks:[],pageErrors:[],consoleErrors:[],network:[]};
 const check=(name,value)=>{result.checks.push({name,pass:!!value});assert.ok(value,name)};
 try{
 page.on('pageerror',e=>result.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text())});
 await page.route('**/*',async r=>{const url=new URL(r.request().url());if(url.pathname==='/crm/leads')return r.fulfill({contentType:'text/html',body:'<div id="root"></div>'});if(url.pathname==='/mock-leads'){
 const post=r.request().method()==='POST';const status=post&&failSave?500:200;let body=rows;
 if(post){const data=r.request().postDataJSON();body=failSave?{error:'Synthetic database rejection: course unavailable'}:{...data,id:'33333333-3333-4333-8333-333333333333',lead_code:'LD-2026-001',created_at:new Date().toISOString()};if(!failSave)rows.push(body)}
 result.network.push({path:url.pathname,method:r.request().method(),status,...(status===500?{body}: {})});return r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 }return r.abort();});
 const mount=async(optionsFail=false)=>{await page.goto('http://fixture.test/crm/leads');await page.evaluate(fail=>{window.optionsFail=fail;window.submissions=[];window.auditStore={leads:[],courses:[{id:'11111111-1111-4111-8111-111111111111',course_name:'Synthetic Course',price:30000}],users:[{id:'22222222-2222-4222-8222-222222222222',full_name:'Synthetic Counsellor',role:'counsellor',is_active:true}],batches:[]}},optionsFail);await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByRole('button',{name:'New Lead',exact:true}).waitFor();};
 await mount();await page.getByRole('button',{name:'New Lead',exact:true}).click();await page.waitForFunction(()=>document.querySelector('form button[type=submit]')?.disabled===false);
 await page.getByRole('button',{name:'Create Lead',exact:true}).click();check('required fields block empty submission',await page.evaluate(()=>window.submissions.length===0&&document.querySelectorAll('input:invalid').length===3));
 await page.getByPlaceholder('e.g. Ramesh Kumar').fill('Synthetic Candidate');await page.getByPlaceholder('+91 98765 43210').fill('9990001234');await page.getByPlaceholder('ramesh@example.com').fill('audit@example.invalid');await page.getByRole('button',{name:'Create Lead',exact:true}).click();await page.getByRole('alert').waitFor();
 check('default displayed course submitted as UUID',await page.evaluate(()=>window.submissions[0].interested_course_id===window.auditStore.courses[0].id));
 check('authorized counsellor UUID submitted',await page.evaluate(()=>window.submissions[0].counsellor_id===window.auditStore.users[0].id));
 check('failed create retains form and useful error',(await page.getByRole('alert').innerText()).includes('Synthetic database rejection')&&await page.getByPlaceholder('e.g. Ramesh Kumar').inputValue()==='Synthetic Candidate');
 failSave=false;await page.getByRole('button',{name:'Create Lead',exact:true}).click();await page.getByText('Synthetic Candidate',{exact:true}).waitFor();check('mock acknowledged save displayed',true);
 await mount();await page.getByText('Synthetic Candidate',{exact:true}).waitFor();check('mock backend save reloads after fresh page',true);
 const search=page.getByPlaceholder('Search by name, phone, email, or lead ID...');await search.fill('missing');await page.getByText('Synthetic Candidate',{exact:true}).waitFor({state:'hidden'});await search.fill('Synthetic');await page.getByText('Synthetic Candidate',{exact:true}).waitFor();check('search hides and restores lead',true);
 await page.getByRole('button',{name:'Lost',exact:true}).click();await page.getByText('Synthetic Candidate',{exact:true}).waitFor({state:'hidden'});await page.getByRole('button',{name:'All',exact:true}).click();await page.getByText('Synthetic Candidate',{exact:true}).waitFor();check('stage filters hide and restore lead',true);
 await page.getByRole('button',{name:'Update',exact:true}).click();await page.getByPlaceholder('Enter discussion notes with student...').fill('Retained note');await page.getByRole('button',{name:'Save Updates',exact:true}).click();await page.getByRole('alert').waitFor();
 check('stage rejection has useful alert and retained notes',(await page.getByRole('alert').innerText()).includes('Synthetic stage save rejected')&&await page.getByPlaceholder('Enter discussion notes with student...').inputValue()==='Retained note');check('no unhandled browser rejection',result.pageErrors.length===0);
 await mount(true);await page.getByRole('button',{name:'New Lead',exact:true}).click();await page.getByRole('alert').waitFor();check('option query failure shown and submission disabled',await page.getByRole('button',{name:'Create Lead',exact:true}).isDisabled());
 }catch(e){result.error=e.message;process.exitCode=1;}finally{fs.writeFileSync(path.join(__dirname,'browser-regression.json'),JSON.stringify(result,null,2));await browser.close();console.log(JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
