# Executed scenario audit — 2026-10-30

**Overall: FAIL. Production readiness: NOT READY. Live database integration: BLOCKED.**

Branch `staging`, HEAD `27563202c6014c19e8695af690e78802527b8868`, plus the existing working-tree changes captured before testing. This report describes this snapshot, not historical results elsewhere in TEST-REPORT.md. No application fixes, deployment, cleanup, or production mutations were performed.

## Baseline and safety

- `branch.txt`, `head.txt`, `working-tree-before.patch`, `index-before.patch`, `git-status-before.txt`, `untracked-before.txt`, and `hashes-before.json` capture the starting state. Existing edits include database health/preflight guards, QA scripts, storage test setup, and cleanup code/tests.
- Executed in `E:\my erp hub\lms-scenario-audit-20261030`, a source copy excluding environment files, persisted `data`, prior build output, and historical scripts/artifacts. Existing tests stored under docs and qa-checkpoints were included. Dependencies were reused via a node_modules junction. No dependency installation or application change was needed.
- Cleared inherited Supabase/database/auth configuration in test processes. `network-guard.cjs` blocks non-loopback Node sockets; its negative self-test passed. Browser contexts intercepted all destinations except the exact isolated localhost port, or fulfilled requests entirely from synthetic fixtures.
- Before actual-server browser actions, `/api/database/health` reported `isLive=false`, database and storage `mock-sap-lms`, backend `local_disk_mock`. Payment proofs reside only below the isolated copy's `data/payment-proofs`. These runtime observations, removed environment files, isolated storage, and outbound blocking establish this run's isolation. The application's own preflight classifier is defective and was not trusted to authorize remote tests.
- Production `tgohtdzwehhjfahtgovq` received no audit writes/uploads/approvals/deletions. No remote database was queried. A hardcoded QA allowlist is not evidence that a database is disposable or currently isolated.
- `preservation-before-report.json` is empty: all pre-existing tracked and untracked files matched baseline hashes before report append. Final status/preservation evidence is saved separately.

## Commands and actual results

All npm/npx commands used `npm.cmd` / `npx.cmd` under PowerShell in the isolated copy, with `NODE_OPTIONS` loading the network guard and telemetry disabled.

| Command / evidence | Actual result |
|---|---|
| `npm.cmd test -- --reporter=json --outputFile=<audit>/baseline-tests.json` | Exit 1; 807 tests: 795 passed, 12 failed, 0 pending |
| `npm.cmd run typecheck` / `typecheck.log` | Exit 0 |
| `npm.cmd run lint` / `lint.log` | Exit 0, no warnings/errors |
| `npm.cmd run build` / `build.log` | Exit 0; production build completed; webpack large-string performance warnings |
| Expanded clean full suite / `clean-final-tests.json`, `clean-final-tests.log`, `clean-final-exits.txt` | 843 tests: 814 passed, 29 failed, 0 pending; exit 1 |
| Warm-data full suite / `verified-tests.json` | 843 tests: 825 passed, 18 failed; exit 1; browser-generated synthetic data influenced fixture hydration |
| `npm.cmd run typecheck` / `corrected-typecheck.log` | Exit 0, with all new tests present |
| `npm.cmd run lint` / `complete-lint.log` | Exit 0 |
| `npx.cmd vitest run scenario-audit-admissions --reporter=json --outputFile=<audit>/admissions-corrected.json` | Exit 1; 7 passed, 3 failed |
| `node <audit>/browser-regression.cjs` | Exit 0; 11 CRM component checks passed; mocked services/backend |
| `node <audit>/browser-auth.cjs` | Final exit 0; rejected-session and missing-profile cases passed, no page errors |
| `npm.cmd run dev -- --hostname 127.0.0.1 --port 3182` | Isolated development server started; stopped at audit completion |
| `node <audit>/browser-workflows.cjs` | Initial exit 1; recheck exit 0, 9 checks passed; see initial/recheck distinction below |
| `node <audit>/browser-payments.cjs` | Exit 0; 7 browser-origin API workflow checks passed |

Initial harness errors are retained, not counted as application failures: Windows backslash parsing prevented the first preload launch; a literal wildcard selected no Vitest files; a screenshot insertion missed a semicolon in the auth harness; an admission test used a nonexistent Course.is_active field. The fixture was corrected to the real `status: 'Archived'` representation, and its rejection assertion remains failing. Logs retain each attempt. No assertion was weakened or failing application case skipped. The build tested identical application code; test-only additions were subsequently typechecked/linted.

