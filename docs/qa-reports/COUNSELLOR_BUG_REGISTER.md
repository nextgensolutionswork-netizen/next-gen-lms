# 🐛 Counsellor Bug Register & Vulnerability Assessment

**Project:** Next-Gen LMS & CRM  
**Organization:** Next-Gen ERP Solutions / MyERP Hub  
**Target Environment:** Production (`https://next-gen-lms-omega.vercel.app`)  
**Commit SHA:** `4d3cfd5e59b535737a79fb72f41f3d07d2eaef38`  
**Role:** COUNSELLOR (`counsellor@next-generpsolutions.com`)  
**Date of Audit:** 19 November 2026  

---

## 1. Defect Summary Table

| Defect ID | Title | Module | Severity | Status | Verification Proof |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `BUG-CO-001` | Audit Telemetry Ingestion Access Block for Counsellor | Telemetry & Audit | P1 / High | ✅ RESOLVED | `POST /api/audit-logs` accepts authorized lead stage updates while `GET` remains restricted to Admins. Verified by 10 tests in `counsellor-audit-logs.test.ts`. |
| `BUG-CO-002` | Student 360 Hook Order Invariance & UUID Lookup | Student Profiles | P1 / High | ✅ RESOLVED | Resolves legacy slugs (`stu-01`) and standard Supabase UUIDs without React hook order violations. Verified in `counsellor-role-3-regression.test.ts`. |
| `BUG-CO-003` | Payment Due Dates Navigation Block for Sales | Fee Management | P2 / Medium | ✅ RESOLVED | Middleware permits Counsellor read access to `/accounts/dues` while isolating approval desks. Verified in `counsellor-role-3-regression.test.ts`. |
| `BUG-13` | Duplicate & Unlinked Counsellors in Admissions Dropdown | Admissions | P2 / Medium | ✅ RESOLVED | Dropdown deduplicates repeated references and enforces tenant isolation. Verified by 10 tests in `admissions-counsellor-dropdown-bug13.test.ts`. |
| `OBS-CO-001` | Role Label Canonical Mapping (`Sales` $\to$ `Counsellor`) | UI Shell / Header | P3 / Cosmetic | ℹ️ BY DESIGN | User header displays `Ananya Desai (Senior Counsellor) • Sales`. Standard dual-badge mapping. |
| `OBS-CO-002` | Financial Compliance Notice Display | Approvals Desk | P3 / Informational| ℹ️ BY DESIGN | `/accounts/approvals` displays explicit Separation of Duties compliance notice. |

---

## 2. In-Depth Defect Investigation & Proof of Fix

### `BUG-CO-001`: Audit Telemetry Ingestion
- **Root Cause:** The `/api/audit-logs` route handler previously enforced role checking for both `GET` and `POST` at the top of the file, rejecting Counsellors who attempted to log interaction notes or lead transitions with HTTP 403.
- **Remediation Implemented:**
  1. Split authorization logic in `app/api/audit-logs/route.ts`:
     - `GET`: Strictly limited to `super_admin` and `admin`.
     - `POST`: Permitted for authenticated staff members (`counsellor`, `trainer`, `support`), validating that `actor.id` matches the session to prevent actor forgery.
  2. Maintained tenant isolation: attempts to log audits for another tenant are rejected with HTTP 403.
- **Verification Proof:** Tested via `tests/counsellor-audit-logs.test.ts` (10 tests passing).

---

### `BUG-CO-002`: Student Profile Hook Order Invariance & Resolution
- **Root Cause:** In earlier revisions of `app/(dashboard)/students/[id]/page.tsx`, conditional returns prior to `useAuth()` or `useQuery` hooks caused React hydration and hook-order crashes when non-admin roles navigated to student profiles.
- **Remediation Implemented:**
  1. Re-ordered React hooks to guarantee unconditional execution at the component root.
  2. Added resilient resolver in `lib/services/student-service.ts` supporting both legacy string slugs (`stu-01`) and canonical Supabase UUIDs.
  3. Safe fallback in financial calculation utilities preventing `TypeError` on null payment records.
- **Verification Proof:** Tested via `tests/counsellor-role-3-regression.test.ts` (Tasks 1–5 passing).

---

### `BUG-CO-003`: Payment Due Dates Navigation & Scoped Read-Only Access
- **Root Cause:** Next.js middleware previously grouped `/accounts/dues` with `/accounts/approvals` and `/accounts/expenses`, blocking sales counsellors who needed to review upcoming student installment dates.
- **Remediation Implemented:**
  1. Updated `middleware.ts` route matcher to allow `counsellor` role read-only access to `/accounts/dues`.
  2. Updated `getSafeRedirectUrl()` in `lib/auth/rbac.ts` to recognize `/accounts/dues` as authorized for counsellors.
  3. Ensured `/api/fees/dues` delivers sanitized read-only dues data without exposing administrative bank controls.
- **Verification Proof:** Tested via `tests/counsellor-role-3-regression.test.ts` (Tasks 6–11 passing).

---

## 3. Active Defect Statistics
- **Open P0 Defects:** 0
- **Open P1 Defects:** 0
- **Open P2 Defects:** 0
- **Open P3 Defects:** 0
- **Total Open Blocking Defects:** **0**
- **Quality Status:** Fully remediated, tested, and verified in production.
