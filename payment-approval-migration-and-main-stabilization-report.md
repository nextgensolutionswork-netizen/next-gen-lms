# P0 Payment Approval Migration & Main Branch Stabilization Report

**Production Supabase Project:** `tgohtdzwehhjfahtgovq`  
**Isolated QA Supabase Project:** `mzkrvvnmmjcjygwllabn`  
**Production URL:** https://next-gen-lms-omega.vercel.app  

---

## 1. Confirmed Root Cause & Production Migration (`20261127_fix_commit_fee_workflow_receipt_issued_by.sql`)
- **SQLSTATE:** `22P02` (`invalid input syntax for type uuid: "Padmaja"`).
- **Root Cause:** `finalizeVerifiedPayment` (`lib/services/fee-workflow-service.ts`) set `receipt.authorized_by = verifierName` (`'Padmaja'`) without `issued_by`, while `commit_fee_workflow` (`3G`) executed `COALESCE(NULLIF(rcpt->>'authorized_by', '')::uuid, NULLIF(rcpt->>'issued_by', '')::uuid)`. `paymentTransaction` (`lib/services/payment-workflow-transaction.ts`) masked any RPC error as `'Conflict: Payment state changed or could not be committed. Refresh and retry.'` (HTTP `409`).
- **Security Gate Hardening:**
  1. `finalizeVerifiedPayment` now sets `issued_by: verifierUserId` while preserving `authorized_by: verifierName` for Portal/PDF display.
  2. `commit_fee_workflow` (`3G`) skips existing historical receipts (`IF EXISTS (SELECT 1 FROM public.receipts r WHERE r.receipt_number = rcpt->>'receipt_number') THEN CONTINUE; END IF;`), resolves `v_issued_by` strictly via UUID regex (`issued_by` preferred, `authorized_by` fallback only if UUID), rejects missing/non-UUID issuers (`22023`), and validates active `accountant`/`admin`/`super_admin` membership in `public.profiles` for `p_tenant` (`42501`), rolling back on failure.
  3. Signature `(p_tenant text, p_revision bigint, p_snapshot jsonb) -> bigint`, `SECURITY INVOKER`, `SET search_path TO ''`, and `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;` are preserved.

---

## 2. ISSUER-001 through ISSUER-020 Matrix (`PGlite` + Isolated QA `mzkrvvnmmjcjygwllabn`)
- **ISSUER-001 / 002 / 003 (Valid Accountant UUID, spaces, duplicate display names):** PASS (`tests/p0-receipt-issuer-security.test.ts` — resolves by UUID, unaffected by duplicate `'Padmaja'` display names).
- **ISSUER-004 / 005 (Invalid/display-name-only/missing actor UUID):** PASS (raises `22023`, rolls back fee balance).
- **ISSUER-006 / 007 / 008 / 009 (Nonexistent, cross-tenant, disabled, unauthorized role):** PASS (raises `42501`, rolls back fee balance).
- **ISSUER-010 (Forged browser-supplied actor identity):** PASS (`app/api/fees/payments/route.ts` uses server-verified `actor.id`).
- **ISSUER-011 (Existing historical receipt preservation):** PASS (historical `REC-2026-000001` untouched).
- **ISSUER-012 / 013 (Receipt persistence & failure rollback):** PASS (atomic commit & complete rollback verified).
- **ISSUER-014 / 015 / 016 / 017 (Concurrent approvals, duplicate prevention, `40001` revision check, idempotent replay):** PASS.
- **ISSUER-018 / 019 / 020 (Bank account `bank-acc-01`, ₹9,000 balance `₹19,000 / ₹11,000`, backward compatibility):** PASS.

---

## 3. MAIN-R01 through MAIN-R08 Stabilization Matrix (`origin/main` `de8a14a` / `deb2a05`)

| ID | File & Line | Error / Failure | Root Cause (`deb2a05`) | Resolution | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| MAIN-R01 | `tests/setupAuth.ts:2` | `TS2540` read-only `NODE_ENV` | Direct assignment `process.env.NODE_ENV = 'test'` | `Object.assign(process.env, ...)` | PASS |
| MAIN-R02 | `tests/database-persistence.test.ts:264` | `TS2554` expected 1 arg | `healthRoute()` updated to require `NextRequest` | Pass authenticated `NextRequest` | PASS |
| MAIN-R03 | `tests/platform-admin-operations.test.ts:671` | `TS2554` expected 1 arg | `GET()` updated to require `NextRequest` | Pass authenticated `getReq` | PASS |
| MAIN-R04 | `tests/database-persistence.test.ts:265` | `401` instead of `200` | `GET /api/database/health` now requires `super_admin`/`admin` cookie | Pass signed `super_admin` cookie | PASS |
| MAIN-R05 | `tests/platform-admin-operations.test.ts:672` | `401` instead of `200` | `GET /api/settings` now requires auth cookie | Pass signed `admin` cookie | PASS |
| MAIN-R06 | `tests/task-04-role-auth-and-security.test.ts:56` | `counsellor_lead` `/academics/courses` → `307` | `deb2a05` restricted `/academics` to `super_admin`/`admin`/`trainer` | Updated `allowedCases` / `deniedCases` | PASS |
| MAIN-R07 | `tests/task-04-role-auth-and-security.test.ts:56` | `accountant` `/academics/courses` → `307` | Same middleware boundary in `deb2a05` | Updated `allowedCases` / `deniedCases` | PASS |
| MAIN-R08 | `tests/task-04-role-auth-and-security.test.ts:56` | `placement_coordinator` `/academics/courses` → `307` | Same middleware boundary in `deb2a05` | Updated `allowedCases` / `deniedCases` | PASS |

---

## 4. Complete Verification Totals
- **Full Sequential Regression (`npx vitest run --no-file-parallelism`):** **142/142 test files passed, 2,269/2,269 tests passed (100% pass rate)**.
- **TypeScript (`npx tsc --noEmit`):** **0 errors**.
- **ESLint (`npm run lint`):** **0 errors, 0 warnings**.
- **Next.js Build (`npm run build`):** **52/52** static pages + all dynamic/API routes compiled cleanly.
- **Authenticated Accountant Browser E2E:** `BLOCKED — AUTH_REQUIRED` (retained for authenticated QA session).
