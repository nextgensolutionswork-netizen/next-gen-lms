const fs = require('fs'), path = require('path');
const {build}=require('esbuild'), {chromium}=require('playwright');
const {scratch}=JSON.parse(fs.readFileSync(path.join(__dirname,'run-paths.json'),'utf8').replace(/^\uFEFF/,''));
const stubs={
 'next/link':`import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}`,
 'next/navigation':`export const useRouter=()=>({push(){}})`,
 '@/components/bulk-import-modal':`export const BulkImportModal=()=>null`,
 '@/components/providers/auth-provider':`export const useAuth=()=>({user:window.auditStore.users[0],role:'counsellor',hasPermission:()=>true})`,
 '@/lib/services/data-store':`export const store=window.auditStore`,
 '@/lib/supabase/db':`export const isLiveSupabaseEnabled=()=>true;export const createClient=()=>{throw Error('Unexpected database access')}`,
 '@/lib/services/admission-service':`export const createAdmissionWorkflow=async()=>{throw Error('Not under test')}`,
 '@/lib/services/crm-service':`export async function createLead(data){window.submissions.push(data);const r=await fetch('/mock-leads',{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error((await r.json()).error);const lead=await r.json();window.auditStore.leads.unshift(lead);return lead} export const updateLeadStage=async()=>{throw Error('Synthetic stage save rejected')};export const bulkAssignLeads=async()=>{};export const bulkUpdateLeadStage=async()=>{};`
};
(async()=>{
 const bundle=await build({absWorkingDir:scratch,stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Page from './app/(dashboard)/crm/leads/page';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:scratch,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'audit-fixtures',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'audit'}:undefined);b.onLoad({filter:/.*/,namespace:'audit'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:scratch}));}}]});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();const result={mode:'actual CRM component; mocked auth/store/services; all network intercepted',checks:{},pageErrors:[],consoleErrors:[],network:[]};let fail=true;
 try {
 page.on('pageerror',e=>result.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text())});
 await page.route('**/*',async r=>{const url=new URL(r.request().url());if(url.pathname==='/crm/leads')return r.fulfill({contentType:'text/html',body:'<div id="root"></div>'});if(url.pathname==='/mock-leads'){const input=r.request().postDataJSON();const body=fail?{error:'Synthetic database rejection (23503): related course missing'}:{...input,id:'33333333-3333-4333-8333-333333333333',lead_code:'LD-2026-001',created_at:new Date().toISOString()};result.network.push({path:url.pathname,status:fail?500:200,body:fail?body:{saved:true}});return r.fulfill({status:fail?500:200,contentType:'application/json',body:JSON.stringify(body)});}return r.abort();});
 await page.goto('http://fixture.test/crm/leads');
 await page.evaluate(()=>{window.submissions=[];window.auditStore={leads:[],courses:[{id:'11111111-1111-4111-8111-111111111111',course_name:'Synthetic Course',price:30000}],users:[{id:'22222222-2222-4222-8222-222222222222',full_name:'Synthetic Counsellor',role:'counsellor',is_active:true}],batches:[]}});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 result.checks.open=await page.getByRole('heading',{name:'CRM & Lead Management'}).isVisible();
 await page.getByRole('button',{name:'New Lead',exact:true}).click();
 await page.getByRole('button',{name:'Create Lead',exact:true}).click();
 result.checks.requiredValidation=await page.evaluate(()=>({submissions:window.submissions.length,invalid:document.querySelectorAll('input:invalid').length}));
 result.checks.options=await page.getByRole('dialog').locator('select').evaluateAll(nodes=>nodes.slice(0,2).map(n=>({value:n.value,options:Array.from(n.options).map(o=>({value:o.value,text:o.text}))})));
 await page.getByPlaceholder('e.g. Ramesh Kumar').fill('Synthetic Candidate');await page.getByPlaceholder('+91 98765 43210').fill('9990001234');await page.getByPlaceholder('ramesh@example.com').fill('audit@example.invalid');
 await page.getByRole('button',{name:'Create Lead',exact:true}).click();await page.waitForTimeout(250);
 result.checks.failedSave={alerts:await page.locator('[role=alert]').allTextContents(),formRetained:await page.getByPlaceholder('e.g. Ramesh Kumar').inputValue()==='Synthetic Candidate',pageErrors:[...result.pageErrors],submittedCourse:await page.evaluate(()=>window.submissions[0].interested_course_id)};
 fail=false;await page.getByRole('button',{name:'Create Lead',exact:true}).click();await page.waitForTimeout(250);
 result.checks.successfulMockSave=await page.getByText('Synthetic Candidate',{exact:true}).isVisible();
 const search=page.getByPlaceholder('Search by name, phone, email, or lead ID...');await search.fill('no-match');result.checks.searchHides=await page.getByText('Synthetic Candidate',{exact:true}).count()===0;await search.fill('Synthetic');result.checks.searchFinds=await page.getByText('Synthetic Candidate',{exact:true}).isVisible();
 await page.getByRole('button',{name:'Lost',exact:true}).click();await page.getByText('Synthetic Candidate',{exact:true}).waitFor({state:'hidden'});result.checks.stageFilterHides=await page.getByText('Synthetic Candidate',{exact:true}).count()===0;await page.getByRole('button',{name:'All',exact:true}).click();await page.getByText('Synthetic Candidate',{exact:true}).waitFor({state:'visible'});result.checks.stageFilterRestores=await page.getByText('Synthetic Candidate',{exact:true}).isVisible();
 await page.getByRole('button',{name:'Update',exact:true}).click();await page.getByRole('button',{name:'Save Updates',exact:true}).click();await page.waitForTimeout(250);
 result.checks.stageFailure={pageErrors:[...result.pageErrors],alerts:await page.locator('[role=alert]').allTextContents()};
 }catch(e){result.harnessError=e.message;process.exitCode=1;}finally{fs.writeFileSync(path.join(__dirname,'browser-crm.json'),JSON.stringify(result,null,2));await browser.close();console.log(JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
