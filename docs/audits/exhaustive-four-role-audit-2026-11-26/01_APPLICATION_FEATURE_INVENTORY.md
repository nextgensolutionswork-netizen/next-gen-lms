# 01 — Application Feature Inventory

**Audit Date:** 2026-11-26  
**Repository:** `E:\my erp hub\next gen lms`  
**Production URL:** `https://next-gen-lms-omega.vercel.app/login`  
**Staging Environment:** `http://localhost:3000` (`NEXT_PUBLIC_APP_ENV=staging`, Supabase `mzkrvvnmmjcjygwllabn.supabase.co`)  

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
| Strict Login Roles Under Test | 4 (`super_admin`, `admin`, `counsellor`, `accountant`) |

---

## 2. Discovered Pages & Modules (40 Pages)

### 2.1 Public & Entry Routes
| Feature ID | Route | Page File | Description |
|---|---|---|---|
| FEAT-PUB-001 | `/` | `app/page.tsx` | Root redirect to `/login` (via `middleware.ts`) |
| FEAT-PUB-002 | `/login` | `app/login/page.tsx` | Authentication, password visibility, recovery/invite/forgot-password |
| FEAT-PUB-003 | `/certificate/verify/[id]` | `app/certificate/verify/[id]/page.tsx` | Public QR/ID certificate verification |
| FEAT-PUB-004 | `/portal` | `app/portal/page.tsx` | Student LMS Portal preview/switch |
| FEAT-PUB-005 | `/todos` | `app/todos/page.tsx` | Personal / operational todo list |

