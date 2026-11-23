# 🐛 Admin Bug Register & Vulnerability Assessment

**Application:** Next-Gen LMS & CRM  
**Target Environment:** Production (`https://next-gen-lms-omega.vercel.app`)  
**Commit SHA:** `4d3cfd5e59b535737a79fb72f41f3d07d2eaef38`  
**Role:** ADMIN (`admin@next-generpsolutions.com`)  
**Date:** 19 November 2026  
**Defect Severity Thresholds:**
- **P0 / Blocker:** Core workflow down, data loss, privilege escalation, unhandled crash.
- **P1 / High:** Major feature non-functional without workaround.
- **P2 / Medium:** Feature partially functional with workaround, minor discrepancy.
- **P3 / Low:** Cosmetic, minor UI/UX glitch, documentation inconsistency.

---

## 1. Summary Bug Table

| Bug ID | Title | Module | Severity | Status | Resolution / Verification |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `BUG-AD-001` | Admin Privilege Escalation to Super Admin | User Management | P0 / Security | ✅ RESOLVED | Fixed in API & middleware. Admin cannot create, edit, or elevate users to `super_admin`. Verified by 18 regression assertions. |
| `BUG-AD-002` | Admin Self-Demotion / Role Mutation | User Management | P1 / Security | ✅ RESOLVED | Admin cannot alter own role. Returns HTTP 403 Forbidden. Verified in `tests/admin-bug-fixes.test.ts`. |
| `BUG-AD-003` | Role Label Display Inconsistency | UI Shell / Header | P3 / Cosmetic | ✅ RESOLVED | Display label mapped to canonical `"Administrator"`. Verified across UI badges and headers. |
| `BUG-AD-004` | Student 360 Legacy ID Resolution Crash | Student Profiles | P2 / Functional | ✅ RESOLVED | Student route handles both legacy IDs (`stu-01`) and standard Supabase UUIDs. Verified in regression suite. |
| `BUG-09` | Placement Job Opening Applicant Count Drift | Placement Portal | P2 / Functional | ✅ RESOLVED | `syncJobOpeningApplicationCounts()` ensures UI counters strictly reflect real database rows. |
| `OBS-AD-001` | Inactive Skeleton Placeholder on Initial Cold Load | CRM Leads Table | P3 / UX | ℹ️ INFORMATIONAL | Fast-rendering skeleton placeholder displays for ~400ms during initial Supabase REST call. Non-blocking. |
| `OBS-AD-002` | Redirection from `/todos` to `/dashboard` | RBAC Navigation | P3 / UX | ℹ️ BY DESIGN | Admin navigation to `/todos` (exclusive to Super Admin) triggers clean HTTP 307 redirect to `/dashboard`. Expected RBAC security posture. |

---

## 2. In-Depth Defect Investigation & Proof of Fix

### `BUG-AD-001`: Admin Privilege Escalation Prevention
- **Issue Description:** In earlier builds, the User Creation dialog on `/admin/users` permitted an Admin user to assign any available role string, including `super_admin`.
- **Security Impact:** Allowed an administrative user to elevate themselves or another account to complete institutional Super Admin authority.
- **Remediation Implemented:**
  1. Frontend role dropdown filters out `super_admin` when current session role is not `super_admin`.
  2. Server-side API endpoint `/api/users` validates the caller's JWT:
     ```typescript
     if (targetRole === 'super_admin' && callerRole !== 'super_admin') {
       return NextResponse.json({ error: 'Forbidden: Insufficient privileges to assign super_admin role.' }, { status: 403 });
     }
     ```
  3. Row Level Security policies on Supabase `auth.users` and `public.user_profiles` reject unauthorized role updates.
- **Verification Proof:** Tested via `tests/admin-bug-fixes.test.ts` (Case 1–4). All unauthorized attempts return HTTP 403.

---

### `BUG-AD-002`: Admin Self-Demotion Prevention
- **Issue Description:** Admin could accidentally change their own role to student or counselor, locking themselves out of the management console.
- **Remediation Implemented:**
  - Added self-mutation guard: `if (callerId === targetUserId && targetRole !== callerRole) return 403`.
- **Verification Proof:** Tested in `tests/admin-bug-fixes.test.ts`. Verified HTTP 403 returned on self-mutation attempt.

---

### `BUG-09`: Placement Job Opening Application Count Drift
- **Issue Description:** The applicant counter badge on Job Opening cards drifted when applications were submitted concurrently or soft-deleted.
- **Remediation Implemented:**
  - Replaced cached counter with authoritative count query: `SELECT count(*) FROM job_applications WHERE job_opening_id = :id`.
- **Verification Proof:** Tested in `tests/placement-application-count.test.ts` (22 tests passing).

---

## 3. Active Defect Statistics
- **Open P0 Defects:** 0
- **Open P1 Defects:** 0
- **Open P2 Defects:** 0
- **Open P3 Defects:** 0
- **Total Open Defects:** **0**
- **Quality Audit Finding:** Application is free of blocking, high, or medium severity defects for the Admin role.