Baseline failures: 7 in `counsellor-payment-workflow.test.ts`, 4 in `fee-approval-workflow.test.ts`, 1 in `dual-ledger-sync.test.ts`. All stop at recorder authorization before their intended workflow assertions. New tests: 36 total, 19 passed, 17 failed. Every individual executed test and status is in `EXECUTED-SCENARIOS.md`; machine-readable reports preserve exact test identities. Passing counts alone do not establish scenario completeness.

The warm-data rerun demonstrated fixture dependence: tests/setup-storage.ts imports an existing cwd/data snapshot, and browser testing had created one in the isolated copy. The server was stopped and that synthetic data was preserved under `browser-synthetic-data-preserved`; the final full suite was rerun without it. The clean result is the reported baseline comparison. No repository or production data was moved.

## Scenario matrix

PASS below means only the stated executed layer. All real-database/RLS/storage durability equivalents remain BLOCKED.

| Area / scenario | Result | Layer and evidence |
|---|---|---|
| CRM required fields, actual course/counsellor UUID values, useful failed save, retained form | PASS | Actual CRM component with synthetic service responses, browser-regression.json |
| CRM valid creation and refresh | PASS | Component fixture and actual isolated mock Next server recheck; browser-workflows-recheck.json |
| CRM new login in a separate browser retains the same lead | NOT RUN | Reload tested; not equivalent to independent fresh-login durability |
| CRM invalid UUID / alias handling, inactive or wrong-role/cross-tenant counsellor | PASS for existing tested cases | crm-counsellor-selection and CRM regression suites; authoritative missing-row case fails below |
| CRM missing authoritative counsellor hidden by cached profile | FAIL | scenario-audit-crm.test.ts, F02 |
| CRM missing/deleted authoritative single lead hidden by cache | FAIL | scenario-audit-crm.test.ts, F03 |
| CRM failed insert/timeout: no ghost, premature persist, or success audit | PASS | audit-crm-live-contract and scenario-audit-crm tests, mocked database |
| CRM concurrent lead-code collision and exhausted retry | PASS | crm-simultaneous-lead-and-proxy.test.ts; adapter concurrency only |
| CRM double-click during a slow save; timeout recovery in full UI | NOT RUN | Existing concurrent service tests do not establish browser double-click behavior |
| CRM search by name/email/phone/code, filters, empty results, read error without stale list | PASS | crm-authoritative-regression tests and component browser checks |
| CRM stage rejection, zero-row update, acknowledged save and partial follow-up error | PASS | crm-authoritative-regression tests; component error retention; no real DB |
| CRM inactive/foreign/missing course authoritative validation | NOT RUN at lead-insert boundary | Dropdown UUID checks do not prove course tenancy or availability |
| Admission valid saved lead; linked student/admission/fee consistency; pay later | PASS | scenario-audit-admissions; isolated browser API pay-later registration |
| Admission missing, differently assigned, converted lead | PASS | scenario-audit-admissions |
| Admission concurrent conversion and local durable-save rollback | PASS | scenario-audit-admissions; one successful conversion, no duplicate; rollback restores lead/collections |
| Admission removed actor substitution | FAIL | scenario-audit-admissions, F04; direct service boundary |
| Admission cross-tenant lead | PASS | Local transaction test rejects and rolls back |
| Admission cross-tenant or archived course | FAIL | scenario-audit-admissions, F05 |
| Admission authoritative course/batch absent from cache | NOT RUN | Fallback query exists; no authoritative adapter test added for this branch |
| Admission rejected browser server call produces no local success | PASS | audit-admission-failure-contract.test.ts |
| Admission relational update error after workflow commit | FAIL | scenario-audit-transaction.test.ts, F06; deployment impact depends on RPC migration |
| Admission failure at every boundary / fresh-session conversion durability / full form retention | NOT RUN / BLOCKED for DB | Local commit and rejected client call covered; not every boundary |
| Payments pending does not reduce approved balance; full/partial/decimal payments; invalid amount/reference; mismatched enrollment | PASS for executed modern suites | payment-approval-automation and student-fee-payment-approval-workflow suites |
| Payment approval/rejection, mandatory reason, correction/resubmission, roles/tenant/separation | PASS for modern fixtures | Same suites; baseline legacy-alias suites FAIL before workflow assertions |
| Duplicate request, repeated approval, simultaneous approvals, commit-failure rollback | PASS | Modern automated suites; browser API duplicate submission and repeat approval |
| Concurrent approval versus rejection | NOT RUN | Simultaneous approval tests are not this race |
| Exact ledger/balance/receipt effects and failed/rejected payments | PASS for executed fixtures | Modern payment suites; no remote transaction verification |
| Receipt incomplete historical balance | FAIL | Actual PDF generator, scenario-audit-receipt.test.ts, F07 |
| Receipt authorization/finalization across every role and UI export | NOT RUN comprehensively | Static review and focused PDF test do not prove full access/finalization matrix |
| Proof successful upload/retrieval, bad extension/size, expired auth, wrong tenant/owner, traversal | PASS | scenario-audit-proofs tests; mocked remote adapter, actual local upload in browser API flow |
| Live-mode storage error must not fall back to disk success | PASS | scenario-audit-proofs; filesystem writes mocked and asserted absent |
| Login for nine configured roles, deactivated/unknown accounts, wrong password, unsigned/forged cookies | PASS for existing automated cases | login-security, security-hardening, auth fallback suites |
| Live session failure/missing profile cannot authorize cached identity | PASS | auth-fallback-regression and actual AuthProvider fixture browser |
| Removed/deactivated live financial actor | PASS | audit-payment-roster-contract |
| Localhost exception/strict production mismatch/lookalike origins | PASS for existing cases | crm-simultaneous-lead-and-proxy; spoofed forwarded host fails below |
| Spoofed forwarded-host origin validation | FAIL | scenario-audit-origin, F08; exploitability depends on deployment proxy sanitation |
| Database isolation classification | FAIL | scenario-audit-isolation, F09 |
| Cleanup dry-run never calls mutation adapters; input snapshot unchanged | PASS | scenario-audit-cleanup, synthetic adapters only |
| Cleanup snapshot/revision coupling, revision jumps, refreshed relational records, rebuilt snapshot | FAIL | scenario-audit-cleanup, F10 |
| Cleanup changed target relationship, authenticated tenant | FAIL | scenario-audit-cleanup, F11 |
| Cleanup verified-payment stop, exhaustion, partial failure, repeat execution, financial/proof/history preservation | PASS for executed fixtures | Existing cleanup tests plus scenario-audit-cleanup |
| Cleanup refreshed actor authorization / supported cancellation transitions | FAIL by source inspection; not executed transition suite | Stale actor parameter, direct status assignment; F11 |
| Browser counsellor/accountant login, reload, accountant back navigation, expired-cookie API denial | PASS on recheck | browser-workflows-recheck.json; isolated mock runtime |
| Browser HTTP failure/error retention | PASS | Component intercepted 500; actual API 403/400 with sanitized error bodies |
| Browser offline/network interruption recovery; full UI payment reject/approve buttons | NOT RUN | Browser API workflow is not equivalent to clicking every UI control |
| Live schema, deployed migrations, RLS policies, real DB constraints, real storage, cross-process races | BLOCKED | No verified disposable staging and test accounts established; no production writes |

