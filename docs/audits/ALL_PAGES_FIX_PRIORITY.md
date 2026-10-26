# All pages fix priority

17 October 2026. Frozen source revision `0000e5e6ff878f14d4cbd6704ab93cd769346167`. Audit-only; no application fixes, deployment, operational writes, live accounts or load tests.

Priority counts refer to open source/runtime findings, not page counts. No fix was implemented during this audit.

| Priority | Count |
| --- | --- |
| P0 | 9 |
| P1 | 17 |
| P2 | 2 |
| P3 | 0 |

## P0

| ID | Area | Current status | Required correction |
| --- | --- | --- | --- |
| G02 | Live Auth failure falls back to cookie | Partially fixed | Fail closed in live mode; require current authoritative tenant/profile; remove production default signing secret. |
| G07 | False activation after Auth failure | Partially fixed | Check every Auth/profile result; confirm tenant ownership; compensate failed provisioning and keep access disabled. |
| G11 | Generic fallback passwords | Partially fixed | Return immediately on live Auth rejection; disable all production demo/staging credential fallback. |
| G22 | Unauthenticated bulk import | Partially fixed | Set trusted tenant and inactive onboarding state; reconcile imported financial history via an audited migration flow, not ordinary unverified CSV credit. |
| G23 | Unverified role cookie for audit reads | Partially fixed | Filter authoritative query and response by tenant; replace cache on empty success. |
| G28 | Unauthenticated full-store backup | Partially fixed | Define global vs tenant super-admin scope; redact secrets and use audited encrypted backup artifacts. |
| G29 | Unauthenticated sync and ignored errors | Partially fixed | Unify financial writers and check all pull/push results; enforce tenant filters and recovery. |
| G30 | Unscoped event subscription/injection | Partially fixed | Bind subscriptions/publication to authenticated tenant/user; schema-limit events and verify cross-instance isolation. |
| G31 | Gateway bypasses canonical financial verification | Partially fixed | Validate captured order, owner, tenant, currency/amount; canonical transactional idempotent accounting; disable unconfigured webhook processing. |

## P1

| ID | Area | Current status | Required correction |
| --- | --- | --- | --- |
| G04 | Foreign installment allocation | Partially fixed | Require exact tenant, enrollment, fee-account and installment association, reject nonexistent IDs. |
| G09 | Split authoritative persistence | Still present | Choose a single authoritative model; transactional row writes/constraints or audited projections; test cross-module reload and concurrent readers. |
| G10 | Legacy clearance differs from policy | Partially fixed | Use one verified-ledger eligibility function for live forwarding, manual checklist and legacy backfill. |
| G14 | Client answer keys and repeat progress | Partially fixed | Remove local grading fallback; redact keys at data boundary; validate enrollment, attempts and timing; derive unique completion progress. |
| G15 | Remote failure reported as local success | Partially fixed | Authoritative checked server mutations with durable failure state; verify persisted rows before success. |
| G16 | Course-only batch scoping | Still present | Scope all lessons/assignments/assessments/sessions to enrollment and explicit course-wide visibility. |
| G17 | Invented scores and wrong-course issuance | Partially fixed | Use per-enrollment verified academic results; no fabricated score for absent assessment evidence. |
| G18 | Revoked PDF still issued | Partially fixed | Use revocation-aware private/no-store delivery or cache invalidation and minimal public verification. |
| G19 | Local-only account administration | Partially fixed | Authorize target tenant and role transitions; check Auth/profile responses and commit only after success. |
| G20 | Password reset reports success without reset | Partially fixed | Generate provider-backed recovery/invitation tokens; verify expiry, consume-once and actual login after reset. |
| G24 | Eligibility override has no service authorization | Partially fixed | Enforce policy and tenant server-side on all creation/override entrypoints; immutable decision audit. |
| G26 | Close/delete and empty results do not reconcile | Partially fixed | Check database errors, commit/cache only authoritative success, clear valid empty lists. |
| G27 | Performance SLA report contradicts its metrics | Partially fixed | Replace estimates with isolated authenticated measurements; publish reproducible raw evidence and business assertions. |
| G32 | Unsigned meeting events when secrets absent | Partially fixed | Fail closed for both providers; enforce replay freshness/dedupe and meeting-tenant mapping. |
| G36 | Premature enrollment transition | Still present | Move Enrolled transition into successful admission transaction; cancellation preserves lead stage. |
| G37 | Fallback actor IDs | Partially fixed | Derive every audit actor from server identity; deny missing actor rather than inventing admin. |
| G44 | Attendance effect dependency loop | Still present | Memoize stable students/refresh dependencies or perform effect from stable batch/date/store version. |

## P2

| ID | Area | Current status | Required correction |
| --- | --- | --- | --- |
| G45 | Accounts section not automatically expanded | Still present | Match /accounts and select the accounts state key; test direct links and back navigation. |
| G46 | Native login failure has no visible error | Still present | Render sanitized login error server-side so no-JavaScript users see rejection and recovery guidance. |

## P3

| ID | Area | Current status | Required correction |
| --- | --- | --- | --- |


## Dependency order and acceptance gates

1. Identity first: G02/G11; no live-session or credential fallback; verify disabled/revoked users and tenant membership with real synthetic Auth. G01/G03 regressions must stay passing.
2. Authoritative finance/persistence: G09/G31 and residual allocation/provisioning paths; test approval twice, retry after conflict, reversal, missing provider config, wrong account/order, and failed writes. Prove one receipt/ledger entry and exact balances after restart.
3. Scoped APIs/administration/realtime/storage: tenant A/B positive and negative tests, role transition constraints, redacted backups, audit scope and owned topics.
4. Training/placement correctness: server-only grading, unique progress, enrollment scoping, truthful certificates, policy-bound placement and durable job changes.
5. UI reliability: G44 stable dependencies; G45 account menu; G46 native feedback. Run every control's checklist at all requested widths.
6. Resolve fixture-dependent gateway test without weakening assertions. Expand failure tests to conventional Supabase {error} responses, not only thrown exceptions.
7. Prove independent staging resource isolation before real-user E2E and load. No production stress test as a substitute.

Do not treat “button exists”, successful HTTP transport, local store updates or a passing mock as a persisted business outcome.
