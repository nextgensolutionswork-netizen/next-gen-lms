const fs=require('fs'),path=require('path');
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8').replace(/^\uFEFF/,''));
const report=load('clean-final-tests.json'),baseline=load('baseline-tests.json');
const baselineFailures=new Set(baseline.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>t.fullName)));
const rows=['# Individual executed test scenarios','',`Final clean run: ${report.numTotalTests} total; ${report.numPassedTests} passed; ${report.numFailedTests} failed; ${report.numPendingTests} pending. All local/mock execution; no real database verification.`,'','| File | Executed scenario | Actual result | Baseline relation |','|---|---|---|---|'];
for(const suite of report.testResults){const file=suite.name.replaceAll('\\','/').split('/lms-scenario-audit-20261030/').pop();for(const t of suite.assertionResults)rows.push(`| ${file} | ${t.fullName.replaceAll('|','/').replaceAll('\n',' ')} | ${t.status==='passed'?'PASS':t.status==='failed'?'FAIL':t.status.toUpperCase()} | ${baselineFailures.has(t.fullName)?'Baseline failure':path.basename(file).startsWith('scenario-audit-')?'New regression':'Existing test'} |`)}
fs.writeFileSync(path.join(__dirname,'EXECUTED-SCENARIOS.md'),rows.join('\n')+'\n');
console.log(JSON.stringify({total:report.numTotalTests,passed:report.numPassedTests,failed:report.numFailedTests}));