## Confirmed defects and reproduction

Run the named new file with `npx.cmd vitest run <file>` in the same guarded isolated copy. Expected assertions are preserved and deliberately remain red where defects exist. Full baseline reproduction is `npm.cmd test` with no persisted data.

### F01 — High test-suite blocker: legacy recorder alias absent in fresh seed

`lib/services/data-store.ts:68` adds `usr-counsellor` only during snapshot hydration; the fresh seed at line 499 uses the UUID. `lib/services/fee-workflow-service.ts:917` performs exact recorder lookup. Tests such as `tests/counsellor-payment-workflow.test.ts:8` pass the old alias without creating that actor. Expected: valid test counsellor reaches payment workflow. Actual: 12 tests throw `Unauthorized: This user cannot record payments.` This confirms a seed/fixture alias inconsistency, not failure of all payment approval logic. Correct fixtures or canonical alias resolution without relaxing authorization. Supabase contribution: none.

### F02/F03 — High: authoritative missing records fall back to stale CRM cache

`lib/services/crm-service.ts:155` substitutes a cached staff profile when the successful live lookup returns no row. Line 73 returns a cached lead after an absent/failed authoritative single-record lookup. Reproduce with `scenario-audit-crm.test.ts`: return `{data:null,error:null}` while the local cache contains the record. Expected: reject unavailable counsellor; absent lead remains absent. Actual: insert succeeds using cached counsellor; cached lead is returned. Remove these live fallbacks and distinguish not-found from transport errors. RLS can legitimately produce zero rows; the confirmed cause is application handling, not Supabase malfunction. Actual deployed RLS effect is unverified.

