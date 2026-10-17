# Complete LMS + CRM gap analysis

17 October 2026, Asia/Calcutta. Latest local HEAD **01cecaceecc51e67cbd9f11af4652962b1acb879 plus uncommitted changes**, including new login/logout API and credential helper. Audit only; application source was not modified.

## 1. Executive summary

**NO-GO for unrestricted production financial/student operations.** Core pages and many service rules exist, but authentication, financial consistency, academic integrity, user administration and placement have demonstrable gaps. **43 confirmed source/runtime findings (G01–G43)** below are grouped and analyzed in detail. Source-confirmed defects, architectural risks, missing requirements, optional enhancements and blocked tests are kept separate.

Fresh execution: **47 suites / 627 tests passed**, versus the requested historical baseline599 (+28 tests). This includes prior audit reproductions whose passing assertions demonstrate defects; it does not mean627 business features work. TypeScript, ESLint (warnings), isolated production build and PGlite payment-migration fixture passed. Current browser checks used a copied production build, mock Supabase configuration, no operational environment files/data and a loopback-only browser network guard. No live mutations or load occurred.

A separate staging project was not positively verified. The earlier destination request specified another account not available through connected cloud tools. Operational database/Auth/Storage, real-session tenant permissions, full role journeys and performance capacity remain **UNVERIFIED/BLOCKED**.

## 2. Complete module inventory

COMPLETE means verified business outcome, not file existence. No full module is certified COMPLETE. PARTIAL means useful implementation exists with coverage gaps; BROKEN means a cited behavior fails; UNVERIFIED means execution evidence is missing; MISSING is used only for required absent mechanisms; NOT APPLICABLE applies to retired installment management.

