# Next Gen LMS — 100 concurrent authenticated users performance report

## Decision

**BLOCKED — the LMS has not been verified to handle 100 concurrent authenticated users.**

Staging isolation could not be positively established. The supplied instructions explicitly require stopping in that situation. No load generator, synthetic-user creation, financial mutations, video traffic, or external notifications were executed. This is an evidence-based preflight result, not a successful load test or a capacity estimate.

**Maximum verified sustainable concurrency: unknown. Actual authenticated virtual users launched in this execution: 0.** This does not mean the application's capacity is zero.

## Execution and environment

- Preflight performed: **16 October 2026, approximately 16:06 IST (Asia/Calcutta)**.
- Workspace: `E:\my erp hub\next gen lms`.
- Git HEAD inspected: `0d2f2e663b7716e1213124b231b663777ae2a7a1`.
- Working tree is dirty, including financial routes, admission/onboarding services, middleware, Next configuration and local data. HEAD alone does not describe the current source. **No commit was load-tested.**
- `.env.local` points to `localhost:3000` and Supabase project `tgohtdzwehhjfahtgovq`. That is the project used for the application's operational accounts and financial workflow earlier in this session, not a positively isolated load-test database.
- `.env.example` references the same Supabase project. No dedicated staging environment file, separate database reference, or staging deployment was discovered in the inspected configuration.
- `render.yaml` defines one web service, `next-gen-sap-lms`, with production URL `https://lms.next-generpsolutions.com`, `NODE_ENV=production`, automatic deployment, and Supabase credentials supplied externally. It does not define an independent staging service/database. Declared Render plan is `starter`; actual running infrastructure configuration was not queried or verified.
- Package configuration uses Next.js 14.2.24 and React 18.3.1. Installed package/tool configuration does not establish production capacity.
- `k6` was not found on the current PowerShell PATH. No Playwright/Lighthouse dependency or configured test suite was found in `package.json`. None of those tools was installed or executed for this blocked run.
- Credentials were inspected only for configuration presence/host identity; secret values were not written into this report or logs.

## Performance summary

| Metric | Actual result | Target | Status |
|---|---|---|---|
| Concurrent users | 0 launched; capacity unknown | 100 separate authenticated users | BLOCKED |
| p50 API latency | Not measured | Establish baseline | NOT TESTED |
| p95 API latency | Not measured | Under 800 ms, provisional | NOT TESTED |
| p99 API latency | Not measured | Report | NOT TESTED |
| Average API latency | Not measured | Report | NOT TESTED |
| Error rate | Not measured; not 0% | Under 1%, provisional | NOT TESTED |
| Throughput | Not measured; no workload launched | Report RPS | NOT TESTED |
| Timeouts | Not measured | Report count/rate | NOT TESTED |
| Application CPU usage | Not measured | Report process/container usage | NOT TESTED |
| Application memory | Not measured under load | Report baseline, peak and recovery | NOT TESTED |
| Database connections/pool | Not measured | Report active/waiting/max | NOT TESTED |
| Database CPU/memory | Not measured | Report | NOT TESTED |
| Video start latency | Not measured | Report actual playback | NOT TESTED |
| Payment integrity | No financial test transactions executed | Zero duplication/corruption | NOT TESTED |
| Frontend LCP/INP/CLS | Not measured | Record actual browser observations | NOT TESTED |

## Phase 1 — Isolation gate results

| Required gate | Evidence | Result |
|---|---|---|
| Separate staging application | Only production Render configuration and a localhost app were identified | BLOCKED |
| Independent staging database/Auth/Storage | Local configuration uses the existing operational Supabase project | BLOCKED |
| No production credentials | Existing server/public credentials target that project | BLOCKED |
| Synthetic-only identities/data | Existing environment contains operational accounts/data; no isolated 100-user fixture | BLOCKED |
| Payment providers disabled/mocked | Gateway code has mock fallbacks, but no verified staging egress/provider configuration | BLOCKED |
| Email/WhatsApp disabled/captured | Notification code can use external providers when credentials are configured; no staging sink verified | BLOCKED |
| Infrastructure monitoring | No identified staging instance/DB monitoring access or measurement pipeline | BLOCKED |
| Production traffic unaffected | Cannot guarantee with the shared operational database | BLOCKED |

