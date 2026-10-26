# Current gaps, regressions and prior finding reconciliation

17 October 2026. Frozen source revision `0000e5e6ff878f14d4cbd6704ab93cd769346167`. Audit-only; no application fixes, deployment, operational writes, live accounts or load tests.

## Reconciliation outcome

| Requested G01–G32 status | Count |
| --- | --- |
| Fixed and verified | 8 |
| Partially fixed | 21 |
| Not verified | 1 |
| Still present | 2 |

“Fixed and verified” is limited to the original mechanism and identified isolated test/source evidence; it never certifies live tenant isolation or the whole page. “Partially fixed” retains a demonstrated source defect or explicitly stated unverified completion gap. “Not verified” is not counted as a confirmed open defect. Additional old IDs G33–G43 are retained because the restored report already uses them. New IDs start at G44.

| ID | Area | Priority | Status | Evidence |
| --- | --- | --- | --- | --- |
| G01 | Unsigned identity cookie | P0 | Fixed and verified | middleware.ts:132 |
| G02 | Live Auth failure falls back to cookie | P0 | Partially fixed | lib/auth/payment-session.ts:36 |
| G03 | Missing/error LMS gate | P0 | Fixed and verified | middleware.ts:203 |
| G04 | Foreign installment allocation | P1 | Partially fixed | lib/services/fee-workflow-service.ts:954 |
| G05 | Correction drops allocation | P1 | Fixed and verified | lib/services/fee-workflow-service.ts:1082 |
| G06 | Reversal leaves installment paid | P1 | Fixed and verified | lib/services/fee-workflow-service.ts:1820 |
| G07 | False activation after Auth failure | P0 | Partially fixed | lib/services/onboarding-service.ts:738 |
| G08 | Local reversal after server rejection | P1 | Not verified | app/(dashboard)/accounts/receipts/page.tsx:98 |
| G09 | Split authoritative persistence | P1 | Still present | lib/services/payment-workflow-transaction.ts:85 |
| G10 | Legacy clearance differs from policy | P1 | Partially fixed | lib/services/onboarding-service.ts:1543 |
| G11 | Generic fallback passwords | P0 | Partially fixed | lib/auth/credentials.ts:110 |
| G12 | Server imports client preflight | P1 | Fixed and verified | lib/auth/credentials.ts:5 |
| G13 | Unmatched identity uses first student | P0 | Fixed and verified | app/portal/page.tsx:128 |
| G14 | Client answer keys and repeat progress | P1 | Partially fixed | components/portal/quiz-runner-modal.tsx:142 |
| G15 | Remote failure reported as local success | P1 | Partially fixed | lib/services/academics-service.ts:1214 |
| G16 | Course-only batch scoping | P1 | Still present | app/portal/page.tsx:153 |
| G17 | Invented scores and wrong-course issuance | P1 | Partially fixed | lib/services/certificate-service.ts:76 |
| G18 | Revoked PDF still issued | P1 | Partially fixed | app/api/certificates/[id]/pdf/route.ts:64 |
| G19 | Local-only account administration | P1 | Partially fixed | app/api/users/route.ts:222 |
| G20 | Password reset reports success without reset | P1 | Partially fixed | app/(dashboard)/users/page.tsx:228 |
| G21 | Caller-supplied administrator authority | P0 | Fixed and verified | app/api/settings/route.ts:19 |
| G22 | Unauthenticated bulk import | P0 | Partially fixed | app/api/bulk-import/execute/route.ts:11 |
| G23 | Unverified role cookie for audit reads | P0 | Partially fixed | app/api/audit-logs/route.ts:42 |
| G24 | Eligibility override has no service authorization | P1 | Partially fixed | lib/services/placement-service.ts:1134 |
| G25 | Invalid job applications accepted | P1 | Fixed and verified | lib/services/placement-service.ts:337 |
| G26 | Close/delete and empty results do not reconcile | P1 | Partially fixed | lib/services/placement-service.ts:272 |
| G27 | Performance SLA report contradicts its metrics | P1 | Partially fixed | docs/performance/100-user-performance-report.md:15 |
| G28 | Unauthenticated full-store backup | P0 | Partially fixed | app/api/database/backup/route.ts:25 |
| G29 | Unauthenticated sync and ignored errors | P0 | Partially fixed | lib/supabase/sync-service.ts:27 |
| G30 | Unscoped event subscription/injection | P0 | Partially fixed | app/api/realtime/stream/route.ts:50 |
| G31 | Gateway bypasses canonical financial verification | P0 | Partially fixed | app/api/payments/verify/route.ts:117 |
| G32 | Unsigned meeting events when secrets absent | P1 | Partially fixed | lib/services/meeting-attendance-service.ts:114 |
| G33 | Attendance date filtering | P1 | Not reproducible | app/(dashboard)/academics/attendance/page.tsx:177 |
| G34 | Client lab credentials | P0 | Not verified | app/portal/page.tsx:1212 |
| G35 | Transfer capacity | P1 | Not reproducible | lib/services/academics-service.ts:543 |
| G36 | Premature enrollment transition | P1 | Still present | lib/services/crm-service.ts:255 |
| G37 | Fallback actor IDs | P1 | Partially fixed | app/(dashboard)/accounts/approvals/page.tsx:665 |
| G38 | Stage follow-up scheduling | P2 | Not verified | app/(dashboard)/crm/leads/page.tsx:215 |
| G39 | Preview-role impersonation claim | P0 | Not reproducible | app/(dashboard)/accounts/payments/page.tsx:28 |
| G40 | Refresh persistence loss claim | P2 | Not verified | lib/services/persistent-storage-adapter.ts:118 |
| G41 | Empty course crash claim | P2 | Not reproducible | app/(dashboard)/crm/leads/page.tsx:102 |
| G42 | Missing profile crash claim | P2 | Not reproducible | app/(dashboard)/students/[id]/page.tsx:109 |
| G43 | Mock action claim | P3 | Not verified | app/(dashboard)/support/page.tsx:363 |
| G44 | Attendance effect dependency loop | P1 | Still present | app/(dashboard)/academics/attendance/page.tsx:88 |
| G45 | Accounts section not automatically expanded | P2 | Still present | components/layout/sidebar.tsx:47 |
| G46 | Native login failure has no visible error | P2 | Still present | app/login/page.tsx:162 |

## Detailed issue records

### G01 — Unsigned identity cookie