| Module | Frontend / backend routes | Schema/local records (not live inventory) | Intended roles | Upstream → downstream | Status | Gaps |
|---|---|---|---|---|---|---|
| Authentication | /login, /api/auth/login, /api/auth/logout | profiles, auth.users; local users | All nine roles | identity → every module | BROKEN | G01 G02 G03 G11 G12 |
| CRM | /crm/leads, /crm/followups | leads, lead_followups, profiles | Counsellor/admin | sources → lead → follow-up/demo → admission | PARTIAL | G15 |
| Admissions | /admissions, /api/admissions | admissions, students, batches, fee_workflow_state | Counsellor/admin | lead/course/batch → enrollment/fee/onboarding | PARTIAL | G02 G09 G22 |
| Accounts | /accounts/*, /api/fees/*, /api/payments/*, /api/receipts/[id]/pdf | student_fee_accounts, installments, payments, receipts; snapshot arrays | Accounts/admin; scoped counsellor/student reads | enrollment → payment → ledger/receipt → clearance | BROKEN | G02 G04 G05 G06 G08 G09 G31 |
| Expenses/vendors | /accounts/expenses, /accounts/vendors, /accounts/reports | expenses, vendors, audit_logs | Accounts/admin | payees/costs → reports | PARTIAL | G09 |
| Onboarding | /onboarding, /api/onboarding/* | onboarding_cases, onboarding_audit_logs, student_lms_access, profiles/Auth | Assigned onboarding/admin | admission/payment → documents/batch → identity/access | BROKEN | G03 G07 G10 |
| Courses/content | /academics/courses | courses, course_modules, lessons, lesson_progress | Trainer/admin; student consumption | curriculum/trainer → course delivery | PARTIAL | G14 G15 |
| Batches/scheduling | /academics/batches, /academics/schedule, /api/conference/create-meeting | batches, batch_students, batch_transfer_audits, class_sessions | Trainer/admin/support per permissions | course/trainer/capacity → timetable/session | PARTIAL | G15 G16 |
| Attendance | /academics/attendance, /api/attendance/sync-meeting, meeting webhooks | attendance_records, meeting logs | Trainer/admin; student own progress | session → attendance → certificate/placement | PARTIAL | G15 G32 |
| Assessments/assignments | /academics/assessments, /academics/assignments | assignments, submissions, quizzes, quiz_questions, quiz_attempts | Trainer/admin/student | course → submission/grading → progress | BROKEN | G14 G16 |
| SAP labs | /academics/sap-servers | sap_server_systems, sap_server_allocations | Authorized academic staff/student | enrollment → lab allocation | UNVERIFIED |  |
| Students/portal | /students, /students/[id], /portal | students, profiles, content, payments, progress | Student/self; scoped staff | identity/enrollment → study/fees/support/placement | BROKEN | G03 G13 G14 G16 |
| Support | /support; portal doubt panels | student_doubts, doubt_messages | Support/trainer/student | student/course → ticket → response/notification | PARTIAL | G15 |
| Certificates | /certificates, /certificate/verify/[id], /api/certificates/[id]/pdf | certificates, enrollment/progress/fees | Admin issuer; public verification | academic/fee eligibility → issuance/revocation | BROKEN | G17 G18 |
| Placement | /placement, /placement/enrollments; portal placement panel | placement_profiles, job_openings, job_applications; local enrollment/history/settings | Placement/admin/student | training/fees/resume → eligibility → job/interview/outcome | BROKEN | G15 G24 G25 G26 |
| Users/settings | /users, /settings, /api/settings | profiles/Auth, system_settings; local store | Admin/super admin intended | configuration/identity → all modules | BROKEN | G19 G20 G21 |
| Audit/import/database | /audit-logs, /api/audit-logs, /api/bulk-import/*, /api/database/* | audit_logs; imported records; adapter sync tables | Administrative operations intended | all modules → audit/import/export/recovery | BROKEN | G22 G23 G28 G29 |
| Notifications/storage/realtime | /api/workflow/notifications, /api/storage/*, /api/upload, /api/realtime/* | notifications, storage.buckets/objects; process-local subscriptions | Own inbox / authorized files; exact generic routes need hardening | events/files → delivery/consumption | PARTIAL | G02 G30 |
| Dashboard/todos | /dashboard, /, /todos | dashboard aggregates; todos | Role-dependent dashboard; todo role access unverified | module records → aggregate navigation | UNVERIFIED | G09 |

Every route and static control is enumerated in [coverage matrix](LMS_MODULE_COVERAGE_MATRIX.md) and [control inventory](master-evidence/CONTROL_COVERAGE.md). Exact frontend imports are in route-inventory.json; services frequently call Supabase/local adapters directly without a corresponding app API route. Table names above are migration/adapter evidence, not assertions of live deployment.

## 3. Missing requirements versus optional enhancements

**MISSING/INCOMPLETE required mechanisms:** trustworthy live identity boundary; authoritative user creation/reset/revocation; durable cross-module financial consistency; checked provisioning result; consistent installment reversal; server-authoritative assessment scoring; failed-sync recovery; verified placement mutation authorization; and a verified independent staging environment for load tests.

**No demonstrated complete implementation:** refund/chargeback API lifecycle, durable notification retry/outbox, long-pending payment escalation, and comprehensive reconciliation/recovery procedures. Existing service helpers do not establish a complete UI/API/database journey.

**OPTIONAL enhancements, not defect counts:** employer portal, AI matching, advanced analytics warehouse, third-party interview calendar sync and new marketing automation. Define product requirements before implementing.

## 4. Broken workflow boundaries

CRM creation/updates can report local success after remote failure (G15). Conversion reaches admission/payment APIs with guards, but identity fallback weakens their actor trust (G02). Approval has CAS and duplicate checks, while installments and relational consumers diverge (G04–G09). Onboarding recognizes thresholds but reports activation after Auth failure (G07/G10). Learning and certificates trust client/aggregate/hardcoded outcomes (G13–G18). Placement and user management retain local-only authoritative actions (G19/G20/G24–G26).

`Lead → assignment → follow-up/demo → admission → enrollment → pending fee → independent Accounts decision → ledger/receipt → onboarding/documents → course/batch/trainer → real identity → positive access gate → learning/attendance/assessment → completion → placement`

For every stage, the coverage matrix records the initiating department and unverified handoff. Normal rejection/resubmission exists for payments; network recovery, late admission approval after payment, canceled admissions, multi-enrollment transfers, chargebacks and failed identity delivery need explicit state/retry tests. No synthetic unit shortcut is counted as a completed department-to-department browser workflow.

## 5. Confirmed defect register

G01–G07 have current isolated runtime reproductions included in this run's627 tests. Remaining findings are confirmed **source behavior**, with affected deployed outcomes explicitly unverified. Grouped local-success behavior is counted once, not once per module.

### G01 — Unsigned identity cookie

- **Module / feature:** Security / Unsigned identity cookie
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — current isolated reproduction.
- **Expected behavior / recommendation:** Require authoritative Auth and current profile; reject missing signatures.
- **Actual behavior:** Signature validity starts true; absent signature is accepted.
- **Exact source:** middleware.ts:132.
- **Reproduction:** Run current auth-reproductions F01 with unsigned synthetic administrator.
- **Business impact:** Protected-page role impersonation.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — current isolated reproduction. See supporting domain review for reachability and policy qualifications.

### G02 — Live Auth failure falls back to cookie

- **Module / feature:** Security / Live Auth failure falls back to cookie
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — current isolated reproduction.
- **Expected behavior / recommendation:** No live fallback; derive role/tenant/active status only from verified Auth profile.
- **Actual behavior:** Failed live authentication can return unknown decoded cookie identity; shared default signing secret exists.
- **Exact source:** lib/auth/payment-session.ts:36; lib/security/auth-cookie.ts:9.
- **Reproduction:** Current auth-reproductions F02 uses rejected live session and signed unknown identity.
- **Business impact:** Financial and shared API identity boundary is bypassable under fallback conditions.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — current isolated reproduction. See supporting domain review for reachability and policy qualifications.

### G03 — Missing/error LMS gate

- **Module / feature:** Onboarding / Missing/error LMS gate
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — current isolated reproduction.
- **Expected behavior / recommendation:** Require positive enabled gate and matching student/enrollment; fail closed on errors.
- **Actual behavior:** Only explicit enabled=false blocks portal access.
- **Exact source:** middleware.ts:196.
- **Reproduction:** Current auth-reproductions F03 tests missing row and database error.
- **Business impact:** Premature access during provisioning gaps or outages.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — current isolated reproduction. See supporting domain review for reachability and policy qualifications.

### G04 — Foreign installment allocation

- **Module / feature:** Accounts / Foreign installment allocation
- **Type / priority / classification:** Data; P1; CONFIRMED DEFECT — current isolated reproduction.
- **Expected behavior / recommendation:** Validate tenant/student/enrollment/fee at record and approval.
- **Actual behavior:** Installment lookup is by ID only.
- **Exact source:** lib/services/fee-workflow-service.ts:954,1270.
- **Reproduction:** Current finance-reproductions F04 credits an unrelated synthetic installment.
- **Business impact:** Wrong-account in-memory balances; cross-tenant durable write not established.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — current isolated reproduction. See supporting domain review for reachability and policy qualifications.

### G05 — Correction drops allocation

- **Module / feature:** Accounts / Correction drops allocation
- **Type / priority / classification:** Broken; P1; CONFIRMED DEFECT — current isolated reproduction.
- **Expected behavior / recommendation:** Preserve existing valid allocation unless explicitly replaced and validated.
- **Actual behavior:** Editing notes clears installment_id.
- **Exact source:** lib/services/fee-workflow-service.ts:1067.
- **Reproduction:** Current finance-reproductions F05 edits notes.
- **Business impact:** Approval loses allocation history.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — current isolated reproduction. See supporting domain review for reachability and policy qualifications.

### G06 — Reversal leaves installment paid

- **Module / feature:** Accounts / Reversal leaves installment paid
- **Type / priority / classification:** Data; P1; CONFIRMED DEFECT — current isolated reproduction.
- **Expected behavior / recommendation:** Reverse exact allocation in the same transaction.
- **Actual behavior:** Void reverses fee but not previously credited installment.
- **Exact source:** lib/services/fee-workflow-service.ts:1704,1270.
- **Reproduction:** Current finance-reproductions F06 approves then voids synthetic receipt.
- **Business impact:** Contradictory outstanding installment and account totals.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — current isolated reproduction. See supporting domain review for reachability and policy qualifications.

### G07 — False activation after Auth failure

- **Module / feature:** Onboarding / False activation after Auth failure
- **Type / priority / classification:** Broken; P0; CONFIRMED DEFECT — current isolated reproduction.
- **Expected behavior / recommendation:** Checked provisioning state machine with retry/compensation; verify existing membership.
- **Actual behavior:** Returned Auth errors/profile upsert failures do not prevent activation.
- **Exact source:** lib/services/onboarding-service.ts:738-777.
- **Reproduction:** Current provisioning-reproduction F07 rejects synthetic createUser and observes success.
- **Business impact:** Student marked active without usable identity; external writes are not rolled back with snapshot.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — current isolated reproduction. See supporting domain review for reachability and policy qualifications.

### G08 — Local reversal after server rejection

- **Module / feature:** Accounts / Local reversal after server rejection
- **Type / priority / classification:** Broken; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Server-authoritative mutation; reconcile uncertain outcomes before retry.
- **Actual behavior:** Any API failure falls back to local void and success message.
- **Exact source:** app/(dashboard)/accounts/receipts/page.tsx:110-124.
- **Reproduction:** Inspect catch path; staging test 403/409/timeout with eligible synthetic receipt.
- **Business impact:** False official credit-note success and refresh inconsistency.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G09 — Split authoritative persistence

- **Module / feature:** Database / Split authoritative persistence
- **Type / priority / classification:** Data; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** One authority or transactional projections, with cross-module reconciliation.
- **Actual behavior:** Workflow commit updates JSON and gates, not relational financial/student consumers.
- **Exact source:** lib/services/payment-workflow-transaction.ts:84; supabase/migrations/20261012094737_payment_approval_workflow.sql:48.
- **Reproduction:** Compare snapshot approval to relational consumers in independent staging; live discrepancy not queried.
- **Business impact:** Different modules can read different committed versions.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G10 — Legacy clearance differs from policy

- **Module / feature:** Onboarding / Legacy clearance differs from policy
- **Type / priority / classification:** Broken; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Centralize policy and require audited explicit legacy exceptions.
- **Actual behavior:** Backfill clears on positive historical paid amount; main path requires threshold.
- **Exact source:** lib/services/onboarding-service.ts:1527,374.
- **Reproduction:** Source trace; backfill below-threshold synthetic legacy admission.
- **Business impact:** Legacy records bypass normal financial clearance.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G11 — Generic fallback passwords

- **Module / feature:** Security / Generic fallback passwords
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Remove generic live fallback; isolate test credentials outside production paths.
- **Actual behavior:** After failed live login, generic password allowlist accepts any matching local account.
- **Exact source:** lib/auth/credentials.ts:51,101-104.
- **Reproduction:** Review helper and test local account with another role preset password; server reachability limited by client-module import.
- **Business impact:** Weak shared credentials can select privileged identity where helper executes.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G12 — Server imports client preflight

- **Module / feature:** Security / Server imports client preflight
- **Type / priority / classification:** Broken; P1; CONFIRMED DEFECT — isolated production HTTP POST returned 401/account_deactivated with function-call error.
- **Expected behavior / recommendation:** Move pure policy to server-safe module; test valid native and hydrated login.
- **Actual behavior:** Server credential helper calls a use-client module export; errors are mapped to deactivation.
- **Exact source:** lib/auth/credentials.ts:4,68,116; components/providers/auth-provider.tsx:1; app/api/auth/login/route.ts:68.
- **Reproduction:** Execute production native POST with synthetic preset and inspect response; do not equate unit execution with server behavior.
- **Business impact:** Valid login may be denied or misreported; live success unverified.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — isolated production HTTP POST returned 401/account_deactivated with function-call error. See supporting domain review for reachability and policy qualifications.

### G13 — Unmatched identity uses first student

- **Module / feature:** Student / Unmatched identity uses first student
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Fail closed; bind authenticated user and tenant to exact student.
- **Actual behavior:** No matching profile falls back to store.students[0].
- **Exact source:** app/portal/page.tsx:120-132.
- **Reproduction:** Source trace with unmatched student and nonempty hydrated store.
- **Business impact:** Potential another-student data display; remote scope depends on hydration.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G14 — Client answer keys and repeat progress

- **Module / feature:** Academics / Client answer keys and repeat progress
- **Type / priority / classification:** Security; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Server scoring, redacted answers, attempt limits, unique learning-unit progress.
- **Actual behavior:** Client receives correct-answer fields and grades; every passing attempt adds15 progress.
- **Exact source:** components/portal/quiz-runner-modal.tsx:116-127; lib/services/academics-service.ts:1566-1572,1665-1669; app/portal/page.tsx:2414.
- **Reproduction:** Inspect quiz props; repeat passing recordQuizAttempt with same quiz in isolated fixture.
- **Business impact:** Manipulable academic outcomes and inflated completion.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G15 — Remote failure reported as local success

- **Module / feature:** CRM/Academics/Placement/Support / Remote failure reported as local success
- **Type / priority / classification:** Data; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Authoritative mutations and explicit failed/pending offline state, with idempotent recovery.
- **Actual behavior:** Local writes precede remote mutations; returned database errors are ignored.
- **Exact source:** lib/services/crm-service.ts:103-138; lib/services/doubt-service.ts:186-226; lib/services/academics-service.ts:72-94; lib/services/placement-service.ts:91-117.
- **Reproduction:** Source trace: database returns error after local save; UI service still returns record.
- **Business impact:** Lost leads, tickets, course changes and placement data after refresh/restart.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G16 — Course-only batch scoping

- **Module / feature:** Student / Course-only batch scoping
- **Type / priority / classification:** Security; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Restrict to enrolled batch or explicitly course-wide resources.
- **Actual behavior:** Assignments/sessions filter only by course, not student batch.
- **Exact source:** app/portal/page.tsx:152-153,161-162.
- **Reproduction:** Use two synthetic batches sharing a course; inspect selection predicates.
- **Business impact:** Other-batch schedules, assignments and meeting links may appear.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G17 — Invented scores and wrong-course issuance

- **Module / feature:** Certificates / Invented scores and wrong-course issuance
- **Type / priority / classification:** Data; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Derive enrollment-specific actual metrics and enforce issuer authorization.
- **Actual behavior:** Checks aggregate student eligibility, hardcodes assignment90/exam88, lacks requested-course enrollment binding.
- **Exact source:** lib/services/certificate-service.ts:29-45,77-78.
- **Reproduction:** Inspect arbitrary existing course supplied for otherwise eligible student.
- **Business impact:** Inaccurate credentials and certificates for uncompleted courses.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G18 — Revoked PDF still issued

- **Module / feature:** Certificates / Revoked PDF still issued
- **Type / priority / classification:** Broken; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Reject invalid/revoked issuance and choose revocation-aware access/cache rules.
- **Actual behavior:** PDF route does not check revocation and publicly caches output.
- **Exact source:** app/api/certificates/[id]/pdf/route.ts:21-37,52-57.
- **Reproduction:** Request revoked synthetic certificate PDF in staging; source route has no validity guard.
- **Business impact:** Revoked official documents remain obtainable.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G19 — Local-only account administration

- **Module / feature:** Users / Local-only account administration
- **Type / priority / classification:** Incomplete; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Trusted Auth administration, checked profile updates and session revocation.
- **Actual behavior:** Create/edit/deactivate update store rather than real Auth identity/session lifecycle.
- **Exact source:** lib/services/auth-service.ts:37-76; app/(dashboard)/users/page.tsx:106,162,203.
- **Reproduction:** Trace UI handler to local mutation; verify Auth on staging.
- **Business impact:** UI account state does not establish actual login or revocation.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G20 — Password reset reports success without reset

- **Module / feature:** Users / Password reset reports success without reset
- **Type / priority / classification:** Broken; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Use trusted password recovery/admin reset and validate provider result.
- **Actual behavior:** Entered password is not passed to Auth; only updated_at/audit/success change; reset URL is locally generated.
- **Exact source:** app/(dashboard)/users/page.tsx:324-349,230.
- **Reproduction:** Follow manual password submit handler; inspect updateUser arguments.
- **Business impact:** Administrator believes access was reset while credentials remain unchanged.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G21 — Caller-supplied administrator authority

- **Module / feature:** Settings / Caller-supplied administrator authority
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Verified actor, tenant and allowlisted fields; ignore body roles.
- **Actual behavior:** Unverified cookie/body role authorizes settings mutation; arbitrary body fields spread into settings.
- **Exact source:** app/api/settings/route.ts:26-54,65-87,97-104.
- **Reproduction:** Source trace POST with updated_by_role admin and no genuine session; do not execute on operational system.
- **Business impact:** Unauthorized configuration changes.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G22 — Unauthenticated bulk import

- **Module / feature:** Import / Unauthenticated bulk import
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Authenticated permission, authoritative tenant, validation and normal lifecycle transaction.
- **Actual behavior:** Imports use caller userId/userName without session/tenant authorization; alternate Active/paid records created locally.
- **Exact source:** app/api/bulk-import/execute/route.ts:7-46; lib/services/bulk-import-service.ts:749.
- **Reproduction:** Trace direct valid synthetic CSV POST with arbitrary actor.
- **Business impact:** Unauthorized mutation and bypass of normal enrollment/payment approval.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G23 — Unverified role cookie for audit reads

- **Module / feature:** Audit / Unverified role cookie for audit reads
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Authenticate active actor, scope tenant and paginate.
- **Actual behavior:** user_role cookie authorizes unbounded audit query without tenant predicate.
- **Exact source:** app/api/audit-logs/route.ts:15-20,38-40.
- **Reproduction:** Source trace arbitrary admin role cookie; actual live exposure depends on RLS.
- **Business impact:** Potential sensitive cross-user audit disclosure.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G24 — Eligibility override has no service authorization

- **Module / feature:** Placement / Eligibility override has no service authorization
- **Type / priority / classification:** Security; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Server-side role/tenant/ownership and configuration enforcement.
- **Actual behavior:** Validates reason but not role/allow_admin_override; missing actor recorded as admin.
- **Exact source:** lib/services/placement-service.ts:1083-1127.
- **Reproduction:** Call local service with absent/disallowed actor and valid reason in fixture.
- **Business impact:** Unauthorized eligibility bypass in client/local model; remote exploit unverified.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G25 — Invalid job applications accepted

- **Module / feature:** Placement / Invalid job applications accepted
- **Type / priority / classification:** Broken; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Validate existing open unexpired job and approved enrollment; enforce unique application.
- **Actual behavior:** Missing, closed or expired job is not rejected before local application creation.
- **Exact source:** lib/services/placement-service.ts:280-319.
- **Reproduction:** Inspect optional job fields and validation path with nonexistent/closed opening.
- **Business impact:** Orphan or invalid candidate applications.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G26 — Close/delete and empty results do not reconcile

- **Module / feature:** Placement / Close/delete and empty results do not reconcile
- **Type / priority / classification:** Data; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Durable authorized mutation and explicit cache replacement on valid empty response.
- **Actual behavior:** Close/delete local only; empty live result can retain stale local rows.
- **Exact source:** lib/services/placement-service.ts:243-258,192-205,264-273.
- **Reproduction:** Close local job then reload live list; compare source branches.
- **Business impact:** Reappearing jobs and stale placement queues.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G27 — Performance SLA report contradicts its metrics

- **Module / feature:** Reporting / Performance SLA report contradicts its metrics
- **Type / priority / classification:** Broken; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Recompute SLA verdicts; separate measured network, simulations and estimates; require isolated authenticated evidence.
- **Actual behavior:** Report labels latency above stated thresholds PASSED; script sections measure estimates/local loops instead of browser/video/server load.
- **Exact source:** docs/performance/100-user-performance-report.md:49; scripts/performance-audit.ts:287-298,786-796,827-839.
- **Reproduction:** Compare report p95 2048.63ms to450ms threshold; inspect literal metrics and local burst loops.
- **Business impact:** False capacity/readiness confidence; no current load measurements verified.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G28 — Unauthenticated full-store backup

- **Module / feature:** Database / Unauthenticated full-store backup
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — isolated anonymous GET returned 200 and whole-store JSON envelope; response body not retained.
- **Expected behavior / recommendation:** Verified administrative actor, tenant scope, redaction and controlled backup jobs.
- **Actual behavior:** GET serializes whole store; POST creates disk backup without authentication or tenant scoping.
- **Exact source:** app/api/database/backup/route.ts:5-19,29-36.
- **Reproduction:** Inspect GET serialization and POST adapter call; no operational request performed.
- **Business impact:** Sensitive populated process records exposed and unauthenticated resource-consuming writes.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — isolated anonymous GET returned 200 and whole-store JSON envelope; response body not retained. See supporting domain review for reachability and policy qualifications.

### G29 — Unauthenticated sync and ignored errors

- **Module / feature:** Database / Unauthenticated sync and ignored errors
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Require authorized actor and trusted direction, inspect every result, reconcile via canonical transactions.
- **Actual behavior:** Caller can trigger push/pull; returned database errors do not prevent synced-count success.
- **Exact source:** app/api/database/sync/route.ts:7-17; lib/supabase/sync-service.ts:152-163,382,419-433.
- **Reproduction:** Source trace default push without session; remote acceptance depends on RLS.
- **Business impact:** Unauthorized sync attempts and false reconciliation success; alternate legacy financial writes.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G30 — Unscoped event subscription/injection

- **Module / feature:** Realtime / Unscoped event subscription/injection
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Authenticate scoped topics, validate event schema, expose working authorized adapter and test two instances.
- **Actual behavior:** Unauthenticated wildcard subscription and arbitrary topic broadcast; cross-process channel call missing on normal DB wrapper and error suppressed.
- **Exact source:** app/api/realtime/stream/route.ts:8-14,32-40; app/api/realtime/broadcast/route.ts:7-19; lib/services/realtime-service.ts:75-88.
- **Reproduction:** Inspect wildcard hub dispatch and route auth absence; no operational stream subscription performed.
- **Business impact:** Same-process notification leakage/injection and unreliable cross-instance delivery.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G31 — Gateway bypasses canonical financial verification

- **Module / feature:** Accounts / Gateway bypasses canonical financial verification
- **Type / priority / classification:** Security; P0; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Fail closed when disabled; validate capture against trusted stored order, actor/tenant and amount; canonical idempotent ledger transaction.
- **Actual behavior:** Unauthenticated verify accepts simulated/missing signatures when gateway config absent, trusts body ledger targets and amount; webhook similarly conditional; legacy writes not transactional.
- **Exact source:** app/api/payments/verify/route.ts:13-54,76-94; app/api/webhooks/razorpay/route.ts:13-21; lib/services/finance-service.ts:159-189,408-466.
- **Reproduction:** Trace config-absent signature paths and body references; do not execute financial mutation on operational system.
- **Business impact:** Forged/incorrect financial credit and approval bypass under fallback configuration.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G32 — Unsigned meeting events when secrets absent

- **Module / feature:** Attendance / Unsigned meeting events when secrets absent
- **Type / priority / classification:** Security; P1; CONFIRMED DEFECT — source behavior; live effect unverified.
- **Expected behavior / recommendation:** Disable processing without valid secrets; authenticate channel, enforce freshness/dedupe and meeting tenant mapping.
- **Actual behavior:** Missing integration secrets permit ordinary unsigned events; Zoom freshness check absent.
- **Exact source:** app/api/webhooks/zoom/route.ts:41-48; lib/services/meeting-attendance-service.ts:39-75,107-116.
- **Reproduction:** Trace ordinary event paths with absent secret; distinguish challenge acknowledgements from mutation.
- **Business impact:** Untrusted/replayed attendance can affect eligibility.
- **Root cause:** The cited implementation uses the unsafe or incomplete boundary described above; deployed configuration and downstream effect are not inferred from source alone.
- **Dependencies:** Auth/tenant repair first for role-sensitive mutations; isolated synthetic backend and authoritative persistence for integration validation.
- **Verification status:** CONFIRMED DEFECT — source behavior; live effect unverified. See supporting domain review for reachability and policy qualifications.

### G33 — Attendance query filter logic inversion on date selection

- **Module / feature:** Academics / Attendance record filtering and CSV export
- **Type / priority / classification:** Functional / Data Integrity; P1; CONFIRMED DEFECT — confirmed via component inspection.
- **Expected behavior / recommendation:** Filtering attendance by a specific date must display and export only attendance records matching that date; if no records exist for that date, export an empty list or show a "No records found" notification.
- **Actual behavior:** When `filtered.length === 0`, line 180 falls back to `store.attendanceRecords`, exporting the entire institute database of attendance records across all dates and batches.
- **Exact source:** app/(dashboard)/academics/attendance/page.tsx:177-180.
- **Reproduction:** Navigate to `/academics/attendance`, select a future date with zero recorded sessions, and click "Export CSV". Observe that the exported file contains all historical attendance records instead of an empty report.
- **Business impact:** Confidentiality leakage and inaccurate reporting; administrators inadvertently download incorrect date data.
- **Root cause:** Ternary fallback logic `targetRecords = filtered.length > 0 ? filtered : store.attendanceRecords` incorrectly interprets empty filter results as a reason to fall back to the entire store.
- **Dependencies:** None.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in component audit.

### G34 — Plaintext SAP sandbox credentials and passwords stored in client state

- **Module / feature:** Academics / SAP Lab Server Provisioning
- **Type / priority / classification:** Security / Credential Exposure; P0; CONFIRMED DEFECT — confirmed via component inspection.
- **Expected behavior / recommendation:** Plaintext credentials and passwords must never be stored in bulk client-side state or rendered in the DOM; access must be gated through an authenticated on-demand server route with audit logging.
- **Actual behavior:** Plaintext SAP user passwords and client logon parameters are fully loaded into React client state and Zustand store for all allocated students; even when hidden by UI bullets `••••••••`, raw passwords exist in DOM props and React DevTools.
- **Exact source:** app/(dashboard)/academics/sap-servers/page.tsx:716, 729; lib/services/sap-lab-service.ts.
- **Reproduction:** Open `/academics/sap-servers` as any user with page access, inspect the DOM or React component tree in DevTools, and extract `alloc.sap_password` directly from component state.
- **Business impact:** Enterprise SAP server credential compromise; unauthorized student or staff access to shared training instances.
- **Root cause:** Architecture lacks a zero-knowledge credential vault pattern; password generation returns plaintext strings directly into the client store.
- **Dependencies:** Auth/tenant repair and dedicated credential reveal API.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in component audit.

### G35 — Batch student transfer maximum capacity validation bypass

- **Module / feature:** Academics / Batch Operations
- **Type / priority / classification:** Academic Integrity / Capacity Rules; P1; CONFIRMED DEFECT — confirmed via service inspection.
- **Expected behavior / recommendation:** Transferring a student between batches must validate that the destination batch has available capacity (`enrolled_count < maximum_capacity`) and fail if the batch is full.
- **Actual behavior:** `transferStudentBatch` performs trainer ownership checks and status checks, but omits verifying destination batch capacity against `maximum_capacity`, permitting silent batch oversubscription.
- **Exact source:** lib/services/academics-service.ts:540-581.
- **Reproduction:** Attempt to transfer a student into a batch that already has `enrolled_count >= maximum_capacity`. Observe that the transfer succeeds and increments occupancy past the limit.
- **Business impact:** Classroom and virtual lab overcrowding, trainer overload, and breach of contractual batch size limits.
- **Root cause:** Missing invariant assertion on `targetBatch.enrolled_count < targetBatch.maximum_capacity` prior to executing transfer.
- **Dependencies:** R04 (PostgreSQL trigger for batch occupancy).
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in service audit.

### G36 — Lead conversion marks lead enrolled before admission confirmation

- **Module / feature:** CRM & Admissions / Lead Conversion Workflow
- **Type / priority / classification:** Workflow Integrity; P1; CONFIRMED DEFECT — confirmed via service inspection.
- **Expected behavior / recommendation:** A lead's stage must only transition to `'Enrolled'` after the admission record has been successfully committed to the database and confirmed.
- **Actual behavior:** `convertLeadToAdmission` sets `lead.stage = 'Enrolled'` immediately when prefilling the admission form. If the admission creation is aborted or fails, the lead remains permanently marked as 'Enrolled'.
- **Exact source:** lib/services/crm-service.ts:227-254; app/(dashboard)/crm/leads/page.tsx:731.
- **Reproduction:** Call `convertLeadToAdmission(leadId)`. Cancel out of the subsequent admission modal. Check lead status; observe that the lead is already marked 'Enrolled' with no corresponding admission record.
- **Business impact:** Orphan enrolled leads without student records, corrupting conversion analytics and counsellor pipeline quotas.
- **Root cause:** Premature side-effect in prefill helper that mutates state before the transaction boundary is reached.
- **Dependencies:** None.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in service audit.

### G37 — Hardcoded fallback actor IDs in attendance and CRM audit trails

- **Module / feature:** Academics & CRM / Operational Auditing
- **Type / priority / classification:** Auditing / Non-Repudiation; P2; CONFIRMED DEFECT — confirmed via component inspection.
- **Expected behavior / recommendation:** All mutations must capture the exact authenticated user ID as the actor; missing sessions must fail closed.
- **Actual behavior:** Attendance marking and lead management fall back to hardcoded strings `'usr-trainer'` or `'usr-counsellor'` when the active user context is missing or unmapped.
- **Exact source:** app/(dashboard)/academics/attendance/page.tsx:147-152; app/(dashboard)/crm/leads/page.tsx:103.
- **Reproduction:** Mark attendance or create lead when session identity is partially unmapped; observe `'usr-trainer'` recorded in audit logs and class session records.
- **Business impact:** Loss of audit trail non-repudiation; inability to identify which staff member actually recorded attendance or created records.
- **Root cause:** Defensive fallback coding that prioritizes preventing UI errors over audit integrity.
- **Dependencies:** G01, G02.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in component audit.

### G38 — Missing follow-up date/time picker in lead stage update modal

- **Module / feature:** CRM / Lead Follow-up Management
- **Type / priority / classification:** UI/UX & Functional; P2; CONFIRMED DEFECT — confirmed via component inspection.
- **Expected behavior / recommendation:** Transitioning a lead to "Follow-up Scheduled" or "Demo Scheduled" must prompt for an interactive date and time picker to schedule the reminder.
- **Actual behavior:** Quick action modal provides only a text notes area without a date or time selector, failing to update `follow_up_date` accurately.
- **Exact source:** app/(dashboard)/crm/leads/page.tsx:110-118, 447-496.
- **Reproduction:** Open lead actions, select stage "Follow-up", and note that no calendar or time input is available to schedule the appointment.
- **Business impact:** Missed lead follow-ups, lost prospective students, and broken counsellor SLA schedules.
- **Root cause:** Incomplete modal UI implementation where follow-up state hooks exist in component header but are omitted from the quick stage transition modal.
- **Dependencies:** None.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in component audit.

### G39 — Client-side role impersonation dropdowns in financial dashboards

- **Module / feature:** Accounts & Payments / UI Authorization
- **Type / priority / classification:** Security / Authorization; P0; CONFIRMED DEFECT — confirmed via component inspection.
- **Expected behavior / recommendation:** The authenticated user's identity must be derived exclusively from secure session cookies; client UI must never allow switching actor identities without backend re-authentication.
- **Actual behavior:** Both `/accounts/payments` and `/accounts/approvals` render an interactive `<select>` dropdown allowing any user to switch active actor to `Suresh Kumar (Accountant)` or `Rajesh Kumar (Senior SAP Architect)`.
- **Exact source:** app/(dashboard)/accounts/payments/page.tsx:88-102; app/(dashboard)/accounts/approvals/page.tsx:95-110.
- **Reproduction:** Open `/accounts/payments`, select `Suresh Kumar (Accountant)` from the actor dropdown, and execute payment approval or recording mutations.
- **Business impact:** Complete bypass of segregation of duties; unauthorized approval of fees and expenses by staff or students.
- **Root cause:** Leftover development/demo switcher controls rendered in production view without environment checks.
- **Dependencies:** G01, G02.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in component audit.

### G40 — Ephemeral client-side persistence and hydration loss on browser F5 reload

- **Module / feature:** Platform / Persistent Storage Adapter
- **Type / priority / classification:** Architecture / Data Persistence; P2; CONFIRMED DEFECT — confirmed via adapter inspection.
- **Expected behavior / recommendation:** Client browser mutations must persist reliably across page reloads by synchronizing authoritatively with Supabase PostgreSQL.
- **Actual behavior:** Browser writes rely on `localStorage`, which diverges from server disk persistence; on F5 reload, Next.js SSR rehydrates from server disk or baseline seeds, discarding client-side mutations that were not synced to PostgreSQL.
- **Exact source:** lib/services/persistent-storage-adapter.ts:48-75, 180-234.
- **Reproduction:** Perform a local mutation in browser (e.g. update profile or create lead), refresh the page with F5, and observe state reverting to initial server snapshot.
- **Business impact:** User frustration, lost work, and apparent system instability during normal browser reloads.
- **Root cause:** Dual-environment adapter design that does not provide authoritative client-server state reconciliation.
- **Dependencies:** G09.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in adapter audit.

### G41 — Crash risk on empty courses catalog in CRM and Academics

- **Module / feature:** CRM & Academics / Catalog Initialization
- **Type / priority / classification:** Robustness / Crash Risk; P2; CONFIRMED DEFECT — confirmed via component inspection.
- **Expected behavior / recommendation:** Components must gracefully handle empty courses arrays without throwing uncaught exceptions.
- **Actual behavior:** Code directly accesses `store.courses?.[0]?.id` and `store.courses?.[0]?.price` without null-coalescing guards, throwing unhandled `TypeError: Cannot read properties of undefined` in new or unseeded tenants.
- **Exact source:** app/(dashboard)/crm/leads/page.tsx:121, 123; app/(dashboard)/academics/courses/page.tsx:120-135.
- **Reproduction:** Clear `store.courses` array in local state and navigate to `/crm/leads` or `/academics/courses`. Observe React error boundary crash.
- **Business impact:** Total page outage for newly created enterprise tenants before courses are seeded.
- **Root cause:** Presumption that tenant seed data is always pre-populated.
- **Dependencies:** None.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in component audit.

### G42 — Student 360 detail page unhandled crash on invalid ID parameter

- **Module / feature:** Students / Profile Route
- **Type / priority / classification:** Robustness / Crash Risk; P2; CONFIRMED DEFECT — confirmed via component inspection.
- **Expected behavior / recommendation:** Navigating to `/students/[id]` with a non-existent or malformed ID must render a clean 404 alert with navigation options.
- **Actual behavior:** Missing student record throws unhandled exceptions during child tab rendering (fees, attendance, courses) or presents a broken blank canvas.
- **Exact source:** app/(dashboard)/students/[id]/page.tsx:45-65.
- **Reproduction:** Navigate to `/students/non-existent-uuid-12345`; observe unhandled runtime error.
- **Business impact:** Poor user experience and broken deep links from external notifications or emails.
- **Root cause:** Component assumes student lookup will always return a non-null object.
- **Dependencies:** None.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in component audit.

### G43 — Support & Placement mock event handlers and dead buttons

- **Module / feature:** Support & Placement / Interactive UI
- **Type / priority / classification:** UI/UX / Completeness; P3; CONFIRMED DEFECT / INCOMPLETE WORKFLOW — confirmed via component inspection.
- **Expected behavior / recommendation:** Interactive buttons must execute real backend actions or be explicitly disabled with a tooltip explaining their status.
- **Actual behavior:** Support ticket escalation, SLA alert triggers, and mock interview bookings show static toasts (`"Action recorded"` / `"Coming soon"`) without persistent backend records or notifications.
- **Exact source:** app/(dashboard)/support/page.tsx:210-245; app/(dashboard)/placement/page.tsx:320-350.
- **Reproduction:** Click "Escalate Ticket" or "Book Mock Interview"; observe UI toast appears but no network request is sent and no database record changes.
- **Business impact:** Misleading staff into believing operational actions were taken when no real action occurred.
- **Root cause:** Prototype mock handlers left in production pages.
- **Dependencies:** None.
- **Verification status:** CONFIRMED DEFECT — source behavior; verified in component audit.

## 6. Security vulnerabilities and role permissions

All nine implemented roles were included in synthetic browser login attempts: super_admin, admin, accountant, counsellor, trainer, placement_coordinator, support, onboarding_team, student. These are bundled local identities, **not real Supabase sessions**. No complete role/tenant permission certification follows from those attempts.

Role intent: counsellors submit and correct; Accounts/authorized admins approve; onboarding staff handle assigned cases; trainers teach/grade assigned academic records; students access own records; placement staff handle eligible candidates; support handles scoped doubts. UI buttons and role names are insufficient security. G01/G02/G11 and G21–G24 undermine these boundaries. Existing approved-payment recorder/approver separation and dedicated proof owner/tenant guards remain useful controls.

Additional source risks: generic upload/signing routes lack explicit ownership checks; baseline migration makes several sensitive buckets public and gives broad object policies; financial restrictive RLS does not prove tenant protection for CRM/courses/placement. See finance-security-review.md for precise lines. Deployed grants, policies and object exposure were not queried; classify live exposure **SUSPECTED RISK**, not confirmed exfiltration.

## 7. Database gaps

The fixture verifies the payment migration's CAS conflict, SQL rollback, LMS gate, restrictive tenant policy, profile-authority trigger and private proofs on minimal tables. It does not replay the full migrations or inspect operational duplicates/orphans. JSON snapshot records do not gain relational foreign-key/unique protection merely because the containing row is transactional.

Full migration replay remains UNVERIFIED: consolidated000 overlaps split schema, two006 versions exist, and early tenant-policy references depend on later tenant columns. Live migration history may differ. Use schema-only reviewed migrations and synthetic seed data, never copy operational records.

Batch transfer updates local counts with separate remote student/audit writes (academics-service.ts:599–626); deployed count-maintenance triggers are unverified, so persisted occupancy divergence is a **SUSPECTED RISK**, not an additional proved live defect.

## 8. Missing validations

Priority validations: installment ownership; revoked certificate issuance; enrollment-specific academic completion; existing/open/unexpired job; allowed override actor; strict settings field allowlist; real current identity/tenant; upload provenance; per-enrollment financial clearance. API accepting an HTTPS proof string is not proof of trusted uploaded content.

## 9. UI/UX gaps

The login form layout was exercised at desktop1440×900, laptop1280×800, tablet768×1024 and mobile390×844: fields visible, no horizontal overflow. This does not certify other screens. Accounts approvals maps the whole filtered list (page.tsx:1421), with no actual paging. G08/G15/G20 are misleading success states. Loading/error/empty-state behavior of1117 inventoried JSX controls remains explicitly unverified except the narrow login observations.

## 10. Payment and Accounts

Initial admission and payment forms no longer expose GST/installment-plan inputs in inspected sources; payments set tax_gst_amount0 and number_of_installments0. /accounts/installments is a redirect to /accounts/fees (retired UI, NOT APPLICABLE as management feature). Historical types, migration fields, receipts and service allocation support remain. Thus UI retirement is source-confirmed, but historical preservation and statutory tax compliance are **UNVERIFIED**; no legal compliance claim or destructive schema recommendation is made.

Existing tests verify discount limits, normal partial-payment thresholds, rejection/correction, duplicate/idempotent decisions, receipt numbering and same-tenant handoff. F04–F06 equivalents remain relevant to retained historical allocations even though installment UI is retired. Refund service methods do not establish a full authenticated refund API.

## 11. Onboarding

Document/batch checklist evidence guards and configured clearance exist. Real Auth provisioning was added, but ignoring errors is not a complete fix (G07). Existing-email ownership, pagination, activation rollback and delivery need staging tests. Legacy backfill uses a different clearance rule (G10). Reversal-to-zero correctly revokes clearance in the current isolated regression; do not report that disproved hypothesis as a bug.

## 12. Student and trainer

Schedules, attendance, assignments, quizzes, progress and lab screens exist, with useful capacity/time validation. Actual assigned-course/batch rights, video streaming, grading persistence and restart consistency are UNVERIFIED. G13–G18 block reliable student/certificate integrity. Course-wide access should be explicit, not inferred from matching course IDs.

## 13. Placement

Enrollment, resume/verification, eligibility, jobs, applications, interviews and outcomes have UI/service structures; no complete training-to-placement journey was executed against a persistent isolated backend. G24–G26 cover concrete rule/persistence gaps. Resume privacy and policy coverage require live verification. Optional recruiting enhancements are not counted as missing mandatory features.

## 14. Performance and scalability

**Load testing BLOCKED. No fresh p50/p95/p99, throughput, CPU, memory, database connection or video-playback measurement is claimed.** Existing report's SLA labels contradict its own values (G27). Some scripts generate estimated web metrics, local manifest strings and promise/array loops; these do not establish browser Web Vitals, streaming or500 concurrent users. Historical HTTP measurements are not automatically fabricated, but cannot certify this code/environment without raw provenance and isolation evidence.

Unmeasured risks: full tenant snapshots/CAS contention; readOnly operations that mutate shared store without joining write queue; awaited notification callbacks; full-list queries and rendering;15-second notification polling; process-local realtime. For500+ registered students, first fix correctness, add indexed scoped/paginated queries, transactional row persistence, durable jobs and CDN/object-storage video; then measure actual concurrency and size infrastructure from evidence. Registered users are not concurrent sessions.

## 15. Evidence and execution

| Check | Current outcome | Limit |
|---|---|---|
| TypeScript | PASS | current working source |
| ESLint | PASS with warnings | not business verification |
| Production build | PASS | isolated copy and mock config |
| Vitest |47 suites /627 tests PASS | includes defect reproductions; +28 vs599 baseline |
| PGlite | PASS | minimal payment migration fixture only |
| Browser | login layouts, JS/no-JS submission, nine synthetic role attempts,31 anonymous route navigations executed | no real Auth/DB or completed CRUD |
| Full lifecycle/live DB/100-user load | BLOCKED / UNVERIFIED | independent staging not proven |

Raw current evidence: [browser](master-evidence/browser-results.json), [unit summary](master-evidence/unit-summary.log), [build](master-evidence/build.log), [lint](master-evidence/lint.log), [TypeScript](master-evidence/typescript.log), [database](master-evidence/database.log). Narrow browser observation results and coverage arithmetic are in the coverage matrix. Tests never sent requests to operational Supabase.

## 16. Previously reported issues — current status

| Prior issue | Current status |
|---|---|
|15-Oct B01 conditional hook build blocker | Current build/lint pass; not carried forward |
|B02 arbitrary discount | Current regression rejects excessive discounts; policy/real role journey still unverified |
|B03 any partial payment clears | Normal-path regression fixed; G10 legacy exception remains |
|B04 no real Auth provisioning | Auth attempt added; errors still falsely succeed G07 |
|B05 missing docs/batch | Checklist guard regression passes; actual authoritative provisioning remains partial |
|B06 installment ignored | Recording now allocates, but G04–G06 remain |
|B07 local void/status inconsistency | Server command/status fix exists; G06/G08 remain |
|B08 initial-payment validation | Reference/proof guards added; regression passes |
|B09 admission replay | Idempotency regression passes; cross-process late-response test unverified |
|B10 receipt numbering | Regression passes; live cross-instance uniqueness unverified |
|B11 profile RLS | Source tenant restriction added; deployed policy unverified |
|B12 handover tenant | Regression passes; full provider delivery unverified |
|B13 dual persistence | G09 remains |
|B14 pre-commit notification | Callback deferral implemented; durable retry still missing |
|17-Oct F01–F10 | Rechecked current source; represented by G01–G10 (mapping F07→G07,F08→G08,F09→G09,F10→G10) |
|Earlier QA-04 credential in URL | Login now POST; current synthetic JS/no-JS submissions do not put password in observed URLs. Server/proxy log and analytics guarantees unverified |
|Earlier missing typecheck/E2E scripts | package still has dev/build/start/lint/test only; standalone harnesses exist, not a maintained standard e2e command |
|Claims of full coverage/100-user readiness | Not accepted: route counts/coverage claims differ from discovery and load provenance is unverified |

## 17. Prioritized roadmap

See [fix priority](LMS_GAP_FIX_PRIORITY.md): identity and sensitive endpoints first; financial/provisioning consistency second; academic/certificate/placement integrity third; persistence recovery and verified staging fourth; measured optimization last. No fixes were implemented during this audit.

## 18. Remaining blockers

Independent staging account/project/service and credentials not verified; no role-complete real Auth fixture set; no operational migration inventory; no full browser persistence/tenant journeys; no true video delivery or provider delivery tests; no load authorization on an isolated target. Missing access is not proof that a feature is absent.

## 19. Production verdict

**FAIL / NO-GO.** Useful implemented controls and passing tool checks coexist with confirmed security/financial/academic gaps. Neither pages nor successful test counts justify the previous blanket PASS claims. Detailed source evidence: [CRM/academics](master-evidence/crm-academics-review.md), [finance/security](master-evidence/finance-security-review.md), [placement/platform](master-evidence/placement-platform-review.md).


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
