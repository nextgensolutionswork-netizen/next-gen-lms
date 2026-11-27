# 🎭 LIVE ROLE-WISE QA AUDIT REPORT

**Project:** Next-Gen ERP LMS & CRM  
**Date:** 27 November 2026  
**Auditor / Taskforce:** Antigravity AI Engineering Taskforce  
**Testing Methodology:** Live Persona-Based Role Testing & Automated Behavioral Scenarios  
**Scope:** 8 Operational Roles across CRM, Admissions, Finance, Onboarding, Academics, Placement, and Student Self-Service  

---

## 1. Role Testing Matrix & Summary of Coverage

Every system persona was evaluated against authorized business actions (positive testing), prohibited cross-role boundaries (negative testing), and edge conditions (boundary testing):

| Role ID | Role Persona | Primary Responsibilities | Tested Endpoints & Desks | Key Invariants Enforced | QA Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **ROLE-01** | **Super Admin** | Full system oversight, security, audit telemetry | `/dashboard`, `/users`, `/settings`, `/audit`, `/accounts/*` | Unrestricted read/write; receipt deletion permitted | ✅ PASS |
| **ROLE-02** | **Admin** | Campus operations, staff management, batch creation | `/dashboard`, `/users`, `/academics/batches`, `/onboarding` | Operational admin; receipt deletion restricted | ✅ PASS |
| **ROLE-03** | **Accountant** | Fee approvals, invoice generation, expense management | `/accounts/approvals`, `/accounts/fees`, `/accounts/expenses` | Approves fees; cannot alter onboarding checklists | ✅ PASS |
| **ROLE-04** | **Counsellor / Lead** | Lead conversion, admission intake, payment submission | `/crm/leads`, `/crm/followups`, `/admissions` | Submits payments; **strictly cannot approve fees** | ✅ PASS |
| **ROLE-05** | **Trainer** | Course syllabi, student attendance, assignment reviews | `/academics/courses`, `/academics/attendance`, `/academics/batches` | Academic delivery; no access to student fee records | ✅ PASS |
| **ROLE-06** | **Placement Coordinator** | Job drives, interview scheduling, placement tracking | `/placement`, `/placement/enrollments`, `/students` | Placement operations; resumes accessible; fees blocked | ✅ PASS |
| **ROLE-07** | **Academic Support** | Student doubt resolution, 1-on-1 mentorship calls | `/support`, `/academics/schedule`, `/students` | Academic support; no access to institute financial ledgers | ✅ PASS |
| **ROLE-08** | **Student** | Self-service LMS, quiz attempts, fee receipts | `/portal`, `/quizzes/submit`, `/storage/signed` | Tenant-scoped access; **blocked until onboarded** | ✅ PASS |

---

## 2. In-Depth Role Testing Breakdown

### 2.1 Role 01 & 02: Super Admin & Admin
- **Positive Scenarios Tested:**
  - Access to global settings (`/settings`) and system user management (`/users`).
  - Access to audit logs (`/audit` and `/api/audit`). Returns genuine telemetry without fabricated mock history (`tests/super-admin-bug-sa-05.test.ts`).
  - Accurate calculation of student fee balances without hardcoded values (`tests/super-admin-bug-sa-03.test.ts`).
- **Boundary & Negative Scenarios Tested:**
  - Admin cannot bypass multi-tenant isolation boundaries.
  - Attempted role escalation via unverified session cookies is strictly rejected with HTTP 401/403.

### 2.2 Role 03: Accountant
- **Positive Scenarios Tested:**
  - Payment approval queue (`/accounts/approvals`): Accountant verifies pending payments submitted by Counsellors.
  - Verification transition: Changes payment status from `pending` to `verified`, increments student fee account `paid_amount`, and issues authoritative receipt (`REC-YYYY-XXXX`).
  - Invoice and statement PDF generation (`tests/student-fee-statement-api.test.ts`).
- **Negative Scenarios Tested:**
  - Rejection of conflicting duplicate approvals: Second approval on already verified payment is rejected with HTTP 409 Conflict.
  - Double-action prevention: Reconciled transactions cannot be approved twice.

### 2.3 Role 04: Counsellor & Counsellor Lead
- **Positive Scenarios Tested:**
  - Lead creation and updates (`/crm/leads`): Handles lead capture, phone deduplication, and follow-up logging.
  - Student registration (`/admissions`): Submits new student admissions with structured course assignments.
  - Payment submission: Submits UPI/Cash payment requests with required transaction references and `idempotency_key`.
- **Negative Scenarios Tested (Separation of Duties):**
  - **Self-Approval Block:** Counsellor attempting `POST /api/fees/payments` with status `verified` is forced to `pending` or rejected with HTTP 403 Forbidden.
  - **Voiding/Deleting Receipts:** Counsellor cannot delete receipts or alter financial ledger totals.
  - **Invalid UPI Payload:** Submitting empty transaction references or invalid dates is rejected with HTTP 400 Bad Request (`tests/counsellor-role-3-regression.test.ts`).

### 2.4 Role 05: Trainer
- **Positive Scenarios Tested (70 Scenarios in `tests/trainer-70-scenarios.test.ts`):**
  - Marking student attendance for assigned batches.
  - Reviewing student assignments and recording quiz performance.
  - Updating batch syllabus coverage percentages.
- **Negative Scenarios Tested:**
  - Trainer accessing `/accounts/approvals` or `/accounts/fees`: Redirected with HTTP 307 to login or dashboard.
  - Trainer attempting to view financial fee dues: Denied by API route authorization.

### 2.5 Role 06 & 07: Placement Coordinator & Academic Support
- **Positive Scenarios Tested:**
  - Placement drive posting and student application tracking (`tests/placement-80-scenarios.test.ts`).
  - Academic support ticket resolution and shift handover (`tests/support-faculty-role-7-integrity.test.ts`).
- **Negative Scenarios Tested:**
  - Placement staff cannot alter batch schedules or modify student enrollment fees.

### 2.6 Role 08: Student
- **Positive Scenarios Tested (80 Scenarios in `tests/student-role-8-80-scenarios.test.ts`):**
  - Student logs into `/portal` after 6-step onboarding activation.
  - Views enrolled courses, batch timetable, and SAP server access credentials.
  - Submits quizzes and views immediate scoring feedback.
  - Generates and downloads fee receipts and statements via secure signed URLs.
- **Negative Scenarios Tested:**
  - **Unprovisioned Student Lockout:** Student with pending onboarding verification is blocked from `/portal` (`tests/onboarding.test.ts`).
  - **Cross-Student IDOR Block:** Student `stu-01` attempting to access `/students/stu-02` or `/api/students/stu-02` is rejected with HTTP 403 Forbidden.
  - **Storage Tampering:** Student attempting to overwrite or delete receipts or other student files is rejected by Supabase storage RLS.

---

## 3. QA Conclusion

All 8 roles strictly conform to their specified business boundaries, separation-of-duties policies, and tenant isolation requirements. Live role-wise QA has PASSED across all modules.
