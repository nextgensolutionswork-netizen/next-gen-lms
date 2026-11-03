import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const out='docs/audits/crm-e2e-2026-11-03', base='http://localhost:3017';
assert.equal(JSON.parse(fs.readFileSync(out+'/isolation.json','utf8')).remoteDatabaseEnabled,false);
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
const page=await context.newPage();page.setDefaultTimeout(12000);const results=[];
const d=()=>page.getByRole('dialog');
async function check(ids,name,fn){try{await fn();results.push({ids,name,status:'PASS',evidence:'Executed isolated Playwright assertion'});
}catch(e){results.push({ids,name,status:'FAIL',evidence:e.message.slice(0,800)});}fs.writeFileSync(out+'/browser-followup.json',JSON.stringify(results,null,2));}
try{
  const password=fs.readFileSync('lib/auth/credentials.ts','utf8').match(/'superadmin@next-generpsolutions.com':\s*\['([^']+)'/)[1];
  const response=await context.request.post(base+'/api/auth/login',{data:{email:'superadmin@next-generpsolutions.com',password},headers:{Origin:base}});assert.equal(response.status(),200);
  const fixture=JSON.parse(fs.readFileSync(out+'/browser-synthetic-record.json','utf8'));
  const restored=await context.request.patch(base+'/api/crm/leads',{data:{leadId:fixture.id,updates:{stage:'New'}},headers:{Origin:base}});assert.equal(restored.status(),200);
  await page.goto(base+'/crm/leads');await page.getByPlaceholder('Search by name, phone, email, or lead ID...').fill('CRM Synthetic Browser Audit Second');await page.waitForTimeout(800);
  const row=page.getByRole('row').filter({hasText:'CRM Synthetic Browser Audit Second'});
  await check([18,32,69],'edit saved country and YouTube via Candidate Information',async()=>{
    await row.getByRole('button',{name:'Edit',exact:true}).click();await d().getByRole('button',{name:'Candidate Information'}).click();
    assert.match(await d().getByRole('button',{name:'Select country code'}).first().innerText(),/91/);
    assert.equal(await d().locator('label').filter({hasText:'Lead Source'}).locator('..').locator('select').inputValue(),'YouTube');
  });
  await check([71],'cancel editing preserves original name',async()=>{
    const input=d().locator('input').first();const old=await input.inputValue();await input.fill('Unsaved Synthetic Edit');await d().locator('button').first().click();
    await row.getByRole('button',{name:'Edit',exact:true}).click();await d().getByRole('button',{name:'Candidate Information'}).click();assert.equal(await d().locator('input').first().inputValue(),old);
  });
  await d().locator('button').first().click();
  await check([82,83,84,86,87],'primary admission conversion prefills identity, country prefix, mode and course',async()=>{
    await row.getByRole('button',{name:'Convert to Admission',exact:true}).click();await d().waitFor();
    const field=label=>d().locator('label').filter({hasText:label}).locator('..').locator('input');
    assert.equal(await field('Student Full Name').inputValue(),'CRM Synthetic Browser Audit Second');assert.equal(await field('Phone Number *').inputValue(),'+91 98765 43252');assert.equal(await field('Email Address').inputValue(),'browser-audit-second@example.test');
    const mode=d().locator('label').filter({hasText:'Training Mode'}).locator('..').locator('select');assert.equal(await mode.inputValue(),'Offline');
    const saved=JSON.parse(fs.readFileSync(out+'/browser-synthetic-record.json','utf8'));
    const leads=await (await context.request.get(base+'/api/crm/leads')).json();const lead=leads.leads.find(l=>l.id===saved.id);assert.equal(lead.stage,'New');
    const course=d().locator('select').filter({has:page.locator(`option[value="${lead.interested_course_id}"]`)});assert.equal(await course.first().inputValue(),lead.interested_course_id);
    await page.screenshot({path:out+'/admission-prefill.png',fullPage:true});
  });
  await check([96], 'converted lead hides conversion actions', async()=>{
    const saved=JSON.parse(fs.readFileSync(out+'/browser-synthetic-record.json','utf8'));
    const r=await context.request.patch(base+'/api/crm/leads',{data:{leadId:saved.id,updates:{stage:'Converted'}},headers:{Origin:base}});assert.equal(r.status(),200);
    await page.goto(base+'/crm/leads');await page.getByPlaceholder('Search by name, phone, email, or lead ID...').fill('CRM Synthetic Browser Audit Second');await page.waitForTimeout(800);
    const converted=page.getByRole('row').filter({hasText:'CRM Synthetic Browser Audit Second'});assert.equal(await converted.count(),1);assert.equal(await converted.getByRole('button',{name:'Convert to Admission',exact:true}).count(),0);assert.equal(await converted.getByRole('button',{name:'Quick Convert',exact:true}).count(),0);
  });
}catch(e){results.push({ids:[],name:'followup prerequisite',status:'BLOCKED',evidence:e.message.slice(0,800)});}finally{fs.writeFileSync(out+'/browser-followup.json',JSON.stringify(results,null,2));await browser.close();}
