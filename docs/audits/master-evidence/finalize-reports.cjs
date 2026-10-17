const fs=require('fs'),path=require('path');
const root=path.dirname(__dirname),main=path.join(root,'COMPLETE_LMS_GAP_ANALYSIS.md'),matrix=path.join(root,'LMS_MODULE_COVERAGE_MATRIX.md');
fs.appendFileSync(main,`

## 20. Final runtime observations and separate risk register

- The latest browser run had **zero blocked external hosts** and no recorded page errors. The first attempt blocked a loopback redirect from127.0.0.1 tolocalhost; the guard was corrected to allow only those two names on port3127 and the entire browser harness was rerun. Both attempts are retained. No operational host was allowed.
- **0/9 bundled role attempts reached an authenticated destination** in the bounded observation window. This is a failed isolated smoke outcome, not proof that every real Supabase account fails. Private cloud Auth and actual role journeys remain unverified.
- Native synthetic preset login against the isolated production server returned401, errorCode account_deactivated, and a function-call error. [native-login-result.json](master-evidence/native-login-result.json) corroborates G12 beyond source inspection. Correct credential POST behavior therefore does not mean successful login works.
- Seven anonymous GET checks: backup200 with full-store envelope (~90KB synthetic data, not retained); health200; settings200; audit403; payments401; onboarding401; notifications401. [api-smoke.json](master-evidence/api-smoke.json). G28 is runtime-confirmed locally. Protected endpoint401 results are narrow controls, not a full authorization pass.
- No synthetic password appeared in observed URLs in either JS mode. Browser/server/proxy/analytics coverage is not exhaustive; removing an already-supplied password query parameter cannot retract it from upstream logs.

| ID / classification | Priority / type | Exact evidence | Expected / actual / impact | Reproduction and recommended action | Dependencies / status |
|---|---|---|---|---|---|
|R01 SUSPECTED RISK|P1 Data/concurrency|payment-workflow-transaction.ts:29,44,75-78,107-113|readOnly calls mutate shared state but do not advance write queue; may interleave with writes|Instrument delayed concurrent read/write operations; use request-local state or serialize all shared mutations|Independent concurrency harness; corruption not reproduced|
|R02 SUSPECTED RISK|P1 Security|002_rls_policies.sql:64-65,119-120,145-153; payment migration:7-11|Broad role policies and financial-only restrictive additions may leave nonfinancial tenants unisolated|Enumerate effective deployed policies/grants; two-tenant positive/negative query suite|Approved isolated project; deployed exposure unverified|
|R03 SUSPECTED RISK|P1 Security/data|000_full_schema_rls_and_seed.sql:1253-1271; storage-service.ts:310,333|Sensitive buckets public in baseline; generic signing lacks demonstrated ownership; dedicated proofs are protected|Inspect actual bucket privacy/grants; test cross-owner signing and native access; private buckets and ownership policies|Independent storage fixtures; no live download performed|
|R04 SUSPECTED RISK|P1 Data|academics-service.ts:599-626|Transfer updates local occupancy but remote student/audit separately; unknown trigger coverage|Concurrent capacity transfers and restart checks; atomic RPC/locking and audited counts|Schema/trigger verification required|
|R05 SUSPECTED RISK|P1 Performance/delivery|payment-workflow-transaction.ts:90-97; header.tsx:31|External callbacks awaited within queue; failed callbacks logged; polling/full snapshots may contend|Measure per-stage timings and delivery loss; durable outbox, pagination and indexed writes|Proven staging; no latency or loss measurements claimed|
|R06 BLOCKED TEST|P0 verification|Full migration directory; baseline contains duplicate006 versions and overlapping schema|Clean replay and actual deployed constraints not certified|Review baseline, remove duplicate history ambiguity in a planned migration, replay on disposable DB|No production schema edits in audit|
|M01 MISSING REQUIREMENT|P1 recovery|fee-workflow-service.ts:1407,1445; api/fees/payments command union|Refund helper exists, no complete verified authenticated refund/chargeback lifecycle|Specify states/permissions, implement canonical transaction and repeat/failure tests after audit|Finance policy and identity repair; not a claimed failed live refund|
|M02 INCOMPLETE REQUIRED FALLBACK|P2 auth UX|app/login/page.tsx:375,410; app/api/auth contains login/logout only|Native recovery/update actions refer to absent routes; hydrated paths may work separately|Either implement safe server fallback or explicitly require JS and disable unavailable submission|Recovery session fixtures; not counted as normal hydrated-recovery failure|
|O01 OPTIONAL ENHANCEMENT|P3 product|No requirement established|Employer portal, advanced matching/calendar sync/warehouse may add value|Obtain product requirements; do not classify absence as a bug|Outside release-blocker count|

G28/G29/G30/G31 are additional P0 release blockers beyond the initial list: backup/sync confidentiality/integrity, unscoped realtime and gateway financial verification. G32 adds unsigned attendance processing. Their detailed source review is in the appended endpoint sections of the domain evidence reports.
`);
let text=fs.readFileSync(matrix,'utf8');
const checks=JSON.parse(fs.readFileSync(path.join(__dirname,'api-smoke.json'),'utf8'));
text=text.split('\n').map(line=>{
 const cells=line.split('|');if(cells.length<12)return line;
 const route=cells[2]?.trim(),check=checks.find(x=>x.route===route);
 if(check){cells[6]=` PARTIAL: isolated anonymous GET ${check.status} `;cells[8]=' PARTIAL: anonymous response only; no tenant certification ';return cells.join('|');}
 return line;
}).join('\n');
text+='\n\n## Current authenticated-route limitation\n\nNine bundled synthetic role-login attempts all remained on /login during bounded observation; zero authenticated role journeys passed. The native valid synthetic account POST returned401 with a function-call error. These outcomes are not counted as a complete live Auth failure diagnosis. No credentials were put in observed browser URLs. Seven anonymous API reads were executed on the isolated mock backend, as marked above. All other API cells remain unverified live.\n';
fs.writeFileSync(matrix,text);
fs.appendFileSync(path.join(root,'LMS_GAP_FIX_PRIORITY.md'),'\n## Additional mandatory P0 endpoints\n\nG28 backup, G29 sync, G30 realtime and G31 gateway verification must be locked down alongside the identity fixes before any publicly exposed environment handles real data. G32 meeting webhook authentication is P1. No configuration absence may silently enable authoritative simulated payments or attendance.\n\nG12 is now reproduced in the isolated production HTTP handler, and G28 is reproduced by an anonymous local read. Narrow positive control: payments/onboarding/notifications returned401 anonymously.\n');
fs.appendFileSync(path.join(root,'LMS_PRODUCTION_READINESS.md'),'\nCurrent browser outcome:0/9 synthetic role attempts reached an authenticated destination; native preset account POST returned401/function-call error. Anonymous full-store backup returned200 on the isolated fixture. All32 grouped findings and separate risks are documented; no live exploit or load test was executed.\n');
console.log('Final runtime evidence incorporated.');
