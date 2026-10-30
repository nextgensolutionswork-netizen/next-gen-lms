# CRM and authentication investigation — 29 October 2026

**Overall: FAIL / completion BLOCKED by conflicting concurrent edits. Production readiness: NO.**

Targeted fixes and regression coverage were implemented. However, another writer repeatedly changed the same files during validation and restored a live-profile-to-local-counsellor fallback. The final executed snapshot has **743 passing and 14 failing tests out of 757**, across 64 files. One failure proves that restored CRM fallback; thirteen follow a concurrent counsellor fixture-ID change. Further concurrent files appeared after validation. Do not interpret earlier passing runs as approval of the final moving workspace.

No deployment, production data writes, migration application, RLS disabling, or frontend service-key use was performed. Production access consisted only of metadata/log-count/advisor reads through the connected LMS Supabase project. Database integration writes remain **BLOCKED**: isolated staging was not verified.

## Investigation and evidence

The requested root report had been rewritten to 239 lines before this turn, so line 313 no longer existed. The preserved `docs/audits/verification-20261029-rerun/TEST-REPORT.md` contains the requested investigation. Its report, browser JSON, boundary probe, environment summary, hashes, source paths, command logs, and final concurrent-edit correction were reviewed. Current code was inspected independently rather than assuming the historical defects were unchanged.

Package scripts are `typecheck`, `lint`, `build`, and `test` (Vitest). No repository/ancestor AGENTS.md was found in the previous inspection; repository search found none this run. Tests/builds ran in `E:/my erp hub/lms-crm-auth-regression-20261029`, excluding environment files and persisted data. Browser fixtures intercepted network requests; the real isolated server had no live credentials. Existing repository modifications were not reverted.

## Root causes and correction status

Line references identify the final inspected working files; concurrent editing can move them. Historical locations are in the prior verification report.

| Defect | Cause, expected versus actual behavior | Correction/status | Supabase contribution |
|---|---|---|---|
| Course shown but omitted from submission | Originally `courseId` was empty while HTML displayed the first option. The current branch had added loading but ignored query errors and retained selections no longer in the returned lists. Expected: selected authorized ID matches submitted ID; failed loads block saving. | `app/(dashboard)/crm/leads/page.tsx:186`, `:192`, `:274`: check both query errors, synchronize IDs with returned options, validate membership, disable submission on loading/error/missing IDs. `lib/services/crm-service.ts:118`: reject empty live course ID. Browser default UUID and error cases pass. Existing concurrent UUID mapping was preserved. | Application state/validation defect. Production schema permits null course IDs, so the database would not enforce this UI-required field. No Supabase outage shown. |
| Stage-save false success | Service mutated/persisted local state before live update, then swallowed errors. Adapter independently substituted local operations after remote errors. Expected: acknowledged update before local success. | `lib/services/crm-service.ts:254`, `:277`: stage changes prepared separately; update requests returned row with `.select('*').single()`; errors/zero-row results reject; cache changes only after acknowledgment. Demo scheduling fields are included in the write. | Application handling of legitimate database/network failures. Mock RLS denial reproduces it; no live write attempted. |
| Follow-up history failure hidden | Second write only warned on error. Expected: no claim that both writes succeeded. | `lib/services/crm-service.ts:299`: explicitly reports that stage saved but history failed, retaining the acknowledged stage. Date fields use SQL date format. **Two statements are still not an atomic transaction**; this limitation is explicit, not hidden by rollback claims. | No server defect demonstrated. A future transactional implementation needs isolated integration testing. |
| Unhandled rejected stage promise | Page awaited the service without catch/pending state. | `app/(dashboard)/crm/leads/page.tsx:317`, `:338`: pending guard, retained input, visible alert, no unhandled rejection. Browser test passes. | None. React event-handler defect. |
| Live search ignored | Live query returned before shared search logic. Empty/error results fell back to stale local leads. Expected: matching rows only, genuine empty results honored, errors shown. | `lib/services/crm-service.ts:13`, `:29`, `:46`: shared filtering, normalized text, empty-cache handling, no local fallback on query failure. Page shows load errors and discards stale asynchronous responses. Existing search over the fetched result set is preserved; large-dataset pagination is not newly implemented. | Application control-flow defect. |
| Shared database adapter hid live rejection | `RlsQueryBuilder.execute()` fell through to local RLS operations after database errors; `.select()` also changed an update into a read. | `lib/supabase/db.ts:140`, `:164`, `:308`, `:333`: preserve mutation action when requesting rows and return remote/transport errors. Local adapter remains for explicit non-live mode. Four new regressions pass. | Supabase could return an error correctly; the application hid it. |
| Live authentication accepted local identities after rejection | Credentials, payment session, middleware, and provider could accept local credential/cookie/cache/profile fallbacks. Expected: live rejection or missing live profile fails closed. | `lib/auth/credentials.ts:93`, `:100`; `lib/auth/payment-session.ts:38`; `middleware.ts:126`; `components/providers/auth-provider.tsx:103`, `:246`, `:258`, `:393`: no local identity replacement in live mode; local auth restricted to test/development. Existing residual auth assertions now expect rejection. Actual provider browser tests show cached admin ignored and zero permissions. | Application authorization defect, not Supabase accepting invalid credentials. |
| Valid server login needed real session cookies once fallback removed | Generic database client sign-in did not provide the route's SSR cookie persistence. | `app/api/auth/login/route.ts:71` supplies the existing SSR cookie-aware client to `verifyUserCredentials`; optional injection at `lib/auth/credentials.ts:49`, `:65` preserves browser callers. Valid live login/cookie restoration still needs staging integration verification. | Client integration issue, not verified server failure. |
| **Remaining: cached counsellor accepted after live profile denial** | Concurrent writer restored `profile = store.users.find(...)` at `lib/services/crm-service.ts:139` after an unsuccessful live lookup. Expected: reject. Actual: new regression resolves successful creation using the cached actor. | **FAIL, unresolved in current workspace.** Reviewed corrected service retained as `reviewed-crm-service.ts.txt`, with proposed difference in `remaining-crm-correction.patch.txt`. Not repeatedly reapplied over competing edits. | Application fallback defect. No database bypass was introduced by this run. |

