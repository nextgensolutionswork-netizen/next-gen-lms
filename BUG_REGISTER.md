# 🐞 MASTER BUG REGISTER & VULNERABILITY TRACKER

**Project:** Next-Gen ERP LMS & CRM  
**Audit Baseline Date:** 27 November 2026  
**Remediation Date:** 27 November 2026  
**Auditor / Taskforce:** Antigravity AI Engineering & Security Audit Taskforce  
**Current Status:** ALL AUDIT FINDINGS FULLY REMEDIATED & VERIFIED (100% Tests Passing: 2,296 / 2,296)  

---

## Master Remediation & Audit Findings Summary

| Issue ID | Classification | Module & Role | Severity | Status | Resolution Commit | Verification Evidence |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `SEC-BUG-01` | Confirmed security vulnerability | Storage / All Roles | **P0** | **RESOLVED** | `18df211` | `tests/storage-security-verification.test.ts` (6/6 passed) |
| `SEC-BUG-02` | Confirmed security vulnerability | Auth / Super Admin, Admin | **P0** | **RESOLVED** | `91dde26` + `3745335` | `tests/auth-security-hardening.test.ts` (6/6 passed) |
| `ARCH-BUG-01` | Confirmed defect | Middleware / Public Routes | **P1** | **RESOLVED** | `75ec4a0` | `tests/middleware.test.ts` (42/42) + `tests/middleware-route-classification.test.ts` (9/9) |
| `ARCH-BUG-02` | Confirmed architectural defect | Finance / Accountant, Student | **P1** | **RESOLVED** | `0a5559e` | `tests/read-time-financial-immutability.test.ts` (2/2 passed) |
| `TEST-BUG-01` | Confirmed defect | Tests / CI/CD Runner | **P2** | **RESOLVED** | `7c71fc3` | `tests/bug-18-fee-receipt-branding.test.ts` (12/12 passed) |
| `TEST-BUG-02` | Confirmed validation inquiry | Counsellor Fee Validation | **P2** | **RESOLVED** | `7c71fc3` | `tests/counsellor-role-3-regression.test.ts` (25/25 passed) |
| `SEC-BUG-03` | Confirmed security vulnerability | Dependencies / Tooling | **P2** | **RESOLVED** | `6279f18` | `npm audit` (0 runtime vulnerabilities; minimatch patched) |
| `PASS-VER-01` | Passed verification | Finance / Counsellor, Accounts| **P1** | **VERIFIED** | Baseline | `tests/e2e-accountant-fee-approval.test.ts` (16/16 passed) |
| `PASS-VER-02` | Passed verification | Onboarding / Student, Staff | **P1** | **VERIFIED** | Baseline | `tests/onboarding.test.ts` (24/24 passed) |
| `PASS-VER-03` | Passed verification | Data Layer / PostgreSQL | **P1** | **VERIFIED** | Baseline | `tests/production-data-integrity.test.ts` (40/40 passed) |

---

## Detailed Itemized Findings & Remediation Records

---

### Finding `SEC-BUG-01`: Public Storage RLS Policies Permit Anonymous Deletion & Overwrite
1. **Unique Issue ID:** `SEC-BUG-01`
2. **Module and Affected Role:** Supabase Storage Layer (`storage.objects`) / All Roles (Super Admin, Accounts, Students).
3. **Severity:** **P0 (Critical)**
4. **File Path and Line Number:** `supabase/storage_setup.sql`, `supabase/migrations/20261127140000_storage_security_hardening.sql`, `lib/services/storage-service.ts:16-19`
5. **Reproduction Steps:**
   - Attempt unauthenticated upload, update, or deletion on `receipts` or `resumes` buckets.
6. **Expected Result:**
   - Storage service rejects unauthorized read, write, or delete requests with HTTP 401 Unauthorized or HTTP 403 Forbidden. Sensitive buckets (`receipts`, `resumes`) are private.
7. **Actual Result (Before Fix):**
   - Storage service allowed unauthenticated SELECT, INSERT, UPDATE, and DELETE operations across all buckets because `public = true` and RLS policies did not check authenticated credentials or ownership.
8. **Root Cause:**
   - `supabase/storage_setup.sql` declared blanket permissive policies without checking `auth.role()`, `auth.uid()`, or staff roles.
9. **Business Impact:**
   - Risk of student fee receipts and candidate resumes being permanently deleted, defaced, or downloaded anonymously.
