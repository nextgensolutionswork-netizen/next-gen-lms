# Next Gen LMS + CRM — Master Remediation Backlog & Gap Fix Priority

**Audit Date:** 17 October 2026  
**Document Version:** 2.0.0-ENTERPRISE  
**Lead Auditor / Architect:** Principal Software Architect & QA Automation Specialist  
**Remediation Rule:** No code fixes implemented during audit inspection. Authoritative backend enforcement, atomic transaction boundaries, and negative automated regression tests take priority over cosmetic frontend alterations.

---

## 1. Executive Remediation Strategy

This document establishes the official engineering remediation backlog for the Next Gen LMS + CRM platform. Every finding identified in the Master Gap Analysis ([`COMPLETE_LMS_GAP_ANALYSIS.md`](file:///e:/my%20erp%20hub/next%20gen%20lms/docs/audits/COMPLETE_LMS_GAP_ANALYSIS.md)) is categorized by urgency, assigned an engineering ticket ID, and mapped to an exact technical remediation plan, regression test specification, and dependency graph.

### The Four-Phase Remediation Framework

```
Phase 1: P0 Critical Blockers (Sprint 1)
├── Identity, Session & RBAC Lockdown (G01, G02, G03, G11, G12, G39)
├── Sensitive API Endpoint Authentication (G21, G22, G23, G28, G29, G30)
├── Gateway & Financial Ingestion Security (G31)
└── Plaintext Credential Sanitization (G34)

Phase 2: P1 Major Defects & Ledger Integrity (Sprint 2)
├── Financial Ledger & Installment Reversals (G04, G05, G06, G08, G09, M01)
├── Provisioning, Clearance & Onboarding Recovery (G07, G10)
├── Academic Integrity & Server-Side Scoring (G13, G14, G16, G33, G35)
├── Credential Lifecycle & Placement Rules (G17, G18, G19, G20, G24, G25, G26, G32)
└── Architecture & Multi-Tenant Boundaries (R01, R02, R03, R04, R05, R06, G27)

Phase 3: P2 Medium Gaps & Operational Hardening (Sprint 3)
├── Client-Side State Persistence & F5 Hydration (G40)
├── CRM Workflow & Date/Time Scheduling (G36, G37, G38)
├── Empty State & Null Parameter Crash Guards (G41, G42)
└── Auth UX Fallbacks & Recovery Routes (M02)

Phase 4: P3 Minor Improvements & UI Polish (Sprint 4)
├── Mock Toast & Dead Control Elimination (G43)
└── Enterprise Enhancements (O01)
```

---

## 2. Priority Summary Matrix

| Priority | Ticket Count | Focus Area | Acceptance Criteria Gate |
|---|---|---|---|
| **P0 — Critical** | 15 Tickets | Identity, Auth Fallback, Endpoint Auth, Gateway Security, Credential Exposure | Zero bypasses on unsigned/expired/forged sessions; 100% 401/403 rejection on sensitive APIs; zero plaintext passwords in DOM/logs. |
| **P1 — Major** | 22 Tickets | Financial Allocation, Installment Reversals, Dual Ledgers, Server Scoring, Onboarding Auth | Atomic ACID ledger mutations; zero split-brain divergence; server-side quiz evaluation; failure propagation across all adapters. |
| **P2 — Medium** | 6 Tickets | Persistence Hydration, CRM Scheduling, Empty Catalog Guards, Parameter Routing | Zero F5 reload data loss; interactive calendar pickers; zero unhandled React/TypeScript exceptions on empty datasets. |
| **P3 — Minor** | 2 Tickets | UI Mock Toasts, Future Feature Backlog | Complete functional integration or explicit disabled state for all buttons; roadmap documentation. |

---

## 3. Phase 1 — P0 Critical Blockers (Sprint 1)

### G01 — Unsigned Identity Cookie Accepted by Middleware
- **Module / Route:** Security / Edge Middleware (`middleware.ts:132-145`)
- **Classification:** CONFIRMED DEFECT — Verified in isolated reproduction `F01`
- **Root Cause:** Middleware initializes `signatureValid = true` and only executes HMAC verification if an explicit signature cookie exists. If an attacker strips the signature cookie or sends only `auth_user`, the cookie is parsed and trusted.
- **Remediation Steps:**
  1. Refactor `middleware.ts` to default `signatureValid = false`.
  2. Require both `auth_user` and `auth_signature` cookies on all protected routes.
  3. Validate HMAC-SHA256 signature against `AUTH_COOKIE_SECRET`. If signature is missing, invalid, or expired, immediately reject with `401 Unauthorized` and clear cookies.
- **Regression Test Criteria:** Test with: (a) valid signed cookie, (b) unsigned cookie, (c) tampered payload with old signature, (d) missing signature cookie. Assert only (a) reaches dashboard; (b), (c), (d) redirect to `/login`.
- **Dependencies:** Independent Auth secret rotation.

---

### G02 — Live Supabase Auth Failure Falls Back to Unverified Cookie
- **Module / Route:** Authentication / Financial Session (`lib/auth/payment-session.ts:37-46`, `lib/security/auth-cookie.ts:9`)
- **Classification:** CONFIRMED DEFECT — Verified in isolated reproduction `F02`
- **Root Cause:** When `supabase.auth.getUser()` fails or rejects credentials, `payment-session.ts` catches the error and falls back to decoding the raw `auth_user` cookie without verifying user existence, active status, or tenant membership in PostgreSQL. Furthermore, `auth-cookie.ts` contains a hardcoded fallback secret `'default-signing-secret'`.
- **Remediation Steps:**
  1. Remove fallback-to-cookie logic in `payment-session.ts`.
  2. Require live Supabase Auth session token verification or authoritative server-side profile validation.
  3. Fail closed (`401 Unauthorized`) if Supabase Auth rejects the session.
  4. Throw a hard configuration error on server boot if `AUTH_COOKIE_SECRET` or `JWT_SECRET` is unset or matches default placeholder strings.
- **Regression Test Criteria:** Call financial API with rejected Supabase JWT but signed valid cookie for unknown user; assert `401 Unauthorized`.
- **Dependencies:** G01.

---

### G03 — Missing or Errored LMS Gate Fails Open
- **Module / Route:** Onboarding / Portal Access Gate (`middleware.ts:196-197`)
- **Classification:** CONFIRMED DEFECT — Verified in isolated reproduction `F03`
- **Root Cause:** Middleware queries `student_lms_access` table. If the student row is missing, or if Supabase throws a network/database error, the gate checks `if (gate?.enabled === false) return redirect('/onboarding/pending')`. Because `gate` is `null`/`undefined`, it does not enter the condition and allows the unverified student straight into `/portal`.
- **Remediation Steps:**
  1. Rewrite gate verification logic to fail closed: `if (!gate || gate.enabled !== true) return redirect('/onboarding/pending')`.
  2. Add try/catch block around gate database lookup; on database query error, redirect to `/login?error=auth_error` with `500` status.
- **Regression Test Criteria:** Test portal access for: (a) student with `enabled = true` (200), (b) student with `enabled = false` (redirect), (c) student with missing row in `student_lms_access` (redirect), (d) simulated database timeout (redirect with error).
- **Dependencies:** G01, G02.

---

### G11 — Generic Fallback Passwords in Production Auth Helper
- **Module / Route:** Authentication / Credentials Helper (`lib/auth/credentials.ts:51, 101-104`)
- **Classification:** CONFIRMED DEFECT — Confirmed via static source inspection
- **Root Cause:** `validateLoginPreflight` falls through after Supabase Auth fails and accepts generic test passwords against any local synthetic user account, regardless of production environment mode.
- **Remediation Steps:**
  1. Remove generic password list and bypass logic from `lib/auth/credentials.ts`.
  2. Restrict synthetic credential validation strictly to `NODE_ENV === 'test'` within dedicated fixture runners.
  3. Authoritative production login must exclusively authenticate against Supabase `auth.users` via `supabase.auth.signInWithPassword()`.
- **Regression Test Criteria:** Attempt login with generic demo password against production build; assert `401 Unauthorized` with invalid credentials error.
- **Dependencies:** None.

---

### G12 — Server API Route Imports Client-Side Component Preflight
- **Module / Route:** Authentication / Login API (`lib/auth/credentials.ts:4`, `app/api/auth/login/route.ts:68`)
- **Classification:** CONFIRMED DEFECT — Confirmed via Next.js isolated server build
- **Root Cause:** `lib/auth/credentials.ts` imported `validateLoginPreflight` from `components/providers/auth-provider.tsx` (a `'use client'` component). When executed on Node.js server runtime, invoking client-context functions threw unhandled exceptions, which the catch block misreported as `account_deactivated`.
- **Remediation Steps:**
  1. Decouple all credential and policy validation logic into pure Node-compatible TypeScript modules in `lib/auth/`.
  2. Ensure `components/providers/auth-provider.tsx` only imports from `lib/auth/`, never the inverse.
- **Regression Test Criteria:** Execute server-side POST to `/api/auth/login` without browser JavaScript; verify clean HTTP `200` on valid credentials and `401` on invalid, without React client context errors.
- **Dependencies:** None.

---

### G21 — Caller-Supplied Administrator Authority in System Settings API
- **Module / Route:** Platform Administration / Settings API (`app/api/settings/route.ts:26-87`)
- **Classification:** CONFIRMED DEFECT — Confirmed via static source inspection
- **Root Cause:** `app/api/settings/route.ts` reads `body.updated_by_role` or unverified cookie roles. If caller supplies `'admin'` or `'super_admin'` in the JSON body, the endpoint trusts it and allows updating global system settings.
- **Remediation Steps:**
  1. Authenticate caller session using live Supabase Auth token.
  2. Query caller profile from `profiles` table to verify caller has `role IN ('super_admin', 'admin')`.
  3. Implement strict field whitelist for updates (reject arbitrary JSON spread into settings).
- **Regression Test Criteria:** Send POST to `/api/settings` with payload `{ updated_by_role: 'admin', settings: { maintenance_mode: true } }` from an unauthenticated caller; assert `401 Unauthorized`.
- **Dependencies:** G01, G02.

---

### G22 — Unauthenticated Bulk Data Import API
- **Module / Route:** Operations / Bulk Import API (`app/api/bulk-import/execute/route.ts:7-46`)
- **Classification:** CONFIRMED DEFECT — Confirmed via route inspection
- **Root Cause:** Route accepts CSV payload plus caller-supplied `userId` and `userName` in request body. It lacks session verification or RBAC checks, allowing unauthenticated remote callers to insert active students, courses, batches, and paid financial balances.
- **Remediation Steps:**
  1. Enforce live Supabase Auth session with `admin` or `super_admin` role.
  2. Validate caller's tenant association and enforce tenant isolation on all inserted records.
  3. Reject student records with pre-paid balances unless verified through the financial ledger approval pipeline.
- **Regression Test Criteria:** POST synthetic CSV to `/api/bulk-import/execute` without session header; assert `401 Unauthorized`.
- **Dependencies:** G01, G02.

---

### G23 — Unverified Role Cookie for Audit Log Access
- **Module / Route:** Platform Administration / Audit API (`app/api/audit-logs/route.ts:15-40`)
- **Classification:** CONFIRMED DEFECT — Confirmed via route inspection
- **Root Cause:** Route parses raw `user_role` cookie without verifying HMAC signature. If `user_role=admin` is passed, the route queries and returns all system audit logs across all tenants without pagination.
- **Remediation Steps:**
  1. Enforce signed session token and verify `super_admin` or `admin` role in database.
  2. Enforce strict `tenant_id` filtering on `audit_logs` query.
  3. Implement cursor-based pagination with max limit of 100 rows per request.
- **Regression Test Criteria:** Send GET `/api/audit-logs` with cookie `user_role=admin`; assert `401 Unauthorized`.
- **Dependencies:** G01.

---

### G28 — Unauthenticated Whole-Store Database Backup Export
- **Module / Route:** Infrastructure / Database Backup (`app/api/database/backup/route.ts:5-19`)
- **Classification:** CONFIRMED DEFECT — Verified in runtime HTTP smoke check (returned 200 with ~90KB store)
- **Root Cause:** Endpoint serializes entire in-memory data store (users, students, financial accounts, settings, leads) into a downloadable JSON file without checking authentication, session, role, or tenant.
- **Remediation Steps:**
  1. Restrict `/api/database/backup` strictly to authenticated `super_admin` role with multi-factor confirmation.
  2. Redact sensitive PII, hashes, and financial tokens from backup payloads.
  3. Disable endpoint completely in production unless behind a private VPC / administrative subnet.
- **Regression Test Criteria:** Anonymous GET to `/api/database/backup`; assert `401 Unauthorized`.
- **Dependencies:** G01, G02.

---

### G29 — Unauthenticated Database Sync & Error Swallowing
- **Module / Route:** Infrastructure / Database Sync (`app/api/database/sync/route.ts:7-17`, `sync-service.ts:152-374`)
- **Classification:** CONFIRMED DEFECT — Confirmed via static source inspection
- **Root Cause:** Anyone can trigger a database sync push or pull without authentication. Furthermore, `sync-service.ts` loops through tables, calls `upsert()`, but swallows `{ error }` and increments `totalSynced`, reporting successful synchronization even when PostgreSQL rejected every row.
- **Remediation Steps:**
  1. Require `super_admin` authentication.
  2. Inspect every Supabase mutation result; if `{ error }` is present, record failure, abort transaction, and return detailed error summary.
- **Regression Test Criteria:** Anonymous POST to `/api/database/sync`; assert `401 Unauthorized`.
- **Dependencies:** G01, G02.

---

### G30 — Unscoped Event Subscription and Broadcast Injection
- **Module / Route:** Infrastructure / Realtime API (`app/api/realtime/broadcast/route.ts:7-19`, `app/api/realtime/stream/route.ts:8-40`)
- **Classification:** CONFIRMED DEFECT — Confirmed via route inspection
- **Root Cause:** Broadcast route accepts arbitrary topic, event, and payload from unauthenticated callers. Stream route defaults to wildcard `'*'` and streams internal notification events to any unauthenticated client.
- **Remediation Steps:**
  1. Authenticate caller session on both broadcast and stream endpoints.
  2. Restrict event subscriptions strictly to the caller's verified `tenant_id` and `user_id`.
  3. Disallow wildcard `'*'` subscription for non-administrative roles.
- **Regression Test Criteria:** Connect to `/api/realtime/stream?topics=*` anonymously; assert `401 Unauthorized`.
- **Dependencies:** G01, G02.

---

### G31 — Gateway Payment Verification Bypasses Canonical Financial Ledger
- **Module / Route:** Accounts & Payments / Gateway Verify (`app/api/payments/verify/route.ts:13-94`, `lib/services/payment-gateway-service.ts:252-264`)
- **Classification:** CONFIRMED DEFECT — Confirmed via static source inspection
- **Root Cause:** Route has no session authentication. If payment gateway keys are not configured in environment, it accepts unverified requests, creates simulated payments, and writes directly to legacy `recordPaymentAtomic` as student ID without passing through Accounts verification or the CAS workflow transaction.
- **Remediation Steps:**
  1. Enforce live webhook signature verification against official Razorpay/Cashfree secret keys.
  2. Disable mock/simulated payment capture in all environments except isolated test suites.
  3. Route all successful gateway payments through the canonical `paymentWorkflowTransaction` to update `student_fees`, `student_payments`, and `student_financial_ledger_entries` atomically.
- **Regression Test Criteria:** POST to `/api/payments/verify` with missing gateway secret; assert `403 Forbidden` / `500 Gateway Config Error`.
- **Dependencies:** G09.

---

### G34 — Plaintext SAP Sandbox Credentials & Passwords in Client State
- **Module / Route:** Academics / SAP Labs (`app/(dashboard)/academics/sap-servers/page.tsx:716, 729`, `lib/services/sap-lab-service.ts`)
- **Classification:** CONFIRMED DEFECT — Confirmed via component inspection
- **Root Cause:** Plaintext SAP user passwords and client logon strings are stored directly in React client state and Zustand store for all allocated students. Even though UI displays `'••••••••'`, the raw password string is present in client DOM props and accessible via DevTools.
- **Remediation Steps:**
  1. Redact SAP passwords on the server; never send plaintext passwords in bulk allocation lists.
  2. Implement an authenticated on-demand endpoint (`POST /api/sap/reveal-password`) that logs an audit entry, verifies caller authorization, and returns the password only to the assigned student or authorized trainer for 60 seconds.
- **Regression Test Criteria:** Inspect network response for `/api/sap-allocations`; verify `sap_password` is redacted or absent.
- **Dependencies:** G01, G02.

---

### G39 — Client-Side Role Impersonation Dropdowns in Financial Dashboards
- **Module / Route:** Accounts / Payments & Approvals (`app/(dashboard)/accounts/payments/page.tsx:88-102`, `app/(dashboard)/accounts/approvals/page.tsx:95-110`)
- **Classification:** CONFIRMED DEFECT — Confirmed via component inspection
- **Root Cause:** Both financial management pages contain an interactive `<select>` dropdown allowing the user to switch their active user ID and role between `'Suresh Kumar (Accountant)'`, `'Rajesh Kumar (Senior SAP Architect)'`, and `'Admin'`. The client uses this selected actor ID for payment approval and rejection mutations without verifying caller identity on backend.
- **Remediation Steps:**
  1. Completely remove impersonation dropdowns from financial production views.
  2. Backend financial routes must strictly derive actor ID and role from the authenticated session token, rejecting any client-supplied actor parameters.
- **Regression Test Criteria:** Verify UI renders authenticated user's name as read-only badge with no dropdown selector.
- **Dependencies:** G01, G02.

---

## 4. Phase 2 — P1 Major Defects & Financial Integrity (Sprint 2)

### G04 — Foreign Installment Allocation Without Tenant/Student Association
- **Module / Route:** Accounts / Fee Workflow (`lib/services/fee-workflow-service.ts:954-955, 1270-1271`)
- **Classification:** CONFIRMED DEFECT — Verified in isolated reproduction `F04`
- **Root Cause:** `recordPayment` looks up installment by ID alone without verifying that the installment belongs to the student's fee account or matching tenant.
- **Remediation:** Enforce composite key validation: `WHERE id = installmentId AND fee_account_id = studentFeeId AND tenant_id = currentTenantId`. Reject foreign installment IDs.
- **Regression Test:** Submit payment referencing installment belonging to Student B; assert validation error and zero allocation.

### G05 — Correction Workflow Drops Existing Installment Allocations
- **Module / Route:** Accounts / Fee Corrections (`lib/services/fee-workflow-service.ts:1067`)
- **Classification:** CONFIRMED DEFECT — Verified in isolated reproduction `F05`
- **Root Cause:** When an accountant edits/corrects a pending payment, line 1067 unconditionally clears all installment allocation metadata, losing the scheduled payment mapping upon resubmission.
- **Remediation:** Retain verified installment associations during payment correction unless explicitly modified by accountant.
- **Regression Test:** Correct payment with installment allocation; verify installment mapping remains intact after correction.

### G06 — Reversal Leaves Installment Marked as Paid in Ledger
- **Module / Route:** Accounts / Payment Reversals (`lib/services/fee-workflow-service.ts:1704`)
- **Classification:** CONFIRMED DEFECT — Verified in isolated reproduction `F06`
- **Root Cause:** When a payment is voided/reversed, the payment status changes to `Reversed`, but the linked installment balance is not restored, leaving it permanently marked as `Paid`.
- **Remediation:** In payment reversal transaction, decrement `paid_amount` on linked installments and restore status to `Pending` or `Overdue`.
- **Regression Test:** Void payment allocated to Installment 1; verify Installment 1 status reverts to `Pending` with balance due restored.

### G07 — False Student Activation After Supabase Auth Provisioning Failure
- **Module / Route:** Onboarding / Student Activation (`lib/services/onboarding-service.ts:738-777`)
- **Classification:** CONFIRMED DEFECT — Verified in isolated reproduction `F07`
- **Root Cause:** `onboarding-service.ts` calls `supabase.auth.admin.createUser()`. When Auth creation fails (or throws network error), it catches the exception, logs it, but proceeds to mark onboarding as `Completed` and activates LMS gate.
- **Remediation:** If Supabase Auth account creation fails, fail the activation step, roll back onboarding status to `Provisioning Failed`, and alert onboarding officer.
- **Regression Test:** Simulate Auth failure during onboarding completion; assert LMS gate remains `disabled` and status is `Provisioning Failed`.

### G08 — Local Optimistic Reversal After Server Rejection
- **Module / Route:** Accounts / Receipts UI (`app/(dashboard)/accounts/receipts/page.tsx:110-117`)
- **Classification:** CONFIRMED DEFECT — Verified in isolated reproduction `F08`
- **Root Cause:** Receipts page catches server reversal failure, shows a generic alert, but invokes local store reversal, misleading accountant into believing reversal succeeded.
- **Remediation:** Remove local fallback reversal; on server failure, display error message and maintain exact server state.
- **Regression Test:** Reject reversal on backend; assert UI does not alter receipt status or ledger balance.

### G09 — Split-Brain Authoritative Persistence Model
- **Module / Route:** Data Layer / Dual Ledgers (`lib/services/payment-workflow-transaction.ts:84`, `lib/supabase/db.ts`)
- **Classification:** CONFIRMED DEFECT — Confirmed via architecture audit
- **Root Cause:** Two competing financial data models exist simultaneously: legacy `feeAccounts`/`installments`/`payments` and modern `studentFees`/`studentPayments`/`studentFinancialLedgerEntries`. Centralized approval updates modern tables, leaving legacy reports and installment screens with stale balances.
- **Remediation:** Unify financial persistence into a single canonical relational schema (`student_fees`, `student_payments`, `student_financial_ledger_entries`). Remove legacy fee account arrays and migrate all reporting queries to canonical ledger.
- **Regression Test:** Record and approve fee payment; verify `/accounts/fees`, `/accounts/payments`, and `/accounts/reports` reflect identical balances.

### G10 — Legacy Backfill Financial Clearance Diverges From Policy
- **Module / Route:** Onboarding / Clearance Engine (`lib/services/onboarding-service.ts:1527`)
- **Classification:** CONFIRMED DEFECT — Verified in isolated reproduction `F10`
- **Root Cause:** Legacy backfill grants onboarding clearance for any positive paid amount (`paid > 0`), whereas official policy requires minimum threshold (50% or full registration fee).
- **Remediation:** Align legacy backfill logic to use official `evaluateFinancialClearance()` rule engine.
- **Regression Test:** Run backfill for student with 10% payment against a 50% threshold policy; assert clearance is withheld.

### G13 — Unmatched Portal Identity Auto-Resolves to First Student Record
- **Module / Route:** Student Portal (`app/portal/page.tsx:120-132`)
- **Classification:** CONFIRMED DEFECT — Confirmed via component inspection
- **Root Cause:** When an authenticated student user has no matching record in `store.students`, line 129 falls back to `store.students[0]`, exposing another student's courses, grades, fees, and certificates.
- **Remediation:** Remove fallback to `students[0]`. Display explicit "Student Record Not Found — Contact Admissions" screen.
- **Regression Test:** Login with student user not present in student roster; assert profile error screen with zero peer data exposure.

### G14 — Client-Side Assessment Grading & Progress Inflation
- **Module / Route:** Academics / Assessments (`app/portal/page.tsx:2414`, `academics-service.ts:1566-1696`)
- **Classification:** CONFIRMED DEFECT — Confirmed via component inspection
- **Root Cause:** Portal passes answer keys (`options.is_correct`) to client browser. Quiz runner modal evaluates answers locally and awards 15 progress points on every pass without attempt limits.
- **Remediation:** Redact `is_correct` from quiz question API. Submissions must be sent to server endpoint (`POST /api/quizzes/submit`) for evaluation and single-time progress credit.
- **Regression Test:** Inspect quiz network payload (verify no `is_correct` flags); submit repeated passing attempts (verify progress only credits once).

### G15 — Remote Mutation Failure Masked as Local Success
- **Module / Route:** CRM, Support & Academics (`crm-service.ts:103-138`, `doubt-service.ts:186-226`, `academics-service.ts:72-94`)
- **Classification:** CONFIRMED DEFECT — Confirmed via service inspection
- **Root Cause:** Services update local store before awaiting Supabase insert, ignore returned `{ error }`, and return local object as successful.
- **Remediation:** Await database mutation first. If error occurs, do not update local state; throw error to UI layer to notify user.
- **Regression Test:** Disconnect Supabase network; attempt lead creation; verify UI shows failure notification and lead is not added to roster.

### G16 — Course-Wide Scope Leaks Cross-Batch Assignments & Sessions
- **Module / Route:** Student Portal (`app/portal/page.tsx:152-162`)
- **Classification:** CONFIRMED DEFECT — Confirmed via component inspection
- **Root Cause:** Portal filters assignments and class sessions by `course_id` only, exposing assignments, timetables, and private Zoom meeting links of other batches to students.
- **Remediation:** Filter assignments and sessions strictly by the student's enrolled `batch_id` (plus explicitly flagged course-wide materials).
- **Regression Test:** Create two batches for Course A; verify Student in Batch 1 cannot see Batch 2 timetable or Zoom links.

### G17 — Certificate Issuance Uses Hardcoded Metrics Without Course Completion
- **Module / Route:** Certificates (`lib/services/certificate-service.ts:29-78`)
- **Classification:** CONFIRMED DEFECT — Confirmed via service inspection
- **Root Cause:** Certificate generator checks aggregate student attendance but hardcodes assignment score (90) and exam score (88), issuing certificates without verifying actual course completion.
- **Remediation:** Derive certificate eligibility from actual completed assignments, verified exam submissions, and minimum 80% attendance in the specific enrolled course.
- **Regression Test:** Attempt certificate generation for student with 0 submissions; assert rejection for incomplete coursework.

### G18 — Revoked Certificate PDF Remains Publicly Downloadable
- **Module / Route:** Certificates / PDF Route (`app/api/certificates/[id]/pdf/route.ts:21-57`)
- **Classification:** CONFIRMED DEFECT — Confirmed via route inspection
- **Root Cause:** PDF generation route queries certificate by ID and renders PDF without checking `is_valid` or revocation flags.
- **Remediation:** If certificate status is `Revoked` or `is_valid === false`, return `403 Forbidden` with revocation notice instead of official PDF.
- **Regression Test:** GET `/api/certificates/[id]/pdf` for a revoked certificate; assert `403 Forbidden`.

### G19 — Local-Only User Administration Bypasses Supabase Auth
- **Module / Route:** Platform Administration / User Management (`lib/services/auth-service.ts:37-76`, `app/(dashboard)/users/page.tsx:31`)
- **Classification:** CONFIRMED DEFECT — Confirmed via service inspection
- **Root Cause:** Creating, editing, or deactivating users on `/users` only mutates local store arrays. It does not create or deactivate Supabase Auth accounts, leaving deactivated users able to log in.
- **Remediation:** Integrate user management with Supabase Admin Auth API (`supabase.auth.admin.createUser`, `updateUserById`).
- **Regression Test:** Deactivate user in UI; verify user's Supabase Auth session is revoked and future login attempts are rejected.

### G20 — Password Reset Reports Success Without Submitting Password
- **Module / Route:** Platform Administration / User Management (`app/(dashboard)/users/page.tsx:324-349`)
- **Classification:** CONFIRMED DEFECT — Confirmed via component inspection
- **Root Cause:** User management password reset modal displays success toast and records audit log, but never submits the new password to Supabase Auth.
- **Remediation:** Wire password reset modal to `supabase.auth.admin.updateUserById(userId, { password })`.
- **Regression Test:** Reset password via modal; verify user can log in with new password and old password fails.

### G24 — Placement Eligibility Override Bypasses RBAC Authorization
- **Module / Route:** Placement / Eligibility Engine (`lib/services/placement-service.ts:1083-1127`)
- **Classification:** CONFIRMED DEFECT — Confirmed via service inspection
- **Root Cause:** Eligibility override accepts any actor and applies override even when actor lookup fails, recording fallback role `'admin'` without checking `placement:override` permission.
- **Remediation:** Enforce server-side role check (`placement_coordinator` or `super_admin`) and require signed audit reason before granting override.
- **Regression Test:** Submit override request from student or counsellor role; assert `403 Forbidden`.

### G25 — Placement Job Application Permits Closed/Expired/Invalid Jobs
- **Module / Route:** Placement / Applications (`lib/services/placement-service.ts:280-319`)
- **Classification:** CONFIRMED DEFECT — Confirmed via service inspection
- **Root Cause:** Application handler does not validate that the target job opening exists, has status `'Open'`, and has not passed its deadline.
- **Remediation:** Enforce job status validation: `WHERE id = jobId AND status = 'Open' AND application_deadline >= CURRENT_DATE`.
- **Regression Test:** Submit job application for job with status `'Closed'`; assert rejection.

### G26 — Placement Close/Delete Local State Diverges From Database
- **Module / Route:** Placement / Jobs (`lib/services/placement-service.ts:243-258`)
- **Classification:** CONFIRMED DEFECT — Confirmed via service inspection
- **Root Cause:** Closing or deleting a job only mutates local in-memory store; live reads restore database records on next query.
- **Remediation:** Perform atomic SQL update/delete in Supabase before updating client state.
- **Regression Test:** Close job in UI, refresh browser; verify job status remains `'Closed'`.

### G27 — Performance SLA Report Contradicts Empirical Measurements
- **Module / Route:** Documentation / Performance Audit (`docs/performance/100-user-performance-report.md`)
- **Classification:** CONFIRMED DEFECT — Confirmed via audit inspection
- **Root Cause:** Report marked p50 (733ms vs <150ms) and p95 (2048ms vs <450ms) as "PASSED" despite exceeding target thresholds by up to 500%.
- **Remediation:** Correct report metrics and establish truthful SLA evaluation based on empirical load test execution on isolated staging.
- **Regression Test:** Verify SLA pass/fail logic matches mathematical inequalities (`actual <= threshold`).

### G32 — Unsigned Meeting Webhook Attendance Events When Secrets Absent
- **Module / Route:** Attendance / Webhooks (`app/api/webhooks/zoom/route.ts:41-48`, `lib/services/meeting-attendance-service.ts:39-75`)
- **Classification:** CONFIRMED DEFECT — Confirmed via route inspection
- **Root Cause:** If webhook signing secrets are not configured in environment, Zoom and Google Meet webhook handlers accept unsigned attendance events and mark attendance.
- **Remediation:** Fail closed: if webhook secret is unset, return `503 Service Unavailable` and reject all event payloads. Enforce timestamp freshness (<5 mins) to prevent replay attacks.
- **Regression Test:** Send POST to Zoom webhook without signature header; assert `401 Unauthorized`.

### G33 — Attendance Query Filter Logic Inversion on Date Selection
- **Module / Route:** Academics / Attendance (`app/(dashboard)/academics/attendance/page.tsx:177-180`)
- **Classification:** CONFIRMED DEFECT — Confirmed via component inspection
- **Root Cause:** When exporting attendance, if `filtered.length === 0` (no attendance on that date), line 180 falls back to `store.attendanceRecords`, exporting the entire institute attendance database.
- **Remediation:** If `filtered.length === 0`, export an empty dataset or show alert "No records for selected date".
- **Regression Test:** Export attendance for date with zero records; assert exported CSV contains zero student rows.

### G35 — Batch Student Transfer Maximum Capacity Bypass
- **Module / Route:** Academics / Batches (`lib/services/academics-service.ts:540-581`)
- **Classification:** CONFIRMED DEFECT — Confirmed via service inspection
- **Root Cause:** `transferStudentBatch` transfers a student to a destination batch without verifying that destination batch occupancy is strictly less than `maximum_capacity`.
- **Remediation:** Add precondition: `if (targetBatch.enrolled_count >= targetBatch.maximum_capacity) throw new Error('Target batch is at maximum capacity')`.
- **Regression Test:** Attempt transfer to a full batch (25/25); assert validation error.

### G36 — Lead Conversion Marks Enrolled Before Admission Confirmation
- **Module / Route:** CRM / Admissions (`lib/services/crm-service.ts:227-254`)
- **Classification:** CONFIRMED DEFECT — Confirmed via service inspection
- **Root Cause:** `convertLeadToAdmission` sets `lead.stage = 'Enrolled'` before admission workflow is confirmed. If user aborts admission creation, lead remains falsely marked as 'Enrolled'.
- **Remediation:** Keep lead at current stage during prefill; transition to `'Enrolled'` only after admission record is committed to database.
- **Regression Test:** Initiate lead conversion and cancel admission form; verify lead stage remains at previous stage.

---

## 5. Phase 3 — P2 Medium Gaps & Operational Hardening (Sprint 3)

### G37 — Hardcoded Fallback Actor IDs in Audit Trails
- **Module / Route:** Academics & CRM (`app/(dashboard)/academics/attendance/page.tsx:147-152`, `crm/leads/page.tsx:103`)
- **Classification:** CONFIRMED DEFECT
- **Remediation:** Remove hardcoded fallback `'usr-trainer'` or `'usr-counsellor'`. Enforce active authenticated user ID.

### G38 — Missing Date/Time Picker in CRM Stage Transition Modal
- **Module / Route:** CRM / Leads (`app/(dashboard)/crm/leads/page.tsx:110-118, 447-496`)
- **Classification:** CONFIRMED DEFECT
- **Remediation:** Integrate interactive calendar date/time picker when transitioning leads to "Follow-up Scheduled" or "Demo Scheduled".

### G40 — Client-Side State Loss on Browser F5 Reload
- **Module / Route:** Platform / State Persistence (`lib/services/persistent-storage-adapter.ts:48-75, 180-234`)
- **Classification:** CONFIRMED DEFECT
- **Remediation:** Reconcile server disk persistence with browser state; ensure authoritative data hydrates from Supabase PostgreSQL rather than ephemeral localStorage.

### G41 — Unhandled Empty Course Array Crash Risks
- **Module / Route:** CRM & Academics (`app/(dashboard)/crm/leads/page.tsx:121, 123`, `academics/courses/page.tsx:120-135`)
- **Classification:** CONFIRMED DEFECT
- **Remediation:** Add defensive checks for `store.courses?.length > 0` before accessing properties. Render empty state placeholders when catalog is empty.

### G42 — Student 360 Detail Page Crash on Missing ID Parameter
- **Module / Route:** Student Operations (`app/(dashboard)/students/[id]/page.tsx:45-65`)
- **Classification:** CONFIRMED DEFECT
- **Remediation:** Catch missing/unmatched student IDs gracefully and display structured 404 alert with back navigation button.

### M02 — Missing Native Server Fallback Routes for Password Recovery
- **Module / Route:** Authentication (`app/login/page.tsx:375, 410`)
- **Classification:** MISSING REQUIREMENT
- **Remediation:** Implement server-side POST handlers for `/api/auth/update-password` and `/api/auth/recover-password`, or require JavaScript for recovery flows.

---

## 6. Phase 4 — P3 Minor Improvements & UI Polish (Sprint 4)

### G43 — Mock Event Handlers & Dead Buttons in Support and Placement
- **Module / Route:** Support & Placement (`app/(dashboard)/support/page.tsx:210-245`, `app/(dashboard)/placement/page.tsx:320-350`)
- **Classification:** OPTIONAL ENHANCEMENT / POLISH
- **Remediation:** Replace static `"Coming soon"` toasts with active modal workflows or disable unimplemented buttons with tooltip explaining availability.

### O01 — Enterprise Portal Enhancements
- **Module / Route:** Product Roadmap
- **Remediation:** Formulate product requirements for Employer Portal, AI resume matching, and third-party calendar sync in future releases.

---

## 7. Operational Risk Register (Systemic & Architectural)

| Risk ID | Severity | Category | Affected Component | Summary | Required Mitigation |
|---|---|---|---|---|---|
| **R01** | High | Concurrency | `payment-workflow-transaction.ts:29, 44` | In-memory read operations do not advance write queue; concurrent reads and writes can interleave uncommitted state. | Enforce serialized transaction queue for all operations or use request-local transactional contexts. |
| **R02** | High | Multi-Tenancy | `002_rls_policies.sql:64`, Payment Migration | Restrictive RLS policies applied to 8 financial tables only; CRM, Courses, and Placement lack strict tenant isolation. | Apply comprehensive `tenant_id = auth.jwt()->>'tenant_id'` RLS policies to all tables. |
| **R03** | High | Storage Security | `000_full_schema.sql:1253` | Resumes, receipts, and assignment storage buckets configured as public. | Convert buckets to private; enforce signed URL generation with ownership verification. |
| **R04** | Medium | Data Integrity | `academics-service.ts:599` | Batch student count updated locally without database trigger coverage. | Implement PostgreSQL trigger to maintain `enrolled_count` on `batch_students` insert/delete. |
| **R05** | Medium | Performance | `payment-workflow-transaction.ts:90` | External notification webhooks awaited synchronously within serialized queue. | Introduce asynchronous durable outbox pattern for external notifications. |
| **R06** | Critical | Deployability | `migrations/` directory | Version number collisions (`006`) and overlapping definitions between `000` and `001`. | Consolidate and sequence migrations into clean, replayable idempotent scripts. |
| **M01** | High | Financial | `fee-workflow-service.ts:1407` | Missing authenticated refund and chargeback workflow API. | Implement end-to-end refund workflow with accounts approval and ledger reversal. |

---

## 8. Remediation Governance & Sign-Off Criteria

### Gate 1: Phase 1 (P0) Sign-Off
- **Requirements:** All 15 P0 defects resolved; 100% automated negative tests pass; zero unauthenticated sensitive endpoints; zero plaintext credentials in client code.
- **Sign-off Authority:** Principal Architect & Cybersecurity Lead.

### Gate 2: Phase 2 (P1) Sign-Off
- **Requirements:** All 22 P1 defects resolved; financial ledger ACID compliance validated on disposable PostgreSQL instance; dual ledgers unified; server-side assessment scoring active.
- **Sign-off Authority:** Financial Systems Auditor & Database Architect.

### Gate 3: Phase 3 & 4 (P2/P3) Sign-Off
- **Requirements:** Zero unhandled UI exceptions; clean browser hydration on reload; all mock toasts replaced or buttons disabled.
- **Sign-off Authority:** Senior QA Automation Engineer & Frontend Lead.

### Gate 4: Production Load Certification
- **Requirements:** Independent staging environment provisioned; 100 concurrent authenticated virtual users executed via k6/Playwright; p95 latency < 450ms; zero HTTP 5xx errors; 500 registered student capacity validated.
- **Sign-off Authority:** VP of Engineering & DevOps Specialist.