### F04 — High: admission service substitutes an unrelated staff actor

`lib/services/admission-service.ts:131` and `:140` choose the first active staff user when the supplied performer is absent. Reproduce the removed-actor test. Expected: fail closed without records. Actual: complete admission created under another identity. Require exact verified actor membership. API authentication already rejects many bad sessions; direct service substitution is confirmed, unauthenticated endpoint exploitability is not established. Supabase contribution: none.

### F05 — High: course existence is accepted without tenant/status checks

`lib/services/admission-service.ts:211`–224 checks cached/query existence but does not reject a foreign tenant or `Archived` course. Reproduce the cross-tenant and archived-course tests. Expected: deny enrollment; actual: admission, student and fee records created. Verify authoritative course availability and tenant membership before mutation. The cross-tenant test exercises the application's tenant-tagged object contract; deployed courses schema/tenant support remains unverified. Supabase contribution: none in the reproduction.

### F06 — High: post-commit relational sync error is silently ignored

`lib/services/payment-workflow-transaction.ts:100` commits workflow state, then line 109 awaits a lead update but never examines its returned `error`; exceptions at line 114 are only logged. `scenario-audit-transaction.test.ts` returns a successful RPC followed by `{error:{message:'Synthetic relational lead denied'}}`. Expected: explicit partial failure/reconciliation state; actual: `{success:true}`. Migration `011_commit_fee_workflow_lead_sync.sql:70` proposes atomic lead synchronization, but is marked pending/unverified and its deployed state was not checked. Thus a real relational inconsistency is conditional on the installed RPC; wrapper error suppression is confirmed. Verify atomic RPC behavior and remove or accurately report the secondary write. No evidence of a Supabase defect.

### F07 — Medium: official receipt PDF accepts missing historical balance

`lib/services/pdf-service.ts:26` parses payment and remaining balance but rejects only invalid payment amount. Reproduce `scenario-audit-receipt.test.ts` with valid payment amount and no historical balance. Expected: incomplete record blocked; actual: PDF buffer generated. Reintroduce explicit completeness requirements across display/export/download using historical values, not today's account balance. This is associated with reverted receipt guard work; current amount validation exists, so not every historical receipt defect has returned. Supabase contribution: none.

### F08 — High, deployment-dependent: untrusted proxy header authorizes foreign origin

`lib/security/rate-limiter.ts:81` and `lib/auth/payment-session.ts:14` trust `x-forwarded-host`. Reproduce with production mode, request URL `https://lms.example.invalid`, origin and forwarded host `attacker.example.invalid`. Expected: origin rejected. Actual: CSRF validator returns true; payment request reaches authentication instead of origin rejection. Authentication was not bypassed in the test. Use configured canonical origins or a trusted-proxy boundary that overwrites incoming headers. Public exploitability depends on ingress configuration and was not claimed. Supabase contribution: none.

### F09 — Critical safety guard defect: unverified destinations classified as safe

`lib/security/database-preflight.ts:55` uses suffix matching without the domain boundary; line 126 trusts common loopback ports; line 131 accepts any identifier containing `mock`. The three tests classify an arbitrary mock-named remote domain, a lookalike `evilsupabase.co` domain with an allowlisted first label, and an uninspected localhost:5432 service as verified. Expected: unverified until exact endpoint and instance identity are established. Actual: all verified. Known production-ref denial still passes but is insufficient. Use exact parsed hosts, explicit mock transport, and independently verified database AND storage identity. Never permit cleanup/write tests based solely on labels or ports. Supabase contribution: none.

### F10 — Critical if cleanup execution is enabled: unsafe conflict retry

`lib/security/cleanup-dry-run.ts:366` accepts revision separately from snapshot; `:370` reads relational rows once; `:420` validates against those stale rows; `:429` merges using Object.assign, retaining deleted keys; `:430` guesses revision +1. Reproduce the revision-jump, deleted relational target, and removed snapshot-key tests using memory adapters. Expected: atomic snapshot+revision read, refreshed relational records, rebuilt plan and exact revision; otherwise abort. Actual: retry succeeds with guessed revision/stale relationships and resurrected data. The current API cannot return a fresh revision from getSnapshot. Redesign before any real execution. No real cleanup was performed. Supabase contribution: none.