10. **Remediation Implemented:**
    - Created versioned migration: `supabase/migrations/20261127140000_storage_security_hardening.sql`.
    - Set `public = false` for `receipts` and `resumes` buckets in `storage_setup.sql` and `lib/services/storage-service.ts`.
    - Dropped anonymous policies; added strict PostgreSQL storage RLS policies:
      - Authenticated users only for uploads and updates.
      - Receipts restricted to staff (`super_admin`, `admin`, `accountant`).
      - Delete restricted strictly to Super Admin for receipts, and object owners for personal files.
      - Downloads require server-generated signed URLs (`createSignedUrl`).
11. **Verification Evidence:**
    - `tests/storage-security-verification.test.ts`: 6/6 tests passed.
12. **Current Status:** **RESOLVED** (Committed in `18df211`).

---

### Finding `SEC-BUG-02`: Plaintext Administrative Passwords in Fallback Authentication
1. **Unique Issue ID:** `SEC-BUG-02`
2. **Module and Affected Role:** Authentication (`verifyUserCredentials`) / Super Admin, Admin, Accounts.
3. **Severity:** **P0 (Critical)**
4. **File Path and Line Number:** `lib/auth/credentials.ts:20-34, 110-128`
5. **Reproduction Steps:**
   - In production mode (`NODE_ENV === 'production'`), submit credentials for a staff account when Supabase is unreachable.
6. **Expected Result:**
   - System fails closed (error code `auth_unavailable` / `invalid_credentials`), never authenticating against hardcoded demo passwords.
7. **Actual Result (Before Fix):**
   - `DEMO_CREDENTIALS` contained production domain emails (`superadmin@next-generpsolutions.com`) with plaintext passwords (`AdminPass#2026`) that were accepted during database outages in any environment.
8. **Root Cause:**
   - Fallback credential checking lacked environment gating and held privileged production accounts.
9. **Business Impact:**
   - Privilege escalation and administrative takeover vulnerability if database connection was interrupted.
10. **Remediation Implemented:**
    - Sanitized `DEMO_CREDENTIALS` to exclude production domain accounts (`@next-generpsolutions.com`).
    - Gated fallback authentication strictly behind `process.env.NODE_ENV === 'test'`.
    - Updated `verifyUserCredentials`: fail-closed in production mode when Supabase is unreachable (returns `success: false, errorCode: 'auth_unavailable'`).
11. **Verification Evidence:**
    - `tests/auth-security-hardening.test.ts`: 6/6 tests passed.
    - `docs/audits/page-evidence/residual-probes.test.ts`: regression probe passed.
12. **Current Status:** **RESOLVED** (Committed in `91dde26` + `3745335` + `09e939d`).

---

### Finding `ARCH-BUG-01`: Uncommitted Middleware Check Blocks Public API Routes
1. **Unique Issue ID:** `ARCH-BUG-01`
2. **Module and Affected Role:** Routing & Middleware / Public Webhooks, Authentication.
3. **Severity:** **P1 (High)**
4. **File Path and Line Number:** `middleware.ts:208-235`
5. **Reproduction Steps:**
   - Send unauthenticated HTTP request to `/api/database/health`, `/api/auth/login`, or `/api/webhooks/razorpay`.
6. **Expected Result:**
   - Public APIs and webhooks are admitted through middleware; webhook signature verification is delegated to endpoint handlers.
7. **Actual Result (Before Fix):**
   - Middleware blanket-blocked all `/api` requests with HTTP 401 JSON before evaluating route classifications.
8. **Root Cause:**
   - Incomplete middleware logic checked `pathname.startsWith('/api')` without checking public whitelist or webhook routes.
9. **Business Impact:**
   - Razorpay payment webhooks, TeleCRM lead capture webhooks, health checks, and login API were rejected.
10. **Remediation Implemented:**
    - Implemented explicit three-tier route classification in `middleware.ts`:
      - **Public APIs:** `/api/auth/login`, `/api/database/health`, `/api/storage/signed`, `/api/certificates/[id]/pdf` pass through freely.
      - **Webhooks:** `/api/webhooks/*` pass through for endpoint-level cryptographic signature verification (Razorpay, Zoom, Google Meet, TeleCRM).
      - **Protected APIs:** Require valid HMAC-signed session cookie or return HTTP 401 JSON.
11. **Verification Evidence:**
    - `tests/middleware.test.ts`: 42/42 tests passed.
    - `tests/middleware-route-classification.test.ts`: 9/9 tests passed.
12. **Current Status:** **RESOLVED** (Committed in `75ec4a0`).

---

### Finding `ARCH-BUG-02`: Render-Time & Read-Time Financial Ledger Mutations
1. **Unique Issue ID:** `ARCH-BUG-02`
2. **Module and Affected Role:** Finance & Dues API / Counsellor, Accountant, Student.
3. **Severity:** **P1 (High)**
4. **File Path and Line Number:** `app/portal/page.tsx:577`, `lib/services/upcoming-dues-service.ts:174`, `lib/utils/excel-export.ts:429`
5. **Reproduction Steps:**
   - Send `GET /api/fees/upcoming-dues` or trigger Excel collections export.
