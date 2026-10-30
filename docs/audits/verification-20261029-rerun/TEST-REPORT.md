# Independent verification — 29 October 2026 (Asia/Calcutta)

**Overall result: FAIL.** The existing automated suite passes, but additional probes and existing tests that deliberately assert defective behavior confirm CRM and authentication failures. Live database and full-application browser testing are **BLOCKED**, not passed. No application fixes were made.

This is a new run against the current working tree, including its uncommitted changes. Earlier report sections are retained as historical material; their claims are not this run's conclusions.

## Scope, isolation, and preservation

- Inspected ancestor/repository instructions (no AGENTS.md found), package scripts, Vitest/Next/TypeScript configuration, test setup, database adapters, and environment variable names. Used the Supabase skill for database/auth review. No schema or auth settings changed.
- Both `.env.local` and `.env.staging` identify remote endpoints and contain service-key settings. A staging filename does not establish isolation. Neither database was verified disposable; no live database writes, payment-provider calls, or production data changes were attempted. No live test account was used.
- Tested disposable source copies without `.env*`, existing `data`, or prior build output. Installed dependencies were linked, not reinstalled. Tests use mocks and temporary file persistence. Browser requests were intercepted and synthetic only. Paths are recorded in `run-paths.json`.
- SHA-256 comparison of **854 existing files** found **zero changes before appending this report** (`preservation-check.json`). Existing code, migrations, tests, checkpoints, and prior evidence were preserved.
- Browser automation: installed Playwright with headless Chrome. The actual CRM page component was bundled with mocked auth/store/services. This proves component behavior, not Next middleware, real login, database integration, or persistence across refresh.

## Executed scenario results

| Scenario | Actual result and evidence |
|---|---|
| TypeScript | PASS, `npm.cmd run typecheck`; `typecheck.log`. Additional full-source check recorded separately. |
| ESLint | PASS, no errors/warnings; `lint.log`. |
| Production build | PASS in same-drive disposable copy; `build-same-drive.log`. Initial cross-drive copy failed module resolution; see command notes. Build used synthetic configuration, not deployment secrets. |
| Existing automated tests | PASS: **727/727 tests, 61/61 files**; `test-all-existing.log`. Includes four pre-existing suites under `docs/audits`. Passing defect-reproduction assertions are not evidence of correct behavior. |
| Additional CRM correctness probes | FAIL: **3/3** expected-correctness assertions fail; `crm-boundary.log` and `crm-boundary.test.ts.txt`. |
| Role login | PASS in synthetic credential tests for all nine configured roles: super_admin, admin, accountant, counsellor, trainer, placement_coordinator, support, onboarding_team, student (`tests/login-security.test.ts:19`). Live login remains unverified. |
| Access permissions | Existing auth-provider, middleware, RLS-policy, database-API-security, and security-hardening suites pass in mock/local mode. Includes inactive users, student isolation, finance/academic restrictions, and forged roles. Real Postgres RLS and complete browser access matrices are unverified. Authentication fallback defects below remain confirmed. |
| Open `/crm/leads` | PASS only for actual component rendered at an intercepted fixture URL. Real Next route/middleware navigation BLOCKED. |
| Open New Lead | PASS in Chrome component harness. |
| Required-field validation | PASS for empty name, phone, email: three invalid inputs; zero submissions. Required course behavior FAIL (F01). |
| Course/counsellor selections | Fixture UUIDs appear in both selects. Displayed course is omitted from default submission (F01). No verification of real database ID existence. Dropdowns use local `store.courses`/memoized users, not the unused option states. |
| UUID handling | Existing audit/remediation tests PASS: UUID lead generation, preservation of related UUIDs, legacy course ID rejection. Real foreign-key acceptance and schema compatibility BLOCKED. |
| Successful lead save | PASS for mocked service acknowledgment and row display only. Database commit and refresh persistence BLOCKED. |
| Failed New Lead save | PASS: synthetic HTTP 500 body is displayed, entered form retained, no unhandled rejection, no false success. Console records the expected failed request and handled error. |
| Search | PASS in component for matching/nonmatching names; live service search FAIL (F04). |
| Stage filters | PASS in component: Lost hides New lead, All restores it after React settles. |
| Stage changes/follow-ups | Existing local lifecycle tests PASS. Authoritative update error handling FAIL (F02), rejected service promise UI handling FAIL (F03). Live follow-up persistence BLOCKED. |
| Lead-to-admission conversion | Existing local/mock tests PASS for valid conversion, duplicate/missing lead rejection, same-process concurrent conversion, and rollback. `lead-conversion-atomicity.test.ts` has three passing cases; `remediation-contract.test.ts` covers duplicate and missing lead. |
| Admission saving/failure | Existing CRM/admission tests PASS; server-rejected admission does not fabricate local success (`audit-admission-failure-contract.test.ts`). Real SQL/RPC commit, durable refresh, migration installation, and cross-process concurrency BLOCKED. |
| Counsellor-to-accounts approval | Counsellor-payment, fee-approval, student-fee-payment, and roster-contract suites PASS locally: pending verification, balance unchanged until approval, independent accountant verification, ledger/receipt creation, roster updates. |
| Rejection/resubmission | PASS locally: accountant rejection, corrections, and counsellor resubmission (`counsellor-payment-workflow.test.ts:255`). Real multi-user browser flow BLOCKED. |
| Duplicate payment/admission submissions | PASS locally for duplicate UTR validation, replay handling, and admission idempotency (`student-fee-payment-approval-workflow.test.ts:150`, `fee-workflow-audit-reproductions.test.ts:249`, gateway suite). Real concurrent database submissions BLOCKED. |
| Payment role restrictions | PASS locally for self-approval denial, non-accountant denial, inactive/unknown roster rejection, trusted role overwrite, tenant mismatch rejection. Live rejected-session fallback FAIL (F05) under mocked auth. |
| Browser errors/network responses | Recorded in `browser-crm.json`. Synthetic `/mock-leads` HTTP 500: `{"error":"Synthetic database rejection (23503): related course missing"}`. New Lead handles this; stage rejection raises pageerror with no alert. No live response bodies were collected. |