No remote database diagnostics were run during this performance preflight. The previous audit's metadata checks are historical evidence, not current load measurements. A localhost application connected to an operational cloud database is **not isolated staging**. Another tenant in that same database would also share CPU, connections and locks and would not satisfy the independent-database requirement.

The previous workflow audit found a production build failure and critical financial/activation defects. Files have changed since that audit; this preflight does not assume those issues remain unchanged or have been fixed. A fresh successful production build and regression validation are mandatory staging prerequisites.

## Existing benchmark artifacts are not accepted as load-test evidence

Files inspected but **not executed or overwritten**:

- `scripts/performance-audit.ts`
- `tests/performance-benchmark-results.json`

The script embeds literal `estLcpMs`, `estCls` and `estInpMs` values at lines 288–297. Those values are estimates, not browser measurements. It imports application stores/services directly, seeds hundreds of records, and runs service promises. It does not establish 100 separately authenticated HTTP/browser users. It has no positively verified staging target gate. Its service mutations are inappropriate to run against the current configuration without isolation.

The existing JSON's claimed dataset size, frontend estimates and benchmark outputs were produced outside this execution and have not been independently verified. They are not used in the summary table, throughput, latency, memory-leak conclusion, or production-readiness decision. A local Promise workload is not a substitute for sessions, middleware, RLS, network, database contention or media playback.

## Phases 2–8 — Execution status

| Phase | Result | Explanation |
|---|---|---|
| Create 100 synthetic users | BLOCKED | No isolated Auth/database confirmed; no accounts created |
| 30-second ramp, 180-second sustain, 30-second ramp-down | BLOCKED | Safety gate not satisfied; zero load traffic |
| Playwright/Lighthouse frontend checks | NOT TESTED | No staging target or authenticated browser fixtures |
| API/server performance | NOT TESTED | No endpoint traffic baseline or monitored load run |
| Database performance | NOT TESTED | No isolated database or safe load window |
| 70 simultaneous student video sessions | NOT TESTED | No authorized synthetic media/entitlement fixtures or playback run |
| Concurrent Accounts/payment/onboarding workflow | NOT TESTED | No staging financial fixture or permitted target |

## Endpoint-level scope discovered in source

All results below are **NOT TESTED**, with no latency or RPS claimed. Methods and authentication must be checked in the exact frozen staging revision before scripting requests; do not infer writable methods from a page URL.

| Discovered route/page | Intended staging measurement |
|---|---|
| `/login` and Supabase Auth client flow | Separate-user login, token refresh, auth latency/errors |
| `/dashboard`, `/portal`, `/academics/courses`, `/academics/batches` | Role-specific page loads, rendering and actual downstream requests |
| `/crm/leads`, `/crm/followups` | Counsellor navigation/search and discovered data operations |
| `/api/admissions` | Valid synthetic admissions and persistence/retry behavior |
| `/api/fees/payments` | Payment read/record/update/approve/reject latency and integrity |
| `/api/fees/proposals` | Authorized fee decisions and revision operations |
| `/api/fees/proof` | Private synthetic proof upload and authorized download |
| `/api/fees/receipts`, `/api/receipts/[id]/pdf` | Correct receipt reads and real PDF generation cost |
| `/api/onboarding/cases`, `/api/onboarding/cases/[id]` | Assignment, authorized updates and prerequisites |
| `/api/onboarding/analytics` | Role-scoped aggregate query cost |
| `/api/workflow/notifications` | Polling overhead and role-scoped responses |
| `/api/storage/signed-url`, `/api/storage/signed` | Authorized media URL generation; distinguish from media bytes |
| `/api/realtime/stream` | Long-lived connection behavior, if used by the journey |