- Classification: **Fixed and verified**; P0; requested historical 32; not included in confirmed open counts.
- Page URLs: cross-cutting API/platform/report. Module: Security. Roles: authorized operators and affected users.
- Element: Unsigned identity cookie; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Require valid identity at every boundary; retain unsigned-cookie regression.
- Actual current behavior: Unsigned cookies are rejected. Current F01 and middleware tests pass. The separate live fallback problem remains G02.
- Evidence/source: [middleware.ts:132](../../middleware.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Original mechanism corrected; residual cross-cutting issues are tracked separately.
- Business impact: Protected-page role impersonation.
- Recommended correction: Require valid identity at every boundary; retain unsigned-cookie regression.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G02 — Live Auth failure falls back to cookie

- Classification: **Partially fixed**; P0; requested historical 32; open source/runtime finding.
- Page URLs: /, /accounts/approvals, /accounts/payments, /admissions, /login, /todos. Module: Security. Roles: Public redirect; Accounts, admin/super admin; counsellor own submissions; Accounts/admin; counsellor own submissions; Admin, counsellor; Public; all nine roles; Super admin.
- Element: Live Auth failure falls back to cookie; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Fail closed in live mode; require current authoritative tenant/profile; remove production default signing secret.
- Actual current behavior: Unknown cookie IDs are rejected, but a known local user is accepted after live Auth rejects the session. New residual probe reproduces this. Tenant defaults to default when absent.
- Evidence/source: [lib/auth/payment-session.ts:36](../../lib/auth/payment-session.ts). New residual-probes.log reproduces the remaining behavior.
- Reproduction/inspection: Run the named case in residual-probes.test.ts against mocks and disposable storage.
- Root cause: Unknown cookie IDs are rejected, but a known local user is accepted after live Auth rejects the session. New residual probe reproduces this. Tenant defaults to default when absent.
- Business impact: Financial and shared API identity boundary is bypassable under fallback conditions.
- Recommended correction: Fail closed in live mode; require current authoritative tenant/profile; remove production default signing secret.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G03 — Missing/error LMS gate

- Classification: **Fixed and verified**; P0; requested historical 32; not included in confirmed open counts.
- Page URLs: /onboarding, /portal. Module: Onboarding. Roles: Admin, assigned onboarding team; Student owner; staff preview limited by mode.
- Element: Missing/error LMS gate; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Keep positive access-gate validation and test it on isolated live Auth.
- Actual current behavior: Missing, errored or disabled access gates now deny portal access. F03 missing-row/error regressions pass. Live RLS remains blocked.
- Evidence/source: [middleware.ts:203](../../middleware.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Original mechanism corrected; residual cross-cutting issues are tracked separately.
- Business impact: Premature access during provisioning gaps or outages.
- Recommended correction: Keep positive access-gate validation and test it on isolated live Auth.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G04 — Foreign installment allocation

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /accounts/approvals, /accounts/payments. Module: Accounts. Roles: Accounts, admin/super admin; counsellor own submissions; Accounts/admin; counsellor own submissions.
- Element: Foreign installment allocation; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Require exact tenant, enrollment, fee-account and installment association, reject nonexistent IDs.
- Actual current behavior: Cross-tenant/foreign-account case is rejected by current F04. Ownership is an OR including student_id; same-student different-enrollment allocation and unknown IDs are not strictly rejected.
- Evidence/source: [lib/services/fee-workflow-service.ts:954](../../lib/services/fee-workflow-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Cross-tenant/foreign-account case is rejected by current F04. Ownership is an OR including student_id; same-student different-enrollment allocation and unknown IDs are not strictly rejected.
- Business impact: Wrong-account in-memory balances; cross-tenant durable write not established.
- Recommended correction: Require exact tenant, enrollment, fee-account and installment association, reject nonexistent IDs.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G05 — Correction drops allocation

- Classification: **Fixed and verified**; P1; requested historical 32; not included in confirmed open counts.
- Page URLs: /accounts/payments. Module: Accounts. Roles: Accounts/admin; counsellor own submissions.
- Element: Correction drops allocation; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Retain preservation regression and validate explicit replacement using G04 composite ownership.
- Actual current behavior: Notes-only edits retain the allocation; current F05 passes. Explicit reassignment validation is still part of G04.
- Evidence/source: [lib/services/fee-workflow-service.ts:1082](../../lib/services/fee-workflow-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Original mechanism corrected; residual cross-cutting issues are tracked separately.
- Business impact: Approval loses allocation history.
- Recommended correction: Retain preservation regression and validate explicit replacement using G04 composite ownership.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G06 — Reversal leaves installment paid

- Classification: **Fixed and verified**; P1; requested historical 32; not included in confirmed open counts.
- Page URLs: /accounts/receipts. Module: Accounts. Roles: Accounts/admin; scoped staff.
- Element: Reversal leaves installment paid; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Retain exact allocation reversal regression; verify remote atomic persistence under G09.
- Actual current behavior: Reversal now decrements linked installment paid amount; current F06 passes. This verifies the in-memory service fixture, not a live cross-model transaction.
- Evidence/source: [lib/services/fee-workflow-service.ts:1820](../../lib/services/fee-workflow-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Original mechanism corrected; residual cross-cutting issues are tracked separately.
- Business impact: Contradictory outstanding installment and account totals.
- Recommended correction: Retain exact allocation reversal regression; verify remote atomic persistence under G09.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G07 — False activation after Auth failure

- Classification: **Partially fixed**; P0; requested historical 32; open source/runtime finding.
- Page URLs: /onboarding. Module: Onboarding. Roles: Admin, assigned onboarding team.
- Element: False activation after Auth failure; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Check every Auth/profile result; confirm tenant ownership; compensate failed provisioning and keep access disabled.
- Actual current behavior: createUser failure now returns failure (F07 passes), but profiles.upsert returned errors and listUsers errors remain unchecked; an existing email identity can be reused without tenant membership validation.
- Evidence/source: [lib/services/onboarding-service.ts:738](../../lib/services/onboarding-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: createUser failure now returns failure (F07 passes), but profiles.upsert returned errors and listUsers errors remain unchecked; an existing email identity can be reused without tenant membership validation.
- Business impact: Student marked active without usable identity; external writes are not rolled back with snapshot.
- Recommended correction: Check every Auth/profile result; confirm tenant ownership; compensate failed provisioning and keep access disabled.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G08 — Local reversal after server rejection

- Classification: **Not verified**; P1; requested historical 32; not included in confirmed open counts.
- Page URLs: /accounts/receipts. Module: Accounts. Roles: Accounts/admin; scoped staff.
- Element: Local reversal after server rejection; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Run server-failure and duplicate reversal UI tests on isolated accounts; preserve authoritative error handling.
- Actual current behavior: The optimistic local fallback has been removed in source. Successful and rejected reversal behavior was not exercised through authenticated UI.
- Evidence/source: [app/(dashboard)/accounts/receipts/page.tsx:98](../../app/(dashboard)/accounts/receipts/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: The optimistic local fallback has been removed in source. Successful and rejected reversal behavior was not exercised through authenticated UI.
- Business impact: False official credit-note success and refresh inconsistency.
- Recommended correction: Run server-failure and duplicate reversal UI tests on isolated accounts; preserve authoritative error handling.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G09 — Split authoritative persistence

- Classification: **Still present**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /accounts/approvals, /accounts/expenses, /accounts/fees, /accounts/payments, /accounts/receipts, /accounts/receipts/[id], /accounts/reports, /admissions, /dashboard, /students, /students/[id]. Module: Database. Roles: Accounts, admin/super admin; counsellor own submissions; Accounts/admin; Accounts/admin; scoped counsellor; Accounts/admin; counsellor own submissions; Accounts/admin; scoped staff; Accounts/admin; student owner; Admin, counsellor; Admin; role-specific staff restrictions; Scoped staff; admin.
- Element: Split authoritative persistence; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Choose a single authoritative model; transactional row writes/constraints or audited projections; test cross-module reload and concurrent readers.
- Actual current behavior: ReconcileDualLedgers aligns in-memory arrays, but the transaction still commits a JSON snapshot; legacy relational services remain separate writers. PGlite verifies snapshot CAS, not unified authoritative financial persistence.
- Evidence/source: [lib/services/payment-workflow-transaction.ts:85](../../lib/services/payment-workflow-transaction.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: ReconcileDualLedgers aligns in-memory arrays, but the transaction still commits a JSON snapshot; legacy relational services remain separate writers. PGlite verifies snapshot CAS, not unified authoritative financial persistence.
- Business impact: Different modules can read different committed versions.
- Recommended correction: Choose a single authoritative model; transactional row writes/constraints or audited projections; test cross-module reload and concurrent readers.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G10 — Legacy clearance differs from policy

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /onboarding. Module: Onboarding. Roles: Admin, assigned onboarding team.
- Element: Legacy clearance differs from policy; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Use one verified-ledger eligibility function for live forwarding, manual checklist and legacy backfill.
- Actual current behavior: Legacy clearance now uses a configured percentage, but consumes legacy paid_amount rather than the canonical verified-payment sum and has a separate zero-threshold condition. The documented 50% guarantee is not a fixed policy: source defaults to 25%.
- Evidence/source: [lib/services/onboarding-service.ts:1543](../../lib/services/onboarding-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Legacy clearance now uses a configured percentage, but consumes legacy paid_amount rather than the canonical verified-payment sum and has a separate zero-threshold condition. The documented 50% guarantee is not a fixed policy: source defaults to 25%.
- Business impact: Legacy records bypass normal financial clearance.
- Recommended correction: Use one verified-ledger eligibility function for live forwarding, manual checklist and legacy backfill.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G11 — Generic fallback passwords

- Classification: **Partially fixed**; P0; requested historical 32; open source/runtime finding.
- Page URLs: /login. Module: Security. Roles: Public; all nine roles.
- Element: Generic fallback passwords; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Return immediately on live Auth rejection; disable all production demo/staging credential fallback.
- Actual current behavior: Arbitrary generic passwords were limited to test mode, but named demo/staging passwords remain accepted after live Auth failure in production. Residual probe confirms the named-demo path.
- Evidence/source: [lib/auth/credentials.ts:110](../../lib/auth/credentials.ts). New residual-probes.log reproduces the remaining behavior.
- Reproduction/inspection: Run the named case in residual-probes.test.ts against mocks and disposable storage.
- Root cause: Arbitrary generic passwords were limited to test mode, but named demo/staging passwords remain accepted after live Auth failure in production. Residual probe confirms the named-demo path.
- Business impact: Weak shared credentials can select privileged identity where helper executes.
- Recommended correction: Return immediately on live Auth rejection; disable all production demo/staging credential fallback.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G12 — Server imports client preflight

- Classification: **Fixed and verified**; P1; requested historical 32; not included in confirmed open counts.
- Page URLs: /login. Module: Security. Roles: Public; all nine roles.
- Element: Server imports client preflight; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Retain server bundle and native login integration checks.
- Actual current behavior: Preflight is now a server-safe function. Fresh build and login unit suite pass; native invalid-login POST reaches the handler without the previous client-boundary error. Real successful login remains blocked.
- Evidence/source: [lib/auth/credentials.ts:5](../../lib/auth/credentials.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Original mechanism corrected; residual cross-cutting issues are tracked separately.
- Business impact: Valid login may be denied or misreported; live success unverified.
- Recommended correction: Retain server bundle and native login integration checks.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G13 — Unmatched identity uses first student

- Classification: **Fixed and verified**; P0; requested historical 32; not included in confirmed open counts.
- Page URLs: /portal. Module: Student. Roles: Student owner; staff preview limited by mode.
- Element: Unmatched identity uses first student; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Retain missing-student guard and add two-tenant live mapping tests.
- Actual current behavior: Student identity miss no longer selects first student; explicit staff-only nonproduction preview remains. Current portal-hardening suite passes. Tenant ownership still needs live verification.
- Evidence/source: [app/portal/page.tsx:128](../../app/portal/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Original mechanism corrected; residual cross-cutting issues are tracked separately.
- Business impact: Potential another-student data display; remote scope depends on hydration.
- Recommended correction: Retain missing-student guard and add two-tenant live mapping tests.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G14 — Client answer keys and repeat progress

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /academics/assessments, /portal. Module: Academics. Roles: Admin, trainer; scoped student; Student owner; staff preview limited by mode.
- Element: Client answer keys and repeat progress; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Remove local grading fallback; redact keys at data boundary; validate enrollment, attempts and timing; derive unique completion progress.
- Actual current behavior: Server endpoint added, but failed/non-OK grading falls through to local answer-key evaluation. Repeated passes still add 15 progress each; residual probe reaches 30. Quiz API lacks course/enrollment/attempt entitlement validation.
- Evidence/source: [components/portal/quiz-runner-modal.tsx:142](../../components/portal/quiz-runner-modal.tsx). New residual-probes.log reproduces the remaining behavior.
- Reproduction/inspection: Run the named case in residual-probes.test.ts against mocks and disposable storage.
- Root cause: Server endpoint added, but failed/non-OK grading falls through to local answer-key evaluation. Repeated passes still add 15 progress each; residual probe reaches 30. Quiz API lacks course/enrollment/attempt entitlement validation.
- Business impact: Manipulable academic outcomes and inflated completion.
- Recommended correction: Remove local grading fallback; redact keys at data boundary; validate enrollment, attempts and timing; derive unique completion progress.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G15 — Remote failure reported as local success

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /academics/assessments, /academics/assignments, /academics/batches, /academics/courses, /academics/schedule, /accounts/expenses, /accounts/vendors, /crm/followups, /crm/leads, /dashboard, /students, /support. Module: CRM/Academics/Placement/Support. Roles: Admin, trainer; scoped student; Admin, assigned trainer; scoped staff reads; Admin, assigned trainer; counsellor read; Admin, assigned trainer; scoped student/support; Accounts/admin; Admin, counsellor; Admin; role-specific staff restrictions; Scoped staff; admin; Support, trainer, admin; student via portal.
- Element: Remote failure reported as local success; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Authoritative checked server mutations with durable failure state; verify persisted rows before success.
- Actual current behavior: Some CRM paths inspect errors, but assignment submission and other academic/placement writes still persist locally and ignore returned remote errors.
- Evidence/source: [lib/services/academics-service.ts:1214](../../lib/services/academics-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Some CRM paths inspect errors, but assignment submission and other academic/placement writes still persist locally and ignore returned remote errors.
- Business impact: Lost leads, tickets, course changes and placement data after refresh/restart.
- Recommended correction: Authoritative checked server mutations with durable failure state; verify persisted rows before success.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G16 — Course-only batch scoping

- Classification: **Still present**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /academics/assignments, /academics/schedule, /portal. Module: Student. Roles: Admin, trainer; scoped student; Admin, assigned trainer; scoped student/support; Student owner; staff preview limited by mode.
- Element: Course-only batch scoping; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Scope all lessons/assignments/assessments/sessions to enrollment and explicit course-wide visibility.
- Actual current behavior: Both assignments and class sessions remain filtered by course_id alone. The remediation claim of strict session batch scoping is not present in the inspected portal source.
- Evidence/source: [app/portal/page.tsx:153](../../app/portal/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Both assignments and class sessions remain filtered by course_id alone. The remediation claim of strict session batch scoping is not present in the inspected portal source.
- Business impact: Other-batch schedules, assignments and meeting links may appear.
- Recommended correction: Scope all lessons/assignments/assessments/sessions to enrollment and explicit course-wide visibility.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G17 — Invented scores and wrong-course issuance

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /certificate/verify/[id], /certificates, /portal, /students/[id]. Module: Certificates. Roles: Public; Admin/authorized issuer; placement read; Student owner; staff preview limited by mode; Scoped staff; admin.
- Element: Invented scores and wrong-course issuance; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Use per-enrollment verified academic results; no fabricated score for absent assessment evidence.
- Actual current behavior: Course binding added and metrics derived where present, but absence of exam attempts still invents 85%; aggregate student progress/attendance and unchecked admission status remain.
- Evidence/source: [lib/services/certificate-service.ts:76](../../lib/services/certificate-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Course binding added and metrics derived where present, but absence of exam attempts still invents 85%; aggregate student progress/attendance and unchecked admission status remain.
- Business impact: Inaccurate credentials and certificates for uncompleted courses.
- Recommended correction: Use per-enrollment verified academic results; no fabricated score for absent assessment evidence.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G18 — Revoked PDF still issued

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /certificate/verify/[id], /certificates. Module: Certificates. Roles: Public; Admin/authorized issuer; placement read.
- Element: Revoked PDF still issued; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Use revocation-aware private/no-store delivery or cache invalidation and minimal public verification.
- Actual current behavior: Origin now rejects revoked certificates with 410. Prior valid PDFs remain publicly cacheable for one hour plus stale-while-revalidate 86400 seconds.
- Evidence/source: [app/api/certificates/[id]/pdf/route.ts:64](../../app/api/certificates/[id]/pdf/route.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Origin now rejects revoked certificates with 410. Prior valid PDFs remain publicly cacheable for one hour plus stale-while-revalidate 86400 seconds.
- Business impact: Revoked official documents remain obtainable.
- Recommended correction: Use revocation-aware private/no-store delivery or cache invalidation and minimal public verification.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G19 — Local-only account administration

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /users. Module: Users. Roles: Admin, super admin.
- Element: Local-only account administration; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Authorize target tenant and role transitions; check Auth/profile responses and commit only after success.
- Actual current behavior: Real Auth API calls were added, but PATCH ignores returned Auth/profile errors and catches exceptions before committing local success. Target lookup is not tenant-scoped; admin accepts arbitrary supplied role.
- Evidence/source: [app/api/users/route.ts:222](../../app/api/users/route.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Real Auth API calls were added, but PATCH ignores returned Auth/profile errors and catches exceptions before committing local success. Target lookup is not tenant-scoped; admin accepts arbitrary supplied role.
- Business impact: UI account state does not establish actual login or revocation.
- Recommended correction: Authorize target tenant and role transitions; check Auth/profile responses and commit only after success.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G20 — Password reset reports success without reset

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /login, /users. Module: Users. Roles: Public; all nine roles; Admin, super admin.
- Element: Password reset reports success without reset; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Generate provider-backed recovery/invitation tokens; verify expiry, consume-once and actual login after reset.
- Actual current behavior: Direct password reset API now calls Auth and checks errors. Email reset links still use a locally invented rst token with no recovery-token lifecycle.
- Evidence/source: [app/(dashboard)/users/page.tsx:228](../../app/(dashboard)/users/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Direct password reset API now calls Auth and checks errors. Email reset links still use a locally invented rst token with no recovery-token lifecycle.
- Business impact: Administrator believes access was reset while credentials remain unchanged.
- Recommended correction: Generate provider-backed recovery/invitation tokens; verify expiry, consume-once and actual login after reset.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G21 — Caller-supplied administrator authority

- Classification: **Fixed and verified**; P0; requested historical 32; not included in confirmed open counts.
- Page URLs: /settings. Module: Settings. Roles: Admin, super admin.
- Element: Caller-supplied administrator authority; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Retain spoofed-role denial tests; separate public branding from private settings.
- Actual current behavior: POST no longer trusts body role/cookie role; authenticated admin check and security tests are present and pass. GET remains public and needs explicit data classification. Shared G02 still applies.
- Evidence/source: [app/api/settings/route.ts:19](../../app/api/settings/route.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Original mechanism corrected; residual cross-cutting issues are tracked separately.
- Business impact: Unauthorized configuration changes.
- Recommended correction: Retain spoofed-role denial tests; separate public branding from private settings.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G22 — Unauthenticated bulk import

- Classification: **Partially fixed**; P0; requested historical 32; open source/runtime finding.
- Page URLs: cross-cutting API/platform/report. Module: Import. Roles: authorized operators and affected users.
- Element: Unauthenticated bulk import; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Set trusted tenant and inactive onboarding state; reconcile imported financial history via an audited migration flow, not ordinary unverified CSV credit.
- Actual current behavior: Import execution now authenticates admin and derives actor from session. bulk-import-service.ts still creates active users/students and paid balances directly from CSV without tenant_id on these records or canonical payment approval. Shared G02 remains.
- Evidence/source: [app/api/bulk-import/execute/route.ts:11](../../app/api/bulk-import/execute/route.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Import execution now authenticates admin and derives actor from session. bulk-import-service.ts still creates active users/students and paid balances directly from CSV without tenant_id on these records or canonical payment approval. Shared G02 remains.
- Business impact: Unauthorized mutation and bypass of normal enrollment/payment approval.
- Recommended correction: Set trusted tenant and inactive onboarding state; reconcile imported financial history via an audited migration flow, not ordinary unverified CSV credit.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G23 — Unverified role cookie for audit reads

- Classification: **Partially fixed**; P0; requested historical 32; open source/runtime finding.
- Page URLs: /audit-logs. Module: Audit. Roles: Admin, super admin.
- Element: Unverified role cookie for audit reads; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Filter authoritative query and response by tenant; replace cache on empty success.
- Actual current behavior: Admin authentication added and anonymous GET returns 401. Live select and local response are not tenant-filtered; empty results retain cached records.
- Evidence/source: [app/api/audit-logs/route.ts:42](../../app/api/audit-logs/route.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Admin authentication added and anonymous GET returns 401. Live select and local response are not tenant-filtered; empty results retain cached records.
- Business impact: Potential sensitive cross-user audit disclosure.
- Recommended correction: Filter authoritative query and response by tenant; replace cache on empty success.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G24 — Eligibility override has no service authorization

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /placement, /placement/enrollments. Module: Placement. Roles: Admin, placement coordinator.
- Element: Eligibility override has no service authorization; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Enforce policy and tenant server-side on all creation/override entrypoints; immutable decision audit.
- Actual current behavior: Role and reason guards added, but allow_admin_override policy, active actor and tenant ownership are not enforced; creation also accepts eligibility_overridden input.
- Evidence/source: [lib/services/placement-service.ts:1134](../../lib/services/placement-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Role and reason guards added, but allow_admin_override policy, active actor and tenant ownership are not enforced; creation also accepts eligibility_overridden input.
- Business impact: Unauthorized eligibility bypass in client/local model; remote exploit unverified.
- Recommended correction: Enforce policy and tenant server-side on all creation/override entrypoints; immutable decision audit.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G25 — Invalid job applications accepted

- Classification: **Fixed and verified**; P1; requested historical 32; not included in confirmed open counts.
- Page URLs: /placement. Module: Placement. Roles: Admin, placement coordinator.
- Element: Invalid job applications accepted; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Retain validations; add database unique student/job constraint and isolated race test.
- Actual current behavior: Missing/closed/expired job checks added; placement-enrollment regressions pass. This verifies local validation, not remote uniqueness under concurrency.
- Evidence/source: [lib/services/placement-service.ts:337](../../lib/services/placement-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Original mechanism corrected; residual cross-cutting issues are tracked separately.
- Business impact: Orphan or invalid candidate applications.
- Recommended correction: Retain validations; add database unique student/job constraint and isolated race test.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G26 — Close/delete and empty results do not reconcile

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /placement, /placement/enrollments. Module: Placement. Roles: Admin, placement coordinator.
- Element: Close/delete and empty results do not reconcile; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Check database errors, commit/cache only authoritative success, clear valid empty lists.
- Actual current behavior: Job empty-list reconciliation and remote update/delete calls added, but local mutation precedes unchecked remote result. Other placement empty lists still retain stale data.
- Evidence/source: [lib/services/placement-service.ts:272](../../lib/services/placement-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Job empty-list reconciliation and remote update/delete calls added, but local mutation precedes unchecked remote result. Other placement empty lists still retain stale data.
- Business impact: Reappearing jobs and stale placement queues.
- Recommended correction: Check database errors, commit/cache only authoritative success, clear valid empty lists.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G27 — Performance SLA report contradicts its metrics

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /accounts/reports. Module: Reporting. Roles: Accounts/admin.
- Element: Performance SLA report contradicts its metrics; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Replace estimates with isolated authenticated measurements; publish reproducible raw evidence and business assertions.
- Actual current behavior: Some SLA labels corrected. Historic browser/video/500-user estimates and raw provenance remain insufficient; current audit runs no load tests and certifies no capacity.
- Evidence/source: [docs/performance/100-user-performance-report.md:15](../../docs/performance/100-user-performance-report.md). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Some SLA labels corrected. Historic browser/video/500-user estimates and raw provenance remain insufficient; current audit runs no load tests and certifies no capacity.
- Business impact: False capacity/readiness confidence; no current load measurements verified.
- Recommended correction: Replace estimates with isolated authenticated measurements; publish reproducible raw evidence and business assertions.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G28 — Unauthenticated full-store backup

- Classification: **Partially fixed**; P0; requested historical 32; open source/runtime finding.
- Page URLs: /settings. Module: Database. Roles: Admin, super admin.
- Element: Unauthenticated full-store backup; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Define global vs tenant super-admin scope; redact secrets and use audited encrypted backup artifacts.
- Actual current behavior: Anonymous backup now returns 401 and super-admin role check exists. Export still serializes whole store, without claimed tenant filtering or sensitive-field redaction.
- Evidence/source: [app/api/database/backup/route.ts:25](../../app/api/database/backup/route.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Anonymous backup now returns 401 and super-admin role check exists. Export still serializes whole store, without claimed tenant filtering or sensitive-field redaction.
- Business impact: Sensitive populated process records exposed and unauthenticated resource-consuming writes.
- Recommended correction: Define global vs tenant super-admin scope; redact secrets and use audited encrypted backup artifacts.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G29 — Unauthenticated sync and ignored errors

- Classification: **Partially fixed**; P0; requested historical 32; open source/runtime finding.
- Page URLs: /settings. Module: Database. Roles: Admin, super admin.
- Element: Unauthenticated sync and ignored errors; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Unify financial writers and check all pull/push results; enforce tenant filters and recovery.
- Actual current behavior: Sync route is restricted and some errors checked. Push/pull still operate separately from canonical fee CAS; complete tenant-scoped atomic reconciliation is unverified.
- Evidence/source: [lib/supabase/sync-service.ts:27](../../lib/supabase/sync-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Sync route is restricted and some errors checked. Push/pull still operate separately from canonical fee CAS; complete tenant-scoped atomic reconciliation is unverified.
- Business impact: Unauthorized sync attempts and false reconciliation success; alternate legacy financial writes.
- Recommended correction: Unify financial writers and check all pull/push results; enforce tenant filters and recovery.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G30 — Unscoped event subscription/injection

- Classification: **Partially fixed**; P0; requested historical 32; open source/runtime finding.
- Page URLs: cross-cutting API/platform/report. Module: Realtime. Roles: authorized operators and affected users.
- Element: Unscoped event subscription/injection; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Bind subscriptions/publication to authenticated tenant/user; schema-limit events and verify cross-instance isolation.
- Actual current behavior: Anonymous stream denied; nonadmin wildcard restricted. Exact requested topics are subscribed without tenant/user ownership and event payload filtering; admins can still wildcard.
- Evidence/source: [app/api/realtime/stream/route.ts:50](../../app/api/realtime/stream/route.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Anonymous stream denied; nonadmin wildcard restricted. Exact requested topics are subscribed without tenant/user ownership and event payload filtering; admins can still wildcard.
- Business impact: Same-process notification leakage/injection and unreliable cross-instance delivery.
- Recommended correction: Bind subscriptions/publication to authenticated tenant/user; schema-limit events and verify cross-instance isolation.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G31 — Gateway bypasses canonical financial verification

- Classification: **Partially fixed**; P0; requested historical 32; open source/runtime finding.
- Page URLs: /accounts/approvals, /portal. Module: Accounts. Roles: Accounts, admin/super admin; counsellor own submissions; Student owner; staff preview limited by mode.
- Element: Gateway bypasses canonical financial verification; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Validate captured order, owner, tenant, currency/amount; canonical transactional idempotent accounting; disable unconfigured webhook processing.
- Actual current behavior: Verify now authenticates and fails closed without gateway configuration outside tests. Body amount/account still feed legacy writer without trusted stored-order comparison; Razorpay webhook config-absent path remains permissive.
- Evidence/source: [app/api/payments/verify/route.ts:117](../../app/api/payments/verify/route.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Verify now authenticates and fails closed without gateway configuration outside tests. Body amount/account still feed legacy writer without trusted stored-order comparison; Razorpay webhook config-absent path remains permissive.
- Business impact: Forged/incorrect financial credit and approval bypass under fallback configuration.
- Recommended correction: Validate captured order, owner, tenant, currency/amount; canonical transactional idempotent accounting; disable unconfigured webhook processing.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G32 — Unsigned meeting events when secrets absent

- Classification: **Partially fixed**; P1; requested historical 32; open source/runtime finding.
- Page URLs: /academics/attendance, /academics/schedule. Module: Attendance. Roles: Admin, assigned trainer; Admin, assigned trainer; scoped student/support.
- Element: Unsigned meeting events when secrets absent; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Fail closed for both providers; enforce replay freshness/dedupe and meeting-tenant mapping.
- Actual current behavior: Zoom ordinary event requires configured signature; Google Meet still accepts missing token when configuration absent, including production. Zoom signature helper has no timestamp freshness check.
- Evidence/source: [lib/services/meeting-attendance-service.ts:114](../../lib/services/meeting-attendance-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Zoom ordinary event requires configured signature; Google Meet still accepts missing token when configuration absent, including production. Zoom signature helper has no timestamp freshness check.
- Business impact: Untrusted/replayed attendance can affect eligibility.
- Recommended correction: Fail closed for both providers; enforce replay freshness/dedupe and meeting-tenant mapping.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G33 — Attendance date filtering

- Classification: **Not reproducible**; P1; additional pre-existing report ID; not included in confirmed open counts.
- Page URLs: /academics/attendance. Module: Academics. Roles: Admin, assigned trainer.
- Element: Attendance date filtering; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Retain date/batch export fixtures.
- Actual current behavior: The current date filter uses normal optional-date equality. Earlier inversion is absent; separate render-loop risk is G44.
- Evidence/source: [app/(dashboard)/academics/attendance/page.tsx:177](../../app/(dashboard)/academics/attendance/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: The current date filter uses normal optional-date equality. Earlier inversion is absent; separate render-loop risk is G44.
- Business impact: Core workflow correctness or operational trust is affected.
- Recommended correction: Retain date/batch export fixtures.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G34 — Client lab credentials

- Classification: **Not verified**; P0; additional pre-existing report ID; not included in confirmed open counts.
- Page URLs: /academics/sap-servers, /portal. Module: SAP labs. Roles: Admin, trainer; student allocation view; Student owner; staff preview limited by mode.
- Element: Client lab credentials; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Deliver only authorized per-student lab credentials, avoid global client hydration, encrypt stored secrets and rotate access.
- Actual current behavior: SAP passwords are rendered and copied from client state, but a student may legitimately need their assigned lab credentials. Cross-student exposure, persistence encryption and rotation were not verified; display alone does not prove an authorization defect.
- Evidence/source: [app/portal/page.tsx:1212](../../app/portal/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: SAP passwords are rendered and copied from client state, but a student may legitimately need their assigned lab credentials. Cross-student exposure, persistence encryption and rotation were not verified; display alone does not prove an authorization defect.
- Business impact: Potential identity/data isolation failure; live exploitation not claimed.
- Recommended correction: Deliver only authorized per-student lab credentials, avoid global client hydration, encrypt stored secrets and rotate access.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G35 — Transfer capacity

- Classification: **Not reproducible**; P1; additional pre-existing report ID; not included in confirmed open counts.
- Page URLs: /academics/batches, /students/[id]. Module: Academics. Roles: Admin, assigned trainer; scoped staff reads; Scoped staff; admin.
- Element: Transfer capacity; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Validate capacity transactionally against current enrollment rows.
- Actual current behavior: A maximum-capacity guard exists. Concurrency and stale counts remain risks, not proof of the earlier unconditional bypass.
- Evidence/source: [lib/services/academics-service.ts:543](../../lib/services/academics-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: A maximum-capacity guard exists. Concurrency and stale counts remain risks, not proof of the earlier unconditional bypass.
- Business impact: Core workflow correctness or operational trust is affected.
- Recommended correction: Validate capacity transactionally against current enrollment rows.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G36 — Premature enrollment transition

- Classification: **Still present**; P1; additional pre-existing report ID; open source/runtime finding.
- Page URLs: /admissions, /crm/leads. Module: CRM. Roles: Admin, counsellor.
- Element: Premature enrollment transition; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Move Enrolled transition into successful admission transaction; cancellation preserves lead stage.
- Actual current behavior: Conversion helper marks lead Enrolled before creating/confirming the admission. Current main link routes to admission; helper callers still need lifecycle consistency.
- Evidence/source: [lib/services/crm-service.ts:255](../../lib/services/crm-service.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Conversion helper marks lead Enrolled before creating/confirming the admission. Current main link routes to admission; helper callers still need lifecycle consistency.
- Business impact: Core workflow correctness or operational trust is affected.
- Recommended correction: Move Enrolled transition into successful admission transaction; cancellation preserves lead stage.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G37 — Fallback actor IDs

- Classification: **Partially fixed**; P1; additional pre-existing report ID; open source/runtime finding.
- Page URLs: /academics/attendance, /accounts/approvals. Module: Audit. Roles: Admin, assigned trainer; Accounts, admin/super admin; counsellor own submissions.
- Element: Fallback actor IDs; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Derive every audit actor from server identity; deny missing actor rather than inventing admin.
- Actual current behavior: Attendance now requires authenticated user.id; fallback audit actor strings remain elsewhere. Do not claim attendance still uses the old fallback.
- Evidence/source: [app/(dashboard)/accounts/approvals/page.tsx:665](../../app/(dashboard)/accounts/approvals/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Attendance now requires authenticated user.id; fallback audit actor strings remain elsewhere. Do not claim attendance still uses the old fallback.
- Business impact: Core workflow correctness or operational trust is affected.
- Recommended correction: Derive every audit actor from server identity; deny missing actor rather than inventing admin.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G38 — Stage follow-up scheduling

- Classification: **Not verified**; P2; additional pre-existing report ID; not included in confirmed open counts.
- Page URLs: /crm/followups, /crm/leads. Module: CRM. Roles: Admin, counsellor.
- Element: Stage follow-up scheduling; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Confirm whether stage modal must schedule or link to follow-ups; test resulting reminders.
- Actual current behavior: Stage-specific scheduling requirements need a product decision and authenticated modal tests; separate follow-up module exists.
- Evidence/source: [app/(dashboard)/crm/leads/page.tsx:215](../../app/(dashboard)/crm/leads/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Stage-specific scheduling requirements need a product decision and authenticated modal tests; separate follow-up module exists.
- Business impact: User feedback/navigation reliability is reduced.
- Recommended correction: Confirm whether stage modal must schedule or link to follow-ups; test resulting reminders.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G39 — Preview-role impersonation claim

- Classification: **Not reproducible**; P0; additional pre-existing report ID; not included in confirmed open counts.
- Page URLs: /accounts/payments. Module: Accounts. Roles: Accounts/admin; counsellor own submissions.
- Element: Preview-role impersonation claim; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Keep preview controls out of production and enforce server actor identity.
- Actual current behavior: Current financial pages use auth context; no Preview Role selector found. Prior claim of a selector alone bypassing server authority is not carried forward.
- Evidence/source: [app/(dashboard)/accounts/payments/page.tsx:28](../../app/(dashboard)/accounts/payments/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Current financial pages use auth context; no Preview Role selector found. Prior claim of a selector alone bypassing server authority is not carried forward.
- Business impact: Potential identity/data isolation failure; live exploitation not claimed.
- Recommended correction: Keep preview controls out of production and enforce server actor identity.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G40 — Refresh persistence loss claim

- Classification: **Not verified**; P2; additional pre-existing report ID; not included in confirmed open counts.
- Page URLs: cross-cutting API/platform/report. Module: Platform. Roles: authorized operators and affected users.
- Element: Refresh persistence loss claim; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Two-browser/restart reconciliation testing on isolated staging; do not equate localStorage with guaranteed refresh loss.
- Actual current behavior: Split browser/server persistence is real (G09/G15), but deterministic F5 loss was not reproduced. localStorage itself persists across refresh.
- Evidence/source: [lib/services/persistent-storage-adapter.ts:118](../../lib/services/persistent-storage-adapter.ts). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Split browser/server persistence is real (G09/G15), but deterministic F5 loss was not reproduced. localStorage itself persists across refresh.
- Business impact: User feedback/navigation reliability is reduced.
- Recommended correction: Two-browser/restart reconciliation testing on isolated staging; do not equate localStorage with guaranteed refresh loss.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G41 — Empty course crash claim

- Classification: **Not reproducible**; P2; additional pre-existing report ID; not included in confirmed open counts.
- Page URLs: /academics/courses, /crm/leads. Module: CRM. Roles: Admin, assigned trainer; counsellor read; Admin, counsellor.
- Element: Empty course crash claim; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Test empty catalogs throughout other paths; avoid asserting this specific crash without evidence.
- Actual current behavior: Cited expressions use optional chaining and fallbacks. The earlier claim that these expressions necessarily throw on an empty array is incorrect.
- Evidence/source: [app/(dashboard)/crm/leads/page.tsx:102](../../app/(dashboard)/crm/leads/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Cited expressions use optional chaining and fallbacks. The earlier claim that these expressions necessarily throw on an empty array is incorrect.
- Business impact: User feedback/navigation reliability is reduced.
- Recommended correction: Test empty catalogs throughout other paths; avoid asserting this specific crash without evidence.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G42 — Missing profile crash claim

- Classification: **Not reproducible**; P2; additional pre-existing report ID; not included in confirmed open counts.
- Page URLs: /students/[id]. Module: Students. Roles: Scoped staff; admin.
- Element: Missing profile crash claim; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Keep missing-record guard; add explicit loading and caught lookup failures.
- Actual current behavior: Current page explicitly returns Student profile not found with directory link. Loading vs missing-state distinction and error recovery still need runtime coverage.
- Evidence/source: [app/(dashboard)/students/[id]/page.tsx:109](../../app/(dashboard)/students/[id]/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Current page explicitly returns Student profile not found with directory link. Loading vs missing-state distinction and error recovery still need runtime coverage.
- Business impact: User feedback/navigation reliability is reduced.
- Recommended correction: Keep missing-record guard; add explicit loading and caught lookup failures.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G43 — Mock action claim

- Classification: **Not verified**; P3; additional pre-existing report ID; not included in confirmed open counts.
- Page URLs: /support. Module: Support/Placement. Roles: Support, trainer, admin; student via portal.
- Element: Mock action claim; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Verify each specific escalation/interview handler against authoritative records and notifications.
- Actual current behavior: Support escalation now calls a service. Earlier broad mock-button claim is not enough to certify all support/placement actions; durable outcomes blocked.
- Evidence/source: [app/(dashboard)/support/page.tsx:363](../../app/(dashboard)/support/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Inspect the cited function/branch and exercise the success and failure path with synthetic tenant A/B fixtures; authenticated browser confirmation is blocked.
- Root cause: Support escalation now calls a service. Earlier broad mock-button claim is not enough to certify all support/placement actions; durable outcomes blocked.
- Business impact: User feedback/navigation reliability is reduced.
- Recommended correction: Verify each specific escalation/interview handler against authoritative records and notifications.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G44 — Attendance effect dependency loop

- Classification: **Still present**; P1; new; open source/runtime finding.
- Page URLs: /academics/attendance. Module: Academics. Roles: Admin, assigned trainer.
- Element: Attendance effect dependency loop; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Memoize stable students/refresh dependencies or perform effect from stable batch/date/store version.
- Actual current behavior: New source-confirmed render feedback loop: students is a fresh array each render; refreshRecords depends on it; effect calls refreshRecords, which sets new state objects. Authenticated runtime impact remains blocked.
- Evidence/source: [app/(dashboard)/academics/attendance/page.tsx:88](../../app/(dashboard)/academics/attendance/page.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Trace fresh students filter → callback dependency → effect → setAttendanceMap/setRecordsMap → rerender. Reproduce in authenticated isolated staging before quantifying severity/CPU impact.
- Root cause: New source-confirmed render feedback loop: students is a fresh array each render; refreshRecords depends on it; effect calls refreshRecords, which sets new state objects. Authenticated runtime impact remains blocked.
- Business impact: Core workflow correctness or operational trust is affected.
- Recommended correction: Memoize stable students/refresh dependencies or perform effect from stable batch/date/store version.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G45 — Accounts section not automatically expanded

- Classification: **Still present**; P2; new; open source/runtime finding.
- Page URLs: cross-cutting API/platform/report. Module: Navigation. Roles: authorized operators and affected users.
- Element: Accounts section not automatically expanded; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Match /accounts and select the accounts state key; test direct links and back navigation.
- Actual current behavior: New source-confirmed navigation defect: automatic section expansion watches /finance and selects finance, while menu links target /accounts and its state key is accounts. Direct account links leave the wrong section open.
- Evidence/source: [components/layout/sidebar.tsx:47](../../components/layout/sidebar.tsx). Source review plus the scoped test evidence described above; no live mutation was performed.
- Reproduction/inspection: Open /accounts/fees by direct link; compare pathname effect /finance predicate with account menu hrefs. Runtime confirmation is blocked.
- Root cause: New source-confirmed navigation defect: automatic section expansion watches /finance and selects finance, while menu links target /accounts and its state key is accounts. Direct account links leave the wrong section open.
- Business impact: User feedback/navigation reliability is reduced.
- Recommended correction: Match /accounts and select the accounts state key; test direct links and back navigation.
- Verification limit: No successful live Auth/tenant DB workflow or complete UI path is claimed.

### G46 — Native login failure has no visible error

- Classification: **Still present**; P2; new; open source/runtime finding.
- Page URLs: /login. Module: Authentication. Roles: Public; all nine roles.
- Element: Native login failure has no visible error; related source controls are indexed by source file/page in ALL_BUTTONS_FORMS_AUDIT.md.
- Expected behavior: Render sanitized login error server-side so no-JavaScript users see rejection and recovery guidance.
- Actual current behavior: New browser-confirmed native form feedback defect: invalid no-JavaScript login POST redirects to /login?error=invalid_credentials but displays no error; query decoding occurs only in useEffect. Password is not leaked in URL.
- Evidence/source: [app/login/page.tsx:162](../../app/login/page.tsx). browser-results.json and login-invalid-native.png verify the failure.
- Reproduction/inspection: Disable JavaScript, submit unknown synthetic credentials at /login, inspect POST redirect and missing visible error.
- Root cause: New browser-confirmed native form feedback defect: invalid no-JavaScript login POST redirects to /login?error=invalid_credentials but displays no error; query decoding occurs only in useEffect. Password is not leaked in URL.
- Business impact: User feedback/navigation reliability is reduced.
- Recommended correction: Render sanitized login error server-side so no-JavaScript users see rejection and recovery guidance.
- Verification limit: Public browser reproduction confirmed; successful real login not attempted.

## Risks and missing requirements, separate from confirmed gaps

- R01: Shared mutable process store and readOnly payment transactions bypassing write queue can interleave; requires deterministic concurrency reproduction.
- R02: Nonfinancial tenant RLS and complete migration ordering not verified on a fresh independent Supabase project.
- R03: Storage buckets, file-owner checks, signed URL expiry and MIME/content checks need live two-tenant tests. Payment proof policies pass the limited PGlite fixture only.
- R04: Batch transfer capacity depends on current_enrolled; remote transfer/count updates are not a proven single transaction.
- R05: Full JSON snapshots, unpaginated service reads, polling and per-process realtime are source-level scalability risks, not measured bottlenecks.
- R06: No complete fresh migration-chain execution; PGlite result must not be generalized to every migration/Auth/Storage integration.
- M01: Refund payout/approval/reconciliation is not equivalent to receipt void/credit note. A full refund workflow is not verified.
- O01: Employer portal, advanced placement matching and richer analytics are optional roadmap items, not failures solely for being absent.

G41 and G42 earlier crash claims are specifically not reproduced by current source. No confirmed protected-page mobile overlap or large-table performance defect is asserted without a browser session.