### 2.2 Dashboard & Core Operations
| Feature ID | Route | Page File | Accessible Roles (from `sidebar.tsx`) |
|---|---|---|---|
| FEAT-DASH-001 | `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | `super_admin`, `admin`, `counsellor`, `accountant` |
| FEAT-ONB-001 | `/onboarding` | `app/(dashboard)/onboarding/page.tsx` | `super_admin`, `admin` (plus `onboarding_team` out of scope) |
| FEAT-SUP-001 | `/support` | `app/(dashboard)/support/page.tsx` | `super_admin`, `admin` |
| FEAT-CERT-001 | `/certificates` | `app/(dashboard)/certificates/page.tsx` | `super_admin`, `admin`, `counsellor`, `accountant` |

### 2.3 CRM & Admissions
| Feature ID | Route | Page File | Accessible Roles |
|---|---|---|---|
| FEAT-CRM-001 | `/crm/leads` | `app/(dashboard)/crm/leads/page.tsx` | `super_admin`, `admin`, `counsellor` |
| FEAT-CRM-002 | `/crm/followups` | `app/(dashboard)/crm/followups/page.tsx` | `super_admin`, `admin`, `counsellor` |
| FEAT-ADM-001 | `/admissions` | `app/(dashboard)/admissions/page.tsx` | `super_admin`, `admin`, `counsellor`, `accountant` |
| FEAT-STU-001 | `/students` | `app/(dashboard)/students/page.tsx` | `super_admin`, `admin`, `counsellor`, `accountant` |
| FEAT-STU-002 | `/students/[id]` | `app/(dashboard)/students/[id]/page.tsx` | `super_admin`, `admin`, `counsellor`, `accountant` |

### 2.4 Academics & LMS
| Feature ID | Route | Page File | Accessible Roles |
|---|---|---|---|
| FEAT-ACAD-001 | `/academics/courses` | `app/(dashboard)/academics/courses/page.tsx` | `super_admin`, `admin` |
| FEAT-ACAD-002 | `/academics/batches` | `app/(dashboard)/academics/batches/page.tsx` | `super_admin`, `admin` |
| FEAT-ACAD-003 | `/academics/schedule` | `app/(dashboard)/academics/schedule/page.tsx` | `super_admin`, `admin` |
| FEAT-ACAD-004 | `/academics/attendance` | `app/(dashboard)/academics/attendance/page.tsx` | `super_admin`, `admin` |
| FEAT-ACAD-005 | `/academics/assignments` | `app/(dashboard)/academics/assignments/page.tsx` | `super_admin`, `admin` |
| FEAT-ACAD-006 | `/academics/assessments` | `app/(dashboard)/academics/assessments/page.tsx` | `super_admin`, `admin` |
| FEAT-SAP-001 | `/academics/sap-servers` | `app/(dashboard)/academics/sap-servers/page.tsx` | `super_admin`, `admin` |

### 2.5 Accounts & Finance
| Feature ID | Route | Page File | Accessible Roles |
|---|---|---|---|
| FEAT-FIN-001 | `/accounts/approvals` | `app/(dashboard)/accounts/approvals/page.tsx` | `super_admin`, `admin`, `accountant` |
| FEAT-FIN-002 | `/accounts/dues` | `app/(dashboard)/accounts/dues/page.tsx` | `super_admin`, `admin`, `accountant`, `counsellor` |
| FEAT-FIN-003 | `/accounts/fees` | `app/(dashboard)/accounts/fees/page.tsx` | `super_admin`, `admin`, `accountant`, `counsellor` |
| FEAT-FIN-004 | `/accounts/installments` | `app/(dashboard)/accounts/installments/page.tsx` | `super_admin`, `admin`, `accountant`, `counsellor` |
| FEAT-FIN-005 | `/accounts/payments` | `app/(dashboard)/accounts/payments/page.tsx` | `super_admin`, `admin`, `accountant`, `counsellor` |
| FEAT-FIN-006 | `/accounts/receipts` | `app/(dashboard)/accounts/receipts/page.tsx` | `super_admin`, `admin`, `accountant`, `counsellor` |
| FEAT-FIN-007 | `/accounts/receipts/[id]` | `app/(dashboard)/accounts/receipts/[id]/page.tsx` | `super_admin`, `admin`, `accountant`, `counsellor` |
| FEAT-FIN-008 | `/accounts/invoices/[id]` | `app/(dashboard)/accounts/invoices/[id]/page.tsx` | `super_admin`, `admin`, `accountant`, `counsellor` |
| FEAT-FIN-009 | `/accounts/statements/[id]` | `app/(dashboard)/accounts/statements/[id]/page.tsx` | `super_admin`, `admin`, `accountant`, `counsellor` |
| FEAT-FIN-010 | `/accounts/expenses` | `app/(dashboard)/accounts/expenses/page.tsx` | `super_admin`, `admin`, `accountant` |
| FEAT-FIN-011 | `/accounts/vendors` | `app/(dashboard)/accounts/vendors/page.tsx` | `super_admin`, `admin`, `accountant` |
| FEAT-FIN-012 | `/accounts/reports` | `app/(dashboard)/accounts/reports/page.tsx` | `super_admin`, `admin`, `accountant` |

### 2.6 Placement Support
| Feature ID | Route | Page File | Accessible Roles |
|---|---|---|---|
| FEAT-PLC-001 | `/placement` | `app/(dashboard)/placement/page.tsx` | `super_admin`, `admin` |
| FEAT-PLC-002 | `/placement/enrollments` | `app/(dashboard)/placement/enrollments/page.tsx` | `super_admin`, `admin` |

### 2.7 Administration, Audit & Settings
| Feature ID | Route | Page File | Accessible Roles |
|---|---|---|---|
| FEAT-USR-001 | `/users` | `app/(dashboard)/users/page.tsx` | `super_admin`, `admin` |
| FEAT-AUD-001 | `/audit-logs` | `app/(dashboard)/audit-logs/page.tsx` | `super_admin` |
| FEAT-AUD-002 | `/audit` | `app/(dashboard)/audit/page.tsx` | `super_admin`, `admin` |
| FEAT-SET-001 | `/settings` | `app/(dashboard)/settings/page.tsx` | `super_admin`, `admin` |
| FEAT-SET-002 | `/settings/audit` | `app/(dashboard)/settings/audit/page.tsx` | `super_admin`, `admin` |

---

## 3. Discovered API Endpoints (65 Route Files)

### 3.1 Authentication & Users
- `POST /api/auth/login`
- `POST|GET /api/auth/logout`
- `GET|POST|PATCH /api/users`
- `POST /api/users/reset-password`
- `GET /api/counsellors`

### 3.2 CRM & Bulk Import
- `GET|POST|PATCH|DELETE /api/crm/leads`
- `GET /api/crm/history`
- `GET /api/crm/summary`
- `GET /api/bulk-import/template` *(no auth guard detected in route)*
- `POST /api/bulk-import/preview` *(no auth guard detected in route)*
- `POST /api/bulk-import/execute`

### 3.3 Admissions & Students
- `GET|POST /api/admissions`
- `GET /api/admissions/[id]`
- `GET /api/students`
- `GET /api/students/[id]`
- `GET|POST /api/students/photo`

### 3.4 Fees, Payments, Invoices, Receipts & Vendors
- `POST /api/fees/proposals`
- `GET|POST /api/fees/payments`
- `GET|POST /api/fees/proof`
- `GET /api/fees/dues`
- `GET /api/fees/upcoming-dues`
- `GET /api/fees/receipts`
- `GET /api/fees/reconcile`
- `GET /api/fees/statements/[id]`
- `GET /api/invoices/[id]`
- `GET /api/invoices/[id]/pdf`
- `GET /api/receipts/[id]/pdf`
- `POST /api/payments/create-order` *(no auth guard detected in route)*
- `POST /api/payments/verify`
- `GET|POST /api/vendors`
- *(Legacy/empty stubs: `/api/fees/invoices/[id]/pdf`, `/api/fees/receipts/[id]/pdf`)*

### 3.5 Onboarding, Placement, Academics & Certificates
- `GET|POST /api/onboarding/cases`
- `GET|PATCH /api/onboarding/cases/[id]`
- `GET /api/onboarding/analytics`
- `POST /api/onboarding/backfill`
- `GET|POST|PATCH|DELETE /api/placement/jobs`
- `GET|POST|PATCH /api/placement/enrollments`
- `POST /api/placement/enrollments/override`
- `GET|POST|PATCH|DELETE /api/placement/applications`
- `POST /api/quizzes/submit`
- `POST /api/conference/create-meeting` *(no auth guard detected in route)*
- `GET|POST /api/attendance/sync-meeting` *(no auth guard detected in route)*
- `GET /api/certificates/[id]/pdf` *(public/unauthenticated PDF endpoint)*

### 3.6 Dashboard, Settings, Storage, Database, Realtime & Webhooks
- `GET /api/dashboard/metrics`
- `GET|POST /api/settings`
- `GET|POST /api/settings/bank-accounts`
- `GET|POST /api/audit-logs`
- `GET|POST /api/admin/integrity-monitor`
- `GET /api/database/health` *(no auth guard detected in route)*
- `POST /api/database/sync`
- `GET|POST /api/database/backup`
- `POST /api/upload`
- `GET|POST /api/storage/signed-url`
- `GET /api/storage/signed` *(signature-verified)*
- `GET /api/realtime/stream`
- `POST /api/realtime/broadcast`
- `POST /api/webhooks/razorpay`
- `POST|GET /api/webhooks/telecrm`
- `POST /api/webhooks/zoom`
- `POST /api/webhooks/google-meet`

---

## 4. Discovered Database Objects (from `supabase/migrations`)

- **Tables (49 active + 3 archive):** `admission_sequences`, `admissions`, `assignment_submissions`, `assignments`, `attendance_records`, `audit_logs`, `bank_account_presets`, `batch_students`, `batch_transfer_audits`, `batches`, `certificates`, `class_sessions`, `course_modules`, `courses`, `crm_team_members`, `crm_teams`, `doubt_messages`, `expenses`, `fee_workflow_state`, `idempotency_keys`, `installments`, `job_applications`, `job_openings`, `lead_followups`, `leads`, `lesson_progress`, `lessons`, `notifications`, `onboarding_audit_logs`, `onboarding_cases`, `payments`, `placement_eligibility_settings`, `placement_enrollment_status_histories`, `placement_enrollments`, `placement_profiles`, `profiles`, `quiz_attempts`, `quiz_questions`, `quizzes`, `receipts`, `sap_server_allocations`, `sap_server_systems`, `student_doubts`, `student_fee_accounts`, `student_lms_access`, `students`, `system_settings`, `todos`, `vendors` (+ `_backup_placement_*_archive`).
- **Functions (11):** `allocate_admission_number`, `commit_fee_workflow`, `crm_private`, `generate_next_student_unique_id`, `get_current_user_role`, `get_current_user_tenant_id`, `protect_profile_authority`, `settle_expense_atomic`, `sync_doubt_assigned_fields`, `sync_job_openings_compat_columns`, `sync_notification_links`.
- **Triggers (8):** `admission_lead_access`, `crm_profile_authority`, `protect_lead_creator`, `protect_profile_authority`, `trg_sync_doubt_assigned_fields`, `trg_sync_job_openings_compat`, `trg_sync_lead_canonical_phone`, `trg_sync_notification_links`.
- **RLS Policies:** 131 policies defined across migrations.