Course listings, student progress, trainer operations and CRM behavior must be driven through the actual page's implemented requests. No `/api/courses` or `/api/progress` endpoint is assumed. Batch allocation must be exercised through a confirmed supported operation, not by inventing an endpoint or directly marking a checklist complete.

## Phase 9 — Inspection findings and scalability candidates

These are confirmed **implementation characteristics or test blockers**, not measured performance bottlenecks. Numeric improvements cannot honestly be predicted without a baseline.

| ID / Severity | Module, file/function | Baseline | Root cause and impact | Recommendation | Expected improvement / verification |
|---|---|---|---|---|---|
| PERF-01 Critical blocker | Environment: `.env.local`, `render.yaml` | No isolated target | Existing operational DB would receive test traffic and synthetic writes | Independent staging app, DB/Auth/Storage and secrets | Enables safe measurement; verify project IDs and outbound hosts before any test |
| PERF-02 High evidence defect | `scripts/performance-audit.ts:288`, frontend literals and service workload | No accepted browser/API baseline | Estimated vitals and direct calls can overstate readiness | Replace with browser measurements and independently authenticated HTTP VUs | Measurement validity, not a quantified speed gain; retain raw traces and summaries |
| PERF-03 High scalability risk | `lib/services/payment-workflow-transaction.ts:8`, `paymentTransaction` | Not measured | A module-global promise queue serializes reads and writes, including unrelated tenants | Measure queue wait; evaluate tenant-scoped queues/read models and DB transactions | Potential lower head-of-line blocking; quantify p95/p99 and integrity under independent-process concurrency |
| PERF-04 High scalability risk | `payment-workflow-transaction.ts`, `workflowSnapshot` in `payment-workflow-state.ts` | Not measured | Reads load tenant snapshot/roster; writes clone/serialize broad collections and update one revisioned row | Paginated projections and normalized transactional financial records; avoid full-state transport | Potential lower bytes, CPU, allocation and row conflict; measure DB time, payload size, GC and conflict rates |
| PERF-05 Medium scalability risk | `components/layout/header.tsx`; Accounts refresh handlers | Not measured | Periodic refresh requests can synchronize across many clients | Measure request volume; use backoff/jitter, visibility-aware polling or scoped invalidation | Potential lower redundant reads; compare RPS per active user at equal freshness |
| PERF-06 High operational risk | Financial workflow, prior audit report | Historical functional findings only | Functional defects invalidate a fast-but-incorrect payment benchmark | Resolve/retest financial policy, identity, reversal and idempotency blockers | Zero duplicated/corrupted operations is mandatory; verify invariant queries after every phase |

No memory leak, slow-query threshold violation, connection-pool saturation or maximum concurrency is confirmed by this blocked preflight.

## Exact prerequisites to resume safely

1. **Identify the staging application URL and owner.** Provide a separate deployment/instance running a production build of a frozen revision. Do not use the production domain. Preserve the exact commit and any patch hash.
2. **Provision an independent Supabase project** with separate database, Auth users and Storage buckets. Confirm its project reference differs from `tgohtdzwehhjfahtgovq`. A schema/tenant in the existing project is insufficient. A verified fully local isolated Supabase stack can support local tests, but those results must not be claimed as cloud production capacity.
3. **Install staging credentials outside tracked files.** Use dedicated server-only keys and staging public URL/key. Verify both client build-time and server runtime config. Do not paste secrets into chat. Ensure application, callback, realtime, proof and media URLs all target staging/synthetic infrastructure.
4. **Use only synthetic data and identities.** Prepare 70 students, 10 trainers, 8 counsellors, 4 accountants, 4 onboarding staff, 3 admins and 1 super admin. Each needs a real independent Auth identity/session plus correct active profile, tenant and role. Students need actual course/batch entitlements and onboarding/access-gate prerequisites; unready students must not be counted as successful portal users.
5. **Use separate synthetic media and documents.** Supply a playable representative HLS/video asset and document set on test storage/CDN, with valid authorization and permission to generate the traffic. No real student proof or protected production media.
6. **Disable external side effects explicitly.** Payment sandbox/mock adapters only; capture email/WhatsApp in local sinks. Verify provider credentials and outbound destinations, webhook URLs and retries. Missing a key by accident is not a sufficient isolation contract.
7. **Validate build and financial correctness first.** Run current lint, TypeScript, production build, financial regression, authorization and database checks on the staged revision. Recheck the prior audit blockers; do not assume old test results apply to the dirty workspace.
8. **Provide monitoring access.** Application process/container CPU/RSS, event-loop/queue timing, request status/duration/correlation, Supabase query statistics, active/max/waiting connections, lock waits, DB CPU/memory, storage/CDN bytes and errors. Capture all clocks in UTC with IST presentation. Mark any provider metrics unavailable rather than estimate them.
9. **Install and pin test tools.** k6 or an equivalent HTTP VU runner, Playwright with a supported browser, and Lighthouse. Use a separate load-generator host when measuring hosted capacity; record generator CPU, network and potential bottlenecks.
10. **Approve staging traffic budget and stop conditions.** Establish the test window and monitoring operator. Stop on any financial invariant violation, unexpected production host, persistent server/database failures, severe resource exhaustion or provider quota alarm. Preserve evidence and synthetic-run IDs for cleanup.