### F11 — Critical if cleanup execution is enabled: target and tenant validation gaps

`lib/security/cleanup-dry-run.ts:110` checks selected status fields but not payment→fee→student relationships; `:409` commits to literal `default` instead of authenticated tenant. Reassignment and tenant tests fail. Expected: exact target relationships and actor tenant; actual: unrelated association passes validation and synthetic-tenant actor commits to default. Source review additionally finds stale actor authorization throughout retries and direct `Cancelled`/`Dropped` assignments at lines 301/313 without invoking a supported transition service. Name substrings at line 177 do not establish identity. Add fresh authorization, explicit relationship/tenant validation and supported transition plans; keep execution unavailable until proven. Supabase contribution: none.

## Browser evidence and limits

`browser-regression.json` contains 11 passing actual-component checks; services/auth/backend are substituted, so its reload is mock persistence. It records the underlying synthetic HTTP 500 and zero unhandled page errors. `browser-auth.json` exercises the actual provider with mocked rejected live auth and missing profiles; cached admin authority is denied. Screenshots: `crm-fault.png`, `auth-fail-closed.png`.

`browser-workflows.json` records the first actual-server attempt: CRM save/reload timeout, back-navigation assertion before navigation settled, and execution-context loss during the following expiry check. Recheck adds save-state evidence, waits for completed back navigation, and checks expiry via the context request client; all nine checks passed (`browser-workflows-recheck.json`). The CRM timeout was not deterministically reproduced and its cause remains unconfirmed; do not describe it as a fixed application defect. Screenshots include `crm-after-submit.png`, `crm-reloaded.png`, `counsellor-landing.png`, `accounts-landing.png`, `accountant-approvals.png`.

`browser-payments.json` exercises actual HTTP handlers from two separate authenticated browser contexts. Admission/proof/payment/duplicate/approval succeed; counsellor approval returns 403 with separation-of-duties explanation; repeat approval returns 400 with already-verified/rejected explanation. `payment-approved.png` captures the accounts view. This validates browser-origin API behavior, not every UI button or real Supabase persistence. Credentials, cookies and full financial snapshots are omitted from evidence.

## Reverted work, schema, and remaining blockers

Read-only Git inspection found `5b6744c` reverted six October 27 changes, including receipt completeness guards, proof handling, ledger display/enrichment, search and resilience work. Subsequent commits reintroduced some fixes. The current proof failure behavior passed; the PDF completeness case failed. Do not infer that every reverted defect remains present. No commit was restored.

Client selection reads public URL/key configuration; the isolated runtime selects mock mode. Local schema declares UUID lead/course/profile relations and course status values. Migration 010 proposes lead uniqueness and 011 proposes atomic conversion sync; payment workflow migration and RLS files exist. File existence is not proof of deployed migration order, function definition, policy behavior or cross-tenant isolation. Service-role RPC execution is server-side; no service-role credential was added to frontend code. Production/staging schema and storage policies were not verified remotely.

Outstanding: verified disposable staging with known DB/storage project identity and role accounts; real constraint/RLS tests; fresh-login persistence; every persistence-boundary fault; approval-vs-rejection race; end-to-end UI conversion and payment rejection; browser offline/double-click recovery; full receipt access/finalization matrix; unknown-role permissions across every route. These are explicitly NOT RUN or BLOCKED, not inferred passes.

## Recommended order

1. Repair isolation classification and cleanup retry/tenant/relationship safeguards before permitting any cleanup or remote write harness.
2. Remove stale authoritative CRM fallbacks and admission actor substitution; validate course status and tenancy.
3. Verify/install atomic conversion behavior only through a reviewed migration process on disposable staging; make partial synchronization failures explicit.
4. Restore receipt completeness and trusted-origin handling; resolve the legacy seed/fixture alias discrepancy without weakening role checks.
5. Rerun all red contracts, complete the missing browser scenarios, then run real DB/RLS/storage and cross-process concurrency tests on verified staging.

**Next concrete fix:** replace preflight label/port trust with exact independently verified destination identity, and keep cleanup mutation execution disabled until snapshot+revision, actor, tenant and relational validations are redesigned and the new regressions pass. No production readiness claim is warranted.