## Confirmed failures, reproduction, causes, and severity

### F01 — High: displayed default course is not submitted

Reproduce: render CRM with one valid UUID course and counsellor; open New Lead; fill required name/phone/email; leave displayed course untouched; submit. Browser select value is the fixture course UUID, but submitted `interested_course_id` is `""`. The independent service probe accepts this empty value instead of rejecting it.

Confirmed cause: `app/(dashboard)/crm/leads/page.tsx:103` initializes `courseId` empty, `:219` sends it, and `:839` renders options without synchronizing the initial state or requiring a valid selection. `lib/services/crm-service.ts:114` validates only nonempty IDs; `:163` turns empty into null. Evidence: `browser-crm.json` (`options`, `failedSave.submittedCourse`) and second failed boundary probe. A real database's response to null was not tested.

### F02 — High: rejected database stage/follow-up writes report success locally

Reproduce: run first boundary probe; seed UUID lead; mock database update returning `42501 / Synthetic RLS rejection`; request Follow-up. Expected rejection instead resolves with the modified lead.

Confirmed cause: `lib/services/crm-service.ts:218` mutates the lead and `:226` persists before database acknowledgment; `:245` only logs update errors, `:258` only logs follow-up errors, and the service returns success. Evidence: `crm-boundary.log`. Live RLS rejection itself was simulated, not induced against a database.

### F03 — Medium: rejected stage-update promise has no user-facing handling

Reproduce: use browser harness, create synthetic lead, click Update, then Save Updates with the service configured to reject. Chrome reports `Synthetic stage save rejected`; no alert appears.

