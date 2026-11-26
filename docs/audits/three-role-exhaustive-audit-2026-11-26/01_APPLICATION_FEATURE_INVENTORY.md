# 01 — Application Feature Inventory (Three-Role Audit)

**Audit Date:** 2026-11-26  
**Repository:** `E:\my erp hub\next gen lms`  
**Live Production URL:** `https://next-gen-lms-omega.vercel.app/login`  
**Staging Environment:** `http://localhost:3000` (`NEXT_PUBLIC_APP_ENV=staging`, Supabase `mzkrvvnmmjcjygwllabn.supabase.co`)  
**Strict Testing Perimeter:** Super Admin (`dilip.palukuri@gmail.com`), Admin (`niranjan.emparala@gmail.com`), Sales (`mohanreddyc.erp@gmail.com`)

---

## 1. Summary Counts (Discovered from Repository)

| Category | Count |
|---|---:|
| Application Pages (`app/**/page.tsx`) | 40 |
| API Route Files (`app/api/**/route.ts`) | 65 |
| Database Tables (`supabase/migrations/*.sql`) | 52 (49 active + 3 archive tables) |
| Database Functions | 11 |
| Database Triggers | 8 |
| RLS Policies | 131 |
| Authorized Accounts Under Test | 3 (`dilip.palukuri@gmail.com`, `niranjan.emparala@gmail.com`, `mohanreddyc.erp@gmail.com`) |

---

## 2. Discovered Pages & Modules (40 Pages)

### 2.1 Public & Entry Routes
- `/` (`app/page.tsx`) — Root redirect to `/login` (via `middleware.ts`)
- `/login` (`app/login/page.tsx`) — Login, password visibility toggle, forgot password / recovery / invite setup
- `/certificate/verify/[id]` (`app/certificate/verify/[id]/page.tsx`) — Public QR/ID certificate verification
- `/portal` (`app/portal/page.tsx`) — Student LMS Portal view
- `/todos` (`app/todos/page.tsx`) — Operational todo list

### 2.2 Dashboard, Onboarding, Support & Certificates
- `/dashboard` (`app/(dashboard)/dashboard/page.tsx`)
- `/onboarding` (`app/(dashboard)/onboarding/page.tsx`)
- `/support` (`app/(dashboard)/support/page.tsx`)
- `/certificates` (`app/(dashboard)/certificates/page.tsx`)

### 2.3 CRM, Sales, Admissions & Students
- `/crm/leads` (`app/(dashboard)/crm/leads/page.tsx`)
- `/crm/followups` (`app/(dashboard)/crm/followups/page.tsx`)
- `/admissions` (`app/(dashboard)/admissions/page.tsx`)
- `/students` (`app/(dashboard)/students/page.tsx`)
- `/students/[id]` (`app/(dashboard)/students/[id]/page.tsx`)

### 2.4 Academics & SAP Servers
- `/academics/courses` (`app/(dashboard)/academics/courses/page.tsx`)
- `/academics/batches` (`app/(dashboard)/academics/batches/page.tsx`)
- `/academics/schedule` (`app/(dashboard)/academics/schedule/page.tsx`)
- `/academics/attendance` (`app/(dashboard)/academics/attendance/page.tsx`)
- `/academics/assignments` (`app/(dashboard)/academics/assignments/page.tsx`)
- `/academics/assessments` (`app/(dashboard)/academics/assessments/page.tsx`)
- `/academics/sap-servers` (`app/(dashboard)/academics/sap-servers/page.tsx`)

### 2.5 Accounts & Finance
- `/accounts/approvals` (`app/(dashboard)/accounts/approvals/page.tsx`)
- `/accounts/dues` (`app/(dashboard)/accounts/dues/page.tsx`)
- `/accounts/fees` (`app/(dashboard)/accounts/fees/page.tsx`)
- `/accounts/installments` (`app/(dashboard)/accounts/installments/page.tsx`)
- `/accounts/payments` (`app/(dashboard)/accounts/payments/page.tsx`)
- `/accounts/receipts` (`app/(dashboard)/accounts/receipts/page.tsx`)
- `/accounts/receipts/[id]` (`app/(dashboard)/accounts/receipts/[id]/page.tsx`)
- `/accounts/invoices/[id]` (`app/(dashboard)/accounts/invoices/[id]/page.tsx`)
- `/accounts/statements/[id]` (`app/(dashboard)/accounts/statements/[id]/page.tsx`)
- `/accounts/expenses` (`app/(dashboard)/accounts/expenses/page.tsx`)
- `/accounts/vendors` (`app/(dashboard)/accounts/vendors/page.tsx`)
- `/accounts/reports` (`app/(dashboard)/accounts/reports/page.tsx`)

