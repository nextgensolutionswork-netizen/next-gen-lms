# 🔐 ROLE-WISE PERMISSION MATRIX

**Project:** Next-Gen ERP LMS & CRM  
**Date of Audit:** 27 November 2026  
**Auditor:** Antigravity AI Engineering Taskforce  
**Target Roles:** 8 System Roles (Super Admin, Admin, Accountant, Counsellor, Trainer, Placement Coordinator, Academic Support, Student)  

---

## 1. UI Navigation & Page-Level Route Permissions

Permissions enforced by Next.js `middleware.ts` and `lib/auth/rbac.ts`:

| Route Path | Description | Super Admin | Admin | Accountant | Counsellor | Trainer | Placement | Support | Student |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `/dashboard` | Director / Operations Analytics | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/crm/leads` | Lead Management & Pipelines | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/crm/followups` | Due Follow-ups & Calling Desk | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/admissions` | Student Admission Registration | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/accounts/fees` | Fee Structures & Accounts | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/accounts/dues` | Installment Due Dates Calendar | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/accounts/approvals` | Payment Verification Desk | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 403 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/accounts/expenses` | Institute Expense Ledger | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 403 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/accounts/vendors` | Vendor Database & Invoices | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 403 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/accounts/reports` | Financial & Tax Reports | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 403 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/academics/batches` | Batch Roster & Schedules | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🟢 ALLOW | 🔴 307 | 🟢 ALLOW | 🔴 307 |
| `/academics/courses` | Course Curriculum & Syllabi | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🟢 ALLOW | 🔴 307 | 🟢 ALLOW | 🔴 307 |
| `/academics/attendance`| Class Attendance Register | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🟢 ALLOW | 🔴 307 | 🟢 ALLOW | 🔴 307 |
| `/academics/schedule` | Timetable & Session Calendar | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🟢 ALLOW | 🔴 307 | 🟢 ALLOW | 🔴 307 |
| `/academics/sap-servers`| SAP Server Lab Allocations | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/onboarding` | 6-Step Onboarding Pipeline | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/placement` | Jobs, Applications, Interviews | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🟢 ALLOW | 🔴 307 | 🔴 307 |
| `/students` | Student 360 Master Directory | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 |
| `/students/[id]` | Comprehensive Student Profile | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🟢 ALLOW | 🔴 403* |
| `/portal` | LMS Student Self-Service | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🟢 ALLOW |
| `/support` | Academic Doubts & Mentorship | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🟢 ALLOW | 🔴 307 | 🟢 ALLOW | 🔴 307 |
| `/users` | Staff Directory & Roles | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/settings` | Global System Configurations | 🟢 ALLOW | 🟢 ALLOW | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 | 🔴 307 |
| `/audit` / `/audit-logs`| Audit Telemetry Log Viewer | 🟢 ALLOW | 🟢 ALLOW | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |

*\*Note: A student accessing `/students/[id]` receives HTTP 403 if trying to view another student's profile. Students access their own details exclusively via `/portal`.*

---

## 2. API Endpoint Operations Matrix

| Endpoint | Operation | Super Admin | Admin | Accountant | Counsellor | Trainer | Placement | Support | Student |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `POST /api/auth/login` | Session Login | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| `POST /api/auth/logout` | Session Logout | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| `GET /api/crm/leads` | Read Leads | 🟢 | 🟢 | 🔴 403 | 🟢 (Scoped) | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `POST /api/crm/leads` | Create Lead | 🟢 | 🟢 | 🔴 403 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `POST /api/admissions` | Submit Admission | 🟢 | 🟢 | 🔴 403 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `POST /api/fees/payments` | Record Payment | 🟢 | 🟢 | 🟢 | 🟢 (Pending) | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `POST /api/fees/payments` | Approve Payment | 🟢 | 🟢 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `POST /api/fees/payments` | Reject Payment | 🟢 | 🟢 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `POST /api/fees/payments` | Void Receipt | 🟢 | 🟢 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `GET /api/fees/dues` | Read Dues | 🟢 | 🟢 | 🟢 | 🟢 (Masked) | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `GET /api/audit-logs` | Read Audit Logs | 🟢 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `POST /api/audit-logs` | Ingest Telemetry | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🔴 403 |
| `GET /api/onboarding/cases` | List Cases | 🟢 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `PATCH /api/onboarding/cases/[id]`| Update Case | 🟢 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |
| `POST /api/placement/jobs` | Post Job Drive | 🟢 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🟢 | 🔴 403 | 🔴 403 |
| `POST /api/placement/applications` | Apply for Job | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🟢 |
| `GET /api/students/[id]` | Student 360 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 (Self Only)|
| `POST /api/users/reset-password` | Admin Reset | 🟢 | 🟢 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 | 🔴 403 |

---

## 3. Separation of Duties Compliance Proof

The following Separation of Duties (SoD) invariants were verified via automated tests:
1. **No Financial Self-Approval:**
   A staff member who records a payment (`recorded_by === actor.id`) cannot approve that payment. Attempting to do so returns **HTTP 403 Forbidden** (`tests/counsellor-role-3-regression.test.ts:458`).
2. **Sales Cannot Access Expenses or Bank Accounts:**
   Counsellor requests to `/accounts/expenses` or `/accounts/vendors` return **HTTP 403 Forbidden** (`tests/counsellor-role-3-regression.test.ts:176`).
3. **Student Profile Ownership Boundary:**
   Student `amit.gupta` accessing `stu-02` receives **HTTP 403 Forbidden** (`tests/counsellor-role-3-regression.test.ts:118`).
4. **Tenant Isolation:**
   Cross-tenant lookups and mutations return **HTTP 403 Forbidden** across all tested endpoints.