Confirmed cause: `app/(dashboard)/crm/leads/page.tsx:244`, especially `:260`, awaits `updateLeadStage` without try/catch. Evidence: `browser-crm.json`, `stageFailure`. This is separate from F02: many database errors are swallowed by the service, while errors that do escape are unhandled by the page.

### F04 — Medium: live getLeads search ignores the search argument

Reproduce: third boundary probe mocks a successful live query with one lead, then calls `getLeads({search:'does-not-match'})`. It returns that lead, not an empty result.

Confirmed cause: `lib/services/crm-service.ts:31` returns live data before the search logic at `:49`; the live query does not apply search. Evidence: `crm-boundary.log`. The current page's own local filtering passed; this finding concerns the service contract.

### F05 — High: rejected live authentication falls back to local identity

Reproduce existing synthetic tests `docs/audits/page-evidence/residual-probes.test.ts:20` and `:25`. The first mocks live session rejection and supplies a legitimately signed fixture cookie identifying a known local actor: authentication still returns that actor. The second sets production mode, mocks live password rejection, and supplies a built-in fixture credential for a known local actor: login succeeds. No credentials are reproduced here.

Confirmed cause: `lib/auth/payment-session.ts:35` falls through to signed-cookie/local-roster lookup after live verification fails; `lib/auth/credentials.ts:92` falls through to local credentials without restricting that path to test/development. Both existing tests PASSED because they assert the defective behavior. Evidence: `test-all-existing.log` and the cited test bodies. This demonstrates fallback behavior under mocks, not exploitation of a deployed instance; unsigned arbitrary cookies were not accepted by this test.

### F06 — Low, outside primary scope: repeated quiz attempt inflates progress

Existing `docs/audits/page-evidence/residual-probes.test.ts:30` executes the same successful quiz twice and confirms progress rises from 0 to 30. Cause: `lib/services/academics-service.ts:1669` adds 15 on each attempt rather than deriving unique completion. Existing assertion PASSED because it reproduces the defect. Included because the requested full suite executed it.

## Suspicions and limits (not confirmed failures)

- Local dropdown rows may be stale, inactive, or contain legacy IDs in a live session. The page uses local store lists and memoizes counsellors once; actual live membership/ID loading was not exercised. The unused option states do not populate the form.
- Successful browser save surviving reload, authoritative lead reload, SQL transaction behavior, tenant RLS, notification delivery, upload storage, and real accountant approval remain unverified.
- Initial restricted test run failed gateway verification with HTTP 500: `Payment amount (5000) exceeds outstanding balance (0)`. Subsequent clean-environment runs passed, including the complete suite. Fixture hydration/timing sensitivity is suspected; a persistent application defect is not established.
- The initial password-recovery client failure was caused by the harness setting a publishable mock key, which took precedence over that test's anon key. It passed after removing harness overrides. Do not treat that initial failure as an application regression.

## Recommended fixes, priority order (not implemented)

1. Make live authentication fail closed; isolate local credential/session paths to explicit test/development mode. Convert residual auth probes into rejection regressions.
2. Synchronize/require the selected course; populate course and active counsellor options from authoritative permitted records and validate membership/foreign keys server-side.
3. Make stage/follow-up persistence authoritative and atomic; avoid local success before acknowledgment and surface errors. Add page-level pending/error handling.
4. Apply search consistently in the live service path.
5. Add safe isolated integration/browser coverage for refresh durability, all-role login, conversion, duplicate payments, rejection/resubmission, and cross-process concurrency.
6. Stabilize gateway fixtures and make quiz completion idempotent.

## Commands and results