### 2.6 Placement, Users, Audit & Settings
- `/placement` (`app/(dashboard)/placement/page.tsx`)
- `/placement/enrollments` (`app/(dashboard)/placement/enrollments/page.tsx`)
- `/users` (`app/(dashboard)/users/page.tsx`)
- `/audit-logs` (`app/(dashboard)/audit-logs/page.tsx`)
- `/audit` (`app/(dashboard)/audit/page.tsx`)
- `/settings` (`app/(dashboard)/settings/page.tsx`)
- `/settings/audit` (`app/(dashboard)/settings/audit/page.tsx`)

---

## 3. Discovered API Endpoints (65 Route Files)
See `app/api/**/route.ts`:
- **Auth & Users:** `/api/auth/login`, `/api/auth/logout`, `/api/users`, `/api/users/reset-password`, `/api/counsellors`
- **CRM & Bulk Import:** `/api/crm/leads`, `/api/crm/history`, `/api/crm/summary`, `/api/bulk-import/template`, `/api/bulk-import/preview`, `/api/bulk-import/execute`
- **Admissions & Students:** `/api/admissions`, `/api/admissions/[id]`, `/api/students`, `/api/students/[id]`, `/api/students/photo`
- **Fees, Payments, Invoices, Receipts & Vendors:** `/api/fees/proposals`, `/api/fees/payments`, `/api/fees/proof`, `/api/fees/dues`, `/api/fees/upcoming-dues`, `/api/fees/receipts`, `/api/fees/reconcile`, `/api/fees/statements/[id]`, `/api/invoices/[id]`, `/api/invoices/[id]/pdf`, `/api/receipts/[id]/pdf`, `/api/payments/create-order`, `/api/payments/verify`, `/api/vendors` (+ legacy stubs `/api/fees/invoices/[id]/pdf`, `/api/fees/receipts/[id]/pdf`)
- **Onboarding, Placement, Academics & Certificates:** `/api/onboarding/cases`, `/api/onboarding/cases/[id]`, `/api/onboarding/analytics`, `/api/onboarding/backfill`, `/api/placement/jobs`, `/api/placement/enrollments`, `/api/placement/enrollments/override`, `/api/placement/applications`, `/api/quizzes/submit`, `/api/conference/create-meeting`, `/api/attendance/sync-meeting`, `/api/certificates/[id]/pdf`
- **Platform, Storage, Realtime & Webhooks:** `/api/dashboard/metrics`, `/api/settings`, `/api/settings/bank-accounts`, `/api/audit-logs`, `/api/admin/integrity-monitor`, `/api/database/health`, `/api/database/sync`, `/api/database/backup`, `/api/upload`, `/api/storage/signed-url`, `/api/storage/signed`, `/api/realtime/stream`, `/api/realtime/broadcast`, `/api/webhooks/razorpay`, `/api/webhooks/telecrm`, `/api/webhooks/zoom`, `/api/webhooks/google-meet`

---

## 4. Discovered Database Objects (from `supabase/migrations`)
- **Tables (49 active + 3 archive):** `admission_sequences`, `admissions`, `assignment_submissions`, `assignments`, `attendance_records`, `audit_logs`, `bank_account_presets`, `batch_students`, `batch_transfer_audits`, `batches`, `certificates`, `class_sessions`, `course_modules`, `courses`, `crm_team_members`, `crm_teams`, `doubt_messages`, `expenses`, `fee_workflow_state`, `idempotency_keys`, `installments`, `job_applications`, `job_openings`, `lead_followups`, `leads`, `lesson_progress`, `lessons`, `notifications`, `onboarding_audit_logs`, `onboarding_cases`, `payments`, `placement_eligibility_settings`, `placement_enrollment_status_histories`, `placement_enrollments`, `placement_profiles`, `profiles`, `quiz_attempts`, `quiz_questions`, `quizzes`, `receipts`, `sap_server_allocations`, `sap_server_systems`, `student_doubts`, `student_fee_accounts`, `student_lms_access`, `students`, `system_settings`, `todos`, `vendors` (+ `_backup_placement_*_archive`).
- **Functions (11):** `allocate_admission_number`, `commit_fee_workflow`, `crm_private`, `generate_next_student_unique_id`, `get_current_user_role`, `get_current_user_tenant_id`, `protect_profile_authority`, `settle_expense_atomic`, `sync_doubt_assigned_fields`, `sync_job_openings_compat_columns`, `sync_notification_links`.
- **Triggers (8):** `admission_lead_access`, `crm_profile_authority`, `protect_lead_creator`, `protect_profile_authority`, `trg_sync_doubt_assigned_fields`, `trg_sync_job_openings_compat`, `trg_sync_lead_canonical_phone`, `trg_sync_notification_links`.
- **RLS Policies:** 131 policies defined across migrations.
