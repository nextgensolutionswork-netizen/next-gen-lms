# ROLE 5 — STUDENT / LEARNER: PRODUCTION BUG & DEFECT REGISTER

**Application**: Next-Gen LMS & CRM  
**Target Environment**: Live Production (`https://next-gen-lms-omega.vercel.app`)  
**Production Commit SHA**: `4d3cfd5e59b535737a79fb72f41f3d07d2eaef38`  
**Audit Date**: 21 November 2026  
**Auditor**: Lead Security & Full-Stack QA Engineer  

---

## 1. DEFECT CLASSIFICATION MATRIX

| Defect ID | Component | Severity | Description | Status | Target Fix |
|---|---|:---:|---|:---:|---|
| **BUG-TR-001** | Trainer Batch Roster | High | Batch roster query failure when searching student IDs across disparate UUID formats. | **Resolved Locally** (`bff98d4`) | Pending Production Deployment |
| **DEF-STU-001** | Student LMS Access Gate | Operational / Low | Student Amit Gupta is blocked from `/portal` due to missing active row in `student_lms_access`. | **By Design (Rule G03)** | Institutional Onboarding Action |

---

## 2. DETAILED DEFECT ANALYSIS

### BUG-TR-001: Trainer Batch Roster Student ID Mismatch
- **Module**: Trainer Batch Management (`/academics/batches/[id]`)
- **Root Cause**: The roster component queried `students` where `user_id` was expected to be a string or foreign key, but legacy test data or mock records held inconsistent formats.
- **Remediation**: Implemented in commit `bff98d4` on branch `fix/bug-tr-001-trainer-batch-roster-uuid`.
- **Production Status**: Currently, production commit is `4d3cfd5e59b535737a79fb72f41f3d07d2eaef38`. The fix `bff98d4` has **not yet been deployed to production**. It remains safe and non-breaking for other roles.

### DEF-STU-001: Student Access Fail-Closed Under Rule G03
- **Module**: Next.js Edge Middleware (`middleware.ts:198-207`)
- **Behavior**: When an authenticated student navigates to `/portal`, the middleware performs a lookup against `student_lms_access` table:
  ```typescript
  const { data: access, error: accessError } = await supabase
    .from('student_lms_access')
    .select('enabled')
    .eq('user_id', userId)
    .maybeSingle();
  ```
- **Analysis**:
  - In production Supabase (`tgohtdzwehhjfahtgovq`), Amit Gupta's user record exists in `auth.users` and `students`, but no row exists with `user_id = 77777777-7777-7777-7777-777777777771` and `enabled = true` in `student_lms_access`.
  - The middleware properly intercepts the request and issues a redirect to `/login?error=access_unavailable`.
- **Verdict**: Not a software defect, but intentional institutional fail-closed security. It ensures that students who have not completed academic onboarding or fee clearance cannot access lab credentials or curriculum materials.