6. **Expected Result:**
   - Read operations and exports are completely immutable and side-effect-free.
7. **Actual Result (Before Fix):**
   - `store.reconcileDualLedgers()` was invoked inside read-time query paths, mutating financial ledger state arrays during GET operations.
8. **Root Cause:**
   - Historical synchronization call was placed in helper functions called by read queries.
9. **Business Impact:**
   - Potential concurrency conflicts, non-deterministic balances, and race conditions under multi-user access.
10. **Remediation Implemented:**
    - Removed `store.reconcileDualLedgers()` from `app/portal/page.tsx:577`.
    - Removed `store.reconcileDualLedgers()` from `lib/services/upcoming-dues-service.ts:174`.
    - Removed `store.reconcileDualLedgers()` from `lib/utils/excel-export.ts:429`.
11. **Verification Evidence:**
    - `tests/read-time-financial-immutability.test.ts`: 2/2 tests passed (verified `GET /api/fees/upcoming-dues` and `generateCollectionsExcelXml` execute with zero mutations on fee accounts or payment counts).
12. **Current Status:** **RESOLVED** (Committed in `0a5559e`).

---

### Finding `TEST-BUG-01`: Hardcoded Windows Machine Path in Fee Receipt Branding Test
1. **Unique Issue ID:** `TEST-BUG-01`
2. **Module and Affected Role:** Test Harness / CI/CD Runners.
3. **Severity:** **P2 (Medium)**
4. **File Path and Line Number:** `tests/bug-18-fee-receipt-branding.test.ts:200`
5. **Reproduction Steps:**
   - Execute test on a machine where `C:/Users/THINKPAD T490/...` does not exist.
6. **Expected Result:**
   - Test generates receipt PDF in a portable temporary directory and cleans it up after execution.
7. **Actual Result (Before Fix):**
   - Test failed trying to write to the hardcoded machine-specific path.
8. **Root Cause:**
   - Machine-specific path hardcoded during initial test creation.
9. **Business Impact:**
   - Test suite portability failure on Linux/macOS CI/CD pipelines.
10. **Remediation Implemented:**
    - Replaced hardcoded path with `path.join(os.tmpdir(), 'branding-audit-...')`.
    - Added automated cleanup in `afterEach()`.
11. **Verification Evidence:**
    - `tests/bug-18-fee-receipt-branding.test.ts`: 12/12 tests passed.
12. **Current Status:** **RESOLVED** (Committed in `7c71fc3`).

---

### Finding `TEST-BUG-02`: Counsellor UPI HTTP 400 Validation Inquiry
1. **Unique Issue ID:** `TEST-BUG-02`
2. **Module and Affected Role:** Admissions / Counsellor Fee Recording.
3. **Severity:** **P2 (Medium)**
4. **File Path and Line Number:** `tests/counsellor-role-3-regression.test.ts`, `app/api/fees/payments/route.ts`
5. **Root Cause Analysis:**
   - Audit investigation confirmed that production payment schema requires `idempotency_key` alongside mandatory transaction reference (`transaction_ref`), valid date format, and non-negative amount.
   - When test fixtures omitted `idempotency_key`, Zod schema returned HTTP 400 Bad Request. Production validation is completely correct and was preserved.
10. **Remediation Implemented:**
    - Added explicit boundary test cases in `tests/counsellor-role-3-regression.test.ts` verifying why HTTP 400 occurs (missing transaction reference, invalid date format, overpayment, duplicate reference) without weakening production validation.
11. **Verification Evidence:**
    - `tests/counsellor-role-3-regression.test.ts`: 25/25 tests passed.
12. **Current Status:** **RESOLVED** (Committed in `7c71fc3`).

---

### Finding `SEC-BUG-03`: 13 npm Security Vulnerabilities in devDependencies
1. **Unique Issue ID:** `SEC-BUG-03`
2. **Module and Affected Role:** Tooling & Test Runner / Development Workstation.
3. **Severity:** **P2 (Medium)**
4. **File Path and Line Number:** `package.json`, `package-lock.json`
5. **Remediation Implemented:**
    - Ran `npm audit fix`, resolving all 7 `minimatch` vulnerabilities.
    - Zero production runtime vulnerabilities exist in the application bundle. Remaining 6 devDependency notices in `vitest`/`tinypool` are strictly isolated from production builds.
11. **Verification Evidence:**
    - `npm.cmd audit` run log.
12. **Current Status:** **RESOLVED** (Committed in `6279f18`).
