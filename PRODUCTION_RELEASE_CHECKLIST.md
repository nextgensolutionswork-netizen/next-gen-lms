# 📋 PRODUCTION RELEASE CHECKLIST & DEPLOYMENT RUNBOOK

**Project:** Next-Gen ERP LMS & CRM  
**Date:** 27 November 2026  
**Auditor / Taskforce:** Antigravity AI Engineering Taskforce  
**Target Release:** Production Deployment v1.0.0-hardened  
**Authoritative Commit:** `09e939d` (Branch `main`)  

---

## 1. Pre-Deployment Release Gates Verification

All 12 pre-flight quality and security gates must be verified before initiating traffic cutover:

- [x] **Gate 01: Clean Production Build:** `next build --webpack` compiles with code 0 in 33.0s; 52 static and dynamic routes generated cleanly.
- [x] **Gate 02: TypeScript Type Soundness:** `tsc --noEmit --incremental false` passes with 0 compilation errors across the entire codebase.
- [x] **Gate 03: ESLint Standards:** `eslint .` passes with 0 errors and 0 warnings.
- [x] **Gate 04: Vitest Regression Suite:** 146 / 146 test suites passed; 2,296 / 2,296 tests passed (100% pass rate).
- [x] **Gate 05: Storage Security (SEC-BUG-01):** `receipts` and `resumes` buckets set to private; anonymous policies purged; authenticated RLS verified.
- [x] **Gate 06: Authentication Security (SEC-BUG-02):** Production static passwords purged; demo fallback restricted strictly to test environment; fail-closed behavior verified.
- [x] **Gate 07: Financial Separation of Duties:** Counsellors cannot approve fees or alter receipts; payment idempotency enforced.
- [x] **Gate 08: Ledger Immutability (ARCH-BUG-02):** Read queries (`GET /api/fees/upcoming-dues`) and exports execute with zero ledger mutation.
- [x] **Gate 09: Middleware Route Classification (ARCH-BUG-01):** Public webhooks, login, and health endpoints admitted; protected APIs require authentication.
- [x] **Gate 10: Test Suite Portability (TEST-BUG-01):** Machine-specific hardcoded paths replaced with portable temporary directories.
- [x] **Gate 11: Dependency Security (SEC-BUG-03):** 0 runtime production vulnerabilities; devDependencies patched.
- [x] **Gate 12: Database Integrity (TASK-01):** Deleted record re-injection prevented; Asia/Kolkata timezone handling validated.

---

## 2. Step-by-Step Production Deployment Runbook

### Step 1: Database Migration Execution
Apply the versioned storage hardening migration against the target Supabase production database:
```bash
# Verify connection to production Supabase project
supabase db push --include 20261127140000_storage_security_hardening.sql

# Or execute directly via Supabase SQL Editor:
# supabase/migrations/20261127140000_storage_security_hardening.sql
```
**Verification Query:**
```sql
SELECT id, name, public FROM storage.buckets WHERE id IN ('receipts', 'resumes');
-- Expected: public = false for both buckets
```

### Step 2: Production Environment Variables Audit
Verify that the production deployment environment (Vercel / AWS / Docker) has the required secrets configured:
- `NEXT_PUBLIC_SUPABASE_URL`: Live Supabase URL (e.g. `https://xyz.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Client anonymous key.
- `SUPABASE_SERVICE_ROLE_KEY`: Service-role key (backend serverless only, strictly private).
- `AUTH_COOKIE_SECRET`: High-entropy 64-character hex string.
- `NODE_ENV`: `production`.

### Step 3: CI/CD Pipeline Promotion
1. Verify commit `09e939d` is pushed to release branch or tag `v1.0.0-hardened`.
2. Trigger the automated CI/CD build:
   - TypeScript compilation (`npm run typecheck`)
   - Linter (`npm run lint`)
   - Regression suite (`npm test`)
   - Next.js Webpack production build (`npm run build`)
3. Promote container or Vercel deployment artifact to production environment.

### Step 4: Post-Deployment Smoke Test Protocol
Execute the following automated health checks immediately following deployment:
1. **Health Check:** `curl -f -s -o /dev/null -w "%{http_code}" https://<production-domain>/api/database/health` (Must return `200`).
2. **Storage Leak Test:** `curl -s -o /dev/null -w "%{http_code}" https://<supabase-url>/storage/v1/object/receipts/test.pdf` (Must return `401` or `404`, never `200`).
3. **Webhook Ping:** Test Razorpay webhook endpoint with valid webhook signature payload; verify response.
4. **Staff Login:** Log in via Super Admin and Accountant live accounts; verify session issuance and dashboard metrics.

---

## 3. Rollback Protocol & Contingency Plan

In the event of unforeseen production anomalies:
1. **Application Rollback:** Revert deployment traffic to baseline commit `ed78429` using instant deployment rollback (e.g. Vercel Instant Rollback or Docker tag re-route).
2. **Database Schema:** Storage migration is strictly additive and backward-compatible with server-signed URL access.
3. **Incident Escalation:** Contact Antigravity Taskforce Lead and Director of Engineering.