Commands used PowerShell with `npm.cmd`/`npx.cmd`. Test command exit codes below are npm/Vitest exit codes (the enclosing log-capture shell can exit zero after printing a failed command's result).

| Command | Result |
|---|---|
| `git status --short`, `rg --files`, targeted `rg -n`, `Get-Content` | Repository/scripts/source review completed. A few exploratory path/glob reads failed; corrected paths used afterward. Environment values were excluded from the report. |
| `Get-FileHash -Algorithm SHA256` | 854 existing files preserved before report append. |
| `robocopy ... /E /XD ... /XF .env* ...` and dependency junction creation | Disposable copies created; no application mutation. Exact locations in `run-paths.json`. |
| `npm.cmd run typecheck` | Exit 0; `typecheck.log`. Full-source rerun: `typecheck-all-existing.log`. |
| `npm.cmd run lint` | Exit 0; `lint.log`. |
| `npm.cmd test` with mock public environment overrides | Exit 1; 713 pass / 2 fail, 57 files. `test.log`. Harness-related/transient failures discussed above. |
| `npm.cmd test` without those overrides | Exit 0; 715 pass, 57 files. `test-clean-env.log`. |
| `npm.cmd test -- --exclude tests/verification-crm-boundary.test.ts` | Exit 0; **727 pass, 61 files**, after adding all four pre-existing docs suites to scratch. Exclusion applies only to this run's new intentional failing probes, not existing tests. `test-all-existing.log`. |
| `npx.cmd vitest run tests/verification-crm-boundary.test.ts` | Exit 1; 3 failures documenting F01/F02/F04. Source retained as `.ts.txt` to avoid changing default test discovery in the original workspace. |
| `npm.cmd run build` in C-drive scratch with E-drive dependency junction | Exit 1; generated Next client entry paths could not resolve across drives. `build.log`. |
| `npm.cmd run build` in E-drive scratch | Exit 0; `build-same-drive.log`. Webpack cache performance warnings, no build failure. |
| `node docs/audits/verification-20261029-rerun/browser-crm.cjs` | Exit 0; component probe completed, defects recorded rather than encoded as process failure. JSON/log evidence retained. Repeated after adding settled filter assertions; both filters pass. |
| `npm.cmd run start -- --hostname 127.0.0.1 --port 3179` | BLOCKED by automatic approval policy before execution; only reason supplied: `blocked by policy`. No server started by this command. |

## Created/changed files and final status

Only this run's evidence directory `docs/audits/verification-20261029-rerun/` was created in the project, and this report was appended to the pre-existing root `TEST-REPORT.md`. No application code, existing tests, migrations, environment files, or package files were edited. Scratch copies/build artifacts outside the project are retained at the paths in `run-paths.json`.

Final `git status --short` is recorded in `git-status-after.txt`. Relative to the initial status, the new evidence directory is the only additional status entry; root `TEST-REPORT.md` was already untracked and is now appended. All other modified/untracked entries predate this run. Hash verification and report-prefix verification are recorded in `preservation-final.json`.

## Final correction: concurrent workspace edits detected

The final preservation check supersedes the earlier final-status paragraph above. The first check verified all 854 pre-existing files unchanged. During report preparation, a separate writer changed seven pre-existing files: `tests/lead-conversion-atomicity.test.ts`, `app/(dashboard)/admissions/page.tsx`, `app/(dashboard)/crm/leads/page.tsx`, `app/api/fees/proof/route.ts`, `components/ui/file-upload.tsx`, `lib/services/admission-service.ts`, and `lib/services/payment-workflow-transaction.ts`. A new `supabase/migrations/011_commit_fee_workflow_lead_sync.sql` also appeared. These changes were not made, reverted, or overwritten by this testing run. Their author and intent were not established.

**Results and line references apply to the preserved source snapshot captured at the start of this run. The newer concurrently edited versions have NOT been tested, so the latest moving working tree is unverified.** Hashes are in `hashes-before.json`; source snapshots are retained at both paths in `run-paths.json`. Do not interpret a snapshot finding as proof that the newer file still has that defect.

The final full-source TypeScript rerun completed with exit 0 (`typecheck-all-existing.log`). All checks reported above were completed against the isolated snapshot. The root report's original byte prefix was verified intact. This run itself created only the verification evidence folder and appended to `TEST-REPORT.md`; it made no application changes. See `preservation-final.json` for the differences and `git-status-after.txt` for the final status, which includes both prior and concurrent work.