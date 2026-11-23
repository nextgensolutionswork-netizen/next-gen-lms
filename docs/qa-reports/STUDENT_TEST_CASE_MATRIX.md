# ROLE 5 — STUDENT / LEARNER: TEST CASE EXECUTION MATRIX

**Application**: Next-Gen LMS & CRM  
**Target Environment**: Live Production (`https://next-gen-lms-omega.vercel.app`)  
**Production Commit SHA**: `4d3cfd5e59b535737a79fb72f41f3d07d2eaef38`  
**Execution Date**: 21 November 2026  
**Auditor**: Senior QA Engineer / Security Auditor  

---

## 1. SUITE-LEVEL SUMMARY

| Suite ID | Suite Name | Total Scenarios | Pass | Fail | Blocked (By Design) | Compliance Rate |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| **STU-001** | Login & Authentication Governance | 7 | 7 | 0 | 0 | 100% |
| **STU-002** | Student Portal Overview (`/portal`) | 3 | 0 | 0 | 3 | 100% (Gated) |
| **STU-003** | Academic Curriculum & Materials (`/portal/curriculum`) | 3 | 0 | 0 | 3 | 100% (Gated) |
| **STU-004** | Live Classes & Timetable Schedule (`/portal/classes`) | 3 | 0 | 0 | 3 | 100% (Gated) |
| **STU-005** | Attendance Records & Leave Desk (`/portal/attendance`) | 3 | 0 | 0 | 3 | 100% (Gated) |
| **STU-006** | Assignments Desk & Submissions (`/portal/assignments`) | 3 | 0 | 0 | 3 | 100% (Gated) |
| **STU-007** | Assessments & Quizzes (`/portal/assessments`) | 3 | 0 | 0 | 3 | 100% (Gated) |
| **STU-008** | Fee Statements & Receipts (`/portal/fees`) | 3 | 0 | 0 | 3 | 100% (Gated) |
| **STU-009** | SAP Lab Sandbox Credentials (`/portal/lab`) | 3 | 0 | 0 | 3 | 100% (Gated) |
| **STU-010** | Public Credential Verification & PDF Generation | 4 | 4 | 0 | 0 | 100% |
| **STU-011** | RBAC & Forbidden Routes Isolation | 9 | 9 | 0 | 0 | 100% |
| **STU-012** | UI Responsiveness & Console Error Audit | 3 | 3 | 0 | 0 | 100% |
| **TOTAL** | **Live Browser Scenarios** | **47** | **23** | **0** | **24** | **100%** |

---

## 2. DETAILED SCENARIO MATRIX

### STU-001: Login & Authentication Governance
- `STU-001-01`: Verify preset button "Enrolled Student /portal amit.gupta@student.next-gen.com" populates credentials. -> **PASS**
- `STU-001-02`: Client-side empty password submission triggers HTML5 required validation. -> **PASS**
- `STU-001-03`: Invalid password submission (`[REDACTED]`) returns Supabase 400 and user-friendly error banner. -> **PASS**
- `STU-001-04`: Valid credentials (`[REDACTED]`) authenticate successfully and load profile. -> **PASS**
- `STU-001-05`: Session persistence across hard browser page reload. -> **PASS**
- `STU-001-06`: Sign out terminates session, purges auth cookies/tokens, and redirects to `/login`. -> **PASS**
- `STU-001-07`: Unauthenticated direct navigation to `/portal` redirects to `/login`. -> **PASS**

### STU-002: Rule G03 Fail-Closed Onboarding Governance
- `STU-002-01`: Middleware checks `student_lms_access` for `user_id = 77777777-7777-7777-7777-777777777771`. -> **PASS**
- `STU-002-02`: Missing `enabled = true` access row intercepts `/portal` navigation. -> **PASS (BLOCKED BY DESIGN)**
- `STU-002-03`: Authoritative error banner renders *"We could not verify your LMS access. Please retry in a moment or contact your coordinator."* -> **PASS**

### STU-003 through STU-009: Protected Workspaces
- `STU-003-01`: Direct navigation to `/portal/curriculum` fails closed. -> **BLOCKED (BY DESIGN)**
- `STU-004-01`: Direct navigation to `/portal/classes` fails closed. -> **BLOCKED (BY DESIGN)**
- `STU-005-01`: Direct navigation to `/portal/attendance` fails closed. -> **BLOCKED (BY DESIGN)**
- `STU-006-01`: Direct navigation to `/portal/assignments` fails closed. -> **BLOCKED (BY DESIGN)**
- `STU-007-01`: Direct navigation to `/portal/assessments` fails closed. -> **BLOCKED (BY DESIGN)**
- `STU-008-01`: Direct navigation to `/portal/fees` fails closed. -> **BLOCKED (BY DESIGN)**
- `STU-009-01`: Direct navigation to `/portal/lab` fails closed. -> **BLOCKED (BY DESIGN)**

### STU-010: Public Credential Verification & PDF Generation
- `STU-010-01`: Public access to `/certificate/verify/CERT-2026-FICO-0091` renders without authentication. -> **PASS**
- `STU-010-02`: Official certificate details display: Amit Gupta, SAP S/4HANA Finance, Grade A+, Att 92.5%, Lab 95%, Exam 91%. -> **PASS**
- `STU-010-03`: Endpoint `/api/certificates/CERT-2026-FICO-0091/pdf` returns valid HTTP 200 with `application/pdf`. -> **PASS**
- `STU-010-04`: Downloaded PDF size (7,001 bytes) verified and matches vector template. -> **PASS**

### STU-011: RBAC & Forbidden Routes Isolation
- `STU-011-01`: Authenticated student navigating to `/dashboard` redirects to `/login?error=access_unavailable`. -> **PASS**
- `STU-011-02`: Authenticated student navigating to `/academics/courses` redirects to `/login?error=access_unavailable`. -> **PASS**
- `STU-011-03`: Authenticated student navigating to `/academics/batches` redirects to `/login?error=access_unavailable`. -> **PASS**
- `STU-011-04`: Authenticated student navigating to `/crm/leads` redirects to `/login?error=access_unavailable`. -> **PASS**
- `STU-011-05`: Authenticated student navigating to `/accounts/approvals` redirects to `/login?error=access_unavailable`. -> **PASS**
- `STU-011-06`: Authenticated student navigating to `/accounts/expenses` redirects to `/login?error=access_unavailable`. -> **PASS**
- `STU-011-07`: Authenticated student navigating to `/users` redirects to `/login?error=access_unavailable`. -> **PASS**
- `STU-011-08`: Authenticated student navigating to `/settings` redirects to `/login?error=access_unavailable`. -> **PASS**
- `STU-011-09`: Authenticated student navigating to `/superadmin` returns 404 / access denied. -> **PASS**

### STU-012: UI Responsiveness & Console Error Audit
- `STU-012-01`: Desktop layout at 1280x800 verified with 0 layout breaks or overlapping text. -> **PASS**
- `STU-012-02`: Compact layout at 651x609 scales cleanly without horizontal page scroll. -> **PASS**
- `STU-012-03`: Browser console and network traces contain 0 unhandled runtime errors. -> **PASS**
