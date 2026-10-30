const fs=require('fs'),path=require('path'),{build}=require('esbuild'),{chromium}=require('playwright');
const {scratch}=JSON.parse(fs.readFileSync(path.join(__dirname,'source-manifest.json'),'utf8').replace(/^\uFEFF/,''));
const stubs={
 'next/link':`import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}`,
 'next/navigation':`export const useRouter=()=>({push(){}})`,
 '@/components/bulk-import-modal':`export const BulkImportModal=()=>null`,
 '@/components/providers/auth-provider':`export const useAuth=()=>({user:window.auditStore.users[0],role:'counsellor',hasPermission:()=>true})`,
 '@/lib/services/data-store':`export const store=window.auditStore`,
 '@/lib/services/admission-service':`export const createAdmissionWorkflow=async()=>{throw Error('Not under test')}`,
 '@/lib/services/crm-service':`export async function createLead(data){window.submissions++;const r=await fetch('http://fixture.test/mock-leads',{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error((await r.json()).error);return await r.json()} export const updateLeadStage=async()=>{};export const bulkAssignLeads=async()=>{};export const bulkUpdateLeadStage=async()=>{};`
};
(async()=>{const bundle=await build({absWorkingDir:scratch,stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Page from './app/(dashboard)/crm/leads/page';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:scratch,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'audit-fixtures',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'audit'}:undefined);b.onLoad({filter:/.*/,namespace:'audit'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:scratch}));}}]});
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();const result={mode:'actual CRM page bundled with mocked services',pageErrors:[],consoleErrors:[],network:[]};
 try{page.on('pageerror',e=>result.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text())});
 await page.route('**/*',r=>r.request().url()==='http://fixture.test/mock-leads'?r.fulfill({status:500,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({error:'Failed to create lead in database: Database error creating lead: Live database query failed.'})}):r.abort());
 page.on('response',async r=>{if(r.url().includes('mock-leads'))result.network.push({path:'/mock-leads',status:r.status(),body:await r.json()})});
 await page.setContent('<div id="root"></div>');await page.evaluate(()=>{window.submissions=0;window.auditStore={leads:[],courses:[{id:'11111111-1111-4111-8111-111111111111',course_name:'Synthetic Course',price:30000}],users:[{id:'22222222-2222-4222-8222-222222222222',full_name:'Synthetic Counsellor',role:'counsellor',is_active:true}],batches:[]}});
 await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByRole('button',{name:'New Lead',exact:true}).click();await page.getByPlaceholder('e.g. Ramesh Kumar').fill('Synthetic Failure');await page.getByPlaceholder('+91 98765 43210').fill('9990001234');await page.getByPlaceholder('ramesh@example.com').fill('failure@example.invalid');await page.getByRole('button',{name:'Create Lead',exact:true}).click();await page.waitForTimeout(1000);
 result.submissions=await page.evaluate(()=>window.submissions);result.visibleAlerts=await page.locator('[role=alert]').allTextContents();result.formRetained=await page.getByPlaceholder('e.g. Ramesh Kumar').inputValue()==='Synthetic Failure';result.falseSuccess=!(await page.getByRole('button',{name:'Create Lead',exact:true}).isVisible());result.pass=result.pageErrors.length===0&&result.visibleAlerts.length>0&&!result.falseSuccess;
 await page.screenshot({path:path.join(__dirname,'crm-failed-save.png'),fullPage:true});
 }finally{fs.writeFileSync(path.join(__dirname,'browser-save-failure.json'),JSON.stringify(result,null,2));await browser.close();console.log(JSON.stringify(result));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