## Database/configuration validation

- `.env.local` points to the connected production project; `.env.staging` points elsewhere, but no disposable staging identity was verified. The LMS connection listed only production, `ACTIVE_HEALTHY`. Environment summary records presence/types only, not values.
- Public configuration contains a publishable key; the service-role value was not duplicated into a `NEXT_PUBLIC_*` variable. Credential acceptance itself was not tested with production accounts. Browser `getDb()` uses the shared SSR browser client/session; service-key branch is server-only. No frontend credentials were added.
- Read-only SQL confirmed UUID primary/related IDs, profile active/role fields, lead stage check constraints, and RLS enabled on courses/profiles/leads/followups. CRM role policies exist. This is metadata verification, **not proof of all-role RLS behavior**, tenant isolation, or valid-user writes.
- `leads.interested_course_id` is nullable; the returned production constraint list did not include a course foreign key. Do not assume the database rejects an arbitrary UUID course reference. UI selections now come from authorized query results, but durable integrity needs schema review and staging verification.
- Migration history returned two recorded migrations (onboarding and payment approval). Existing local 010/011 migration files were not applied. Read-only function inspection reported `commit_fee_workflow` does **not** contain the checked `UPDATE public.leads` synchronization statement; deployed behavior cannot be assumed to match local 011. This is a deployment/schema alignment blocker, not a migration applied by this run.
- Advisor notices included a mutable search path and public execution on `get_current_user_role`, a no-policy RLS table for `fee_workflow_state`, and disabled leaked-password protection. Some may be intentional server-only design; none was changed here. See [function search-path guidance](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [public SECURITY DEFINER guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Evidence: `environment-check.json`, `database-readonly.json`. Log investigation requested aggregate counts only, avoiding customer rows or raw authentication logs. Supabase [update/returned-row documentation](https://supabase.com/docs/reference/javascript/update) and [SSR client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client) were checked; the changelog was consulted before implementation.

## Regression results and remaining failures

| Check | Executed result |
|---|---|
| TypeScript | PASS, exit 0, `typecheck-current-final.log` for the reviewed copy before the last conflicting CRM service edit. |
| ESLint | PASS, exit 0, `lint-current-final.log`, same scope. |
| Production build | PASS, exit 0, `build-current-final.log`, same scope. No deployment. |
| Last complete suite against copied final CRM edit | **FAIL: 743 passed / 14 failed / 757 total, 59 passed / 5 failed files**, exit 1. `tests-last-workspace.log`. No unhandled-test error reported in this final run. |
| New regressions | **28/29 PASS** in that run: 14/15 CRM, 4/4 adapter, 10/10 auth. Remaining CRM test rejects cached counsellor fallback and correctly fails on the concurrent edit. |
| Prior stable snapshot | 756/756 passed before the extra regression and subsequent seed/fallback edits. Historical result only; superseded for current-workspace assessment. |
| CRM component browser | 11 checks PASS: required fields, default course/counsellor UUIDs, failure retention, success display, synthetic backend reload, search, stage filters, stage error retention, no unhandled rejection, option-load failure. `browser-regression.json`. Backend/auth mocked; not live durability. |
| AuthProvider browser | Both live-rejection and missing-profile scenarios PASS: cached admin ignored, no permissions, login rejected, no local verification fallback; zero pageerrors. `browser-auth.json`. |
| Real isolated production server | 7 checks PASS: login page, protected CRM/admission/accounts redirects, admission/payment/login API unauthenticated rejection (401). Final run: zero console errors, pageerrors, or failed requests. `browser-server.json`. Authenticated live workflows unavailable. Server stopped after testing. |
| Staging integration | **BLOCKED**: no verified disposable database or valid staging test accounts. No inserts, updates, deletes, migrations, or real payment actions executed against production. |

The current repository already had **728** tests at the start, not 727 (a fourth atomicity test had been added concurrently after the earlier report). This run added 29 cases. Two existing residual authentication assertions were corrected from asserting defective acceptance to asserting rejection; access-gate fixtures now supply a verified session, and the CRM live-contract fixture supplies the required staff lookup and awaits it. No existing test was skipped to obtain these totals.

Final failure breakdown:

1. **1 CRM regression**: `tests/crm-authoritative-regression.test.ts` — live profile denial accepts cached counsellor. Reproduce `npx.cmd vitest run tests/crm-authoritative-regression.test.ts`. Confirmed cause at `lib/services/crm-service.ts:139`, introduced again by concurrent editing.
2. **7 counsellor payment + 4 fee approval + 1 dual-ledger tests**: a concurrent change removed/replaced `usr-counsellor` in `lib/services/data-store.ts`, while tests still pass that ID (`tests/counsellor-payment-workflow.test.ts:8`, `tests/fee-approval-workflow.test.ts:8`, `tests/dual-ledger-sync.test.ts:9`). `fee-workflow-service.ts:919` correctly rejects the missing recording actor. These are fixture/identity mismatches, not evidence that Supabase denied payment approval. The ID migration and payment modules were not reverted or patched by this run.
3. **1 platform-admin test**: `tests/platform-admin-operations.test.ts:718` expects 403 for a known counsellor, but the removed local actor yields 401. Same fixture-ID mismatch.

The gateway verification case intermittently failed in earlier runs with `Payment amount (5000) exceeds outstanding balance (0)` and HTTP 500, then passed in the last run. This pre-existing fixture/persistence timing issue remains suspected, not fixed or hidden. Earlier logs are retained. Initial browser-server harness failures came from its overly narrow loopback allowlist and an Origin mismatch; both were corrected in the harness without weakening application checks. Final server evidence has no failed requests.

## Changes made and concurrent work preserved

Application files edited by this run:

- `app/(dashboard)/crm/leads/page.tsx`
- `lib/services/crm-service.ts`
- `lib/supabase/db.ts`
- `lib/auth/credentials.ts`
- `lib/auth/payment-session.ts`
- `components/providers/auth-provider.tsx`
- `middleware.ts`
- `app/api/auth/login/route.ts`

Tests added: `tests/crm-authoritative-regression.test.ts`, `tests/live-db-fail-closed.test.ts`, `tests/auth-fallback-regression.test.ts`. Related fixtures/assertions updated: `tests/audit-crm-live-contract.test.ts`, `docs/audits/page-evidence/residual-probes.test.ts`, `docs/audits/evidence-20261017/auth-reproductions.test.ts`.

Evidence/report files were created under this directory; this report was appended to root `TEST-REPORT.md`. Environment files, dependencies, migrations, admissions/payment implementation, seed data, and upload code were not changed by this run. Their pre-existing/concurrent modifications remain.

Concurrent work also changed `data/institute_store.json`, the seeded counsellor identities, and added `scripts/proxy-3001.cjs` and `tests/crm-counsellor-selection.test.ts`. The last new test appeared after the final suite snapshot and is **not included in the 757 executed count**. Its latest contents and other subsequent edits remain unverified. Source snapshots/hashes and `git-status-after.txt` distinguish this moving workspace from executed copies.

## Commands and next actions

Executed using `npm.cmd`/`npx.cmd` in PowerShell: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd test`; Playwright harnesses via `node .../browser-regression.cjs`, `node .../browser-auth.cjs`, `node .../browser-server.cjs`; isolated server via `npm.cmd run start -- --hostname 127.0.0.1 --port 3181`. Exit codes/results are above. Source inspection used `rg`, `Get-Content`, `git diff`, and SHA-256 hashing. Read-only connected Supabase calls inspected projects, migrations, schema, constraints, policies, function metadata, advisors, and aggregate logs. No remote write tool was used.

To complete safely: pause the competing editor, reconcile the restored counsellor fallback using the reviewed correction, align tests with the intended counsellor fixture IDs without weakening authorization, and rerun all checks on a stable working tree. Then verify migrations, RLS, real login/session restoration, refresh durability, conversion, and accountant approval/rejection/duplicates on an isolated staging database. Until those checks succeed, **do not deploy or claim production readiness**.