No infrastructure was provisioned, no deployment was performed, no schema was changed and no cost-incurring resource was created by this preflight.

## Required workload and measurement contract after the gate passes

- Authenticate each of the 100 users independently; never share a token. Report login throughput separately from steady-state request latency. Validate authorization/content, not only HTTP 200.
- Run 0→100 VUs over 30 seconds, hold 100 for 180 seconds, then 100→0 over 30 seconds. Include realistic think times; document journey mix and repeated actions. Report observed active VUs, not merely the configured maximum.
- Warm up and label cold-start/compile effects separately. Use the production server, not `next dev`. Report both aggregate and endpoint/method/role p50/p95/p99/mean, samples, RPS, error and timeout rates. Include failed requests rather than dropping slow failures.
- Baseline and loaded browser runs must record navigation timing, LCP, real interaction INP where available, CLS, JS tasks, requests and memory. Lighthouse TBT is not INP. Capture console errors/screenshots/traces per route.
- Video tests require 70 actual authorized playback sessions, first decoded-frame latency, stalls/time stalled, seeking and measured media bytes. A successful manifest or signed URL is not successful playback.
- Financial scenarios need unique seeded requests plus intentional duplicate/retry/concurrent requests. Pair counsellor submissions with different Accounts users. Test reject/resubmit, amount limits, policy-driven partial clearance, lost response, atomic ledger/receipt/handoff and proof authorization.
- Reconcile database invariants before/after phases: no duplicated request/payment/receipt identities; verified sums equal financial balances; rejection does not credit; correct student/enrollment/tenant links; one required onboarding case; immutable audit trail; no early access activation.
- Use safe diagnostics on the independent database: `pg_stat_activity`, `pg_stat_statements` if available, lock/wait metrics and read-query EXPLAIN analysis. Do not run mutation EXPLAIN ANALYZE against financial tables or modify production settings.
- Save raw per-request/browser/monitoring evidence plus tool versions, run ID, fixture counts and build hash alongside the final summary. A three-minute sustained run cannot establish absence of long-term memory leaks; a later soak test is necessary.

## Readiness and scaling to 500+ students

**100 authenticated concurrent users: NOT VERIFIED. 500+ registered students: not equivalent to 500 simultaneous users.**

Before claiming capacity, establish staging, resolve current correctness/build gates, complete the requested 100-user run with zero financial corruption, and measure the queue/snapshot/read-refresh characteristics above. Then test progressively higher concurrency and longer soak periods on representative hosting and media infrastructure. Size database connections, application instances and CDN capacity from measured saturation and recovery behavior. No numerical scaling factor, maximum user count or latency improvement is claimed without those measurements.

This report fulfills the explicit stop-and-report path in the supplied instructions. The remaining execution phases require the staging URL, independent database/Auth/Storage and monitoring prerequisites above; production was not used as a substitute.
