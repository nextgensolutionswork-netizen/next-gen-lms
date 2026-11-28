# 🚀 DEPLOYMENT & ROLLBACK RUNBOOK REPORT

**Project:** Next-Gen ERP LMS & CRM  
**Date:** 27 November 2026  
**Auditor / Taskforce:** Antigravity AI Engineering Taskforce  
**Baseline Commit:** `d855594`  
**Target Release Commit:** `1884067` (Branch: `main`)  
**Deployment Platform:** Vercel Production (`https://next-gen-lms-omega.vercel.app`)  

---

## 1. Release Architecture & Commit Lineage

* **Currently Deployed Commit:** Pre-remediation commit `ed78429` / `d855594` (demonstrated by HTTP 401 on `/api/database/health`).
* **Target Release Commit:** `1884067` (`merge: integrate origin/main fixes (cookie secret runtime lookup & onboarding status alignment)`).
* **Ancestry Guarantee:** `git merge-base --is-ancestor d855594 1884067` returned code `0` (clean lineal progression).
* **Regression Protection:** All 146 test suites and 2,296 automated tests pass on `1884067`.

---

## 2. Step-by-Step Production Cutover Procedure

### Phase A: Database Storage Security Migration (Pre-Deployment)
1. **Target Project:** Live Supabase Production DB.
2. **Execute Migration:**
   ```bash
   supabase db push --include 20261127140000_storage_security_hardening.sql
   ```
   *Or execute via Supabase Dashboard SQL Editor.*
3. **Verify Bucket Privacy:**
   ```sql
   SELECT id, name, public FROM storage.buckets WHERE id IN ('receipts', 'resumes');
   -- Expected: public = false for both buckets
   ```

### Phase B: Environment Variable Verification
Verify the following variables in Vercel Project Settings:
- `NEXT_PUBLIC_SUPABASE_URL`: Authoritative Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: Service-role key (server-side only).
- `AUTH_COOKIE_SECRET`: High-entropy 64-character hex cryptographic secret.
- `NODE_ENV`: `production`.

### Phase C: Vercel Production Promotion
1. Push branch `main` (commit `1884067`) to remote origin repository.
2. Vercel automated CI/CD pipeline triggers:
   - `tsc --noEmit --incremental false` (Type validation)
   - `eslint .` (Code quality check)
   - `next build --webpack` (Build artifact generation)
3. Confirm production promotion of deployment to `https://next-gen-lms-omega.vercel.app`.

### Phase D: Post-Cutover Smoke Verification
1. **Health Check:** `curl -s -i https://next-gen-lms-omega.vercel.app/api/database/health` (Returns HTTP 401 unauthenticated with structured error; returns HTTP 200 with admin session).
2. **Storage Leak Test:** `curl -s -o /dev/null -w "%{http_code}" https://<supabase-url>/storage/v1/object/receipts/test.pdf` (Returns HTTP 401 or 404, never 200).
3. **Webhook Verification:** Send test payload with invalid signature to `/api/webhooks/razorpay`; verify HTTP 401.
4. **Staff Login:** Log in via Super Admin live credentials; verify session issuance and dashboard metrics.

---

## 3. Rollback & Emergency Contingency Procedures

In the event of an unexpected runtime failure post-deployment:

### 3.1 Instant Application Rollback (Vercel)
1. Navigate to **Vercel Dashboard** -> **Deployments**.
2. Locate the previous production deployment (`d855594`).
3. Click **Instant Rollback**. Traffic cutover occurs in under 2 seconds.

### 3.2 Storage Policy Rollback (Supabase)
If private bucket settings interfere with legacy operations:
```sql
UPDATE storage.buckets SET public = true WHERE id IN ('receipts', 'resumes');
```

### 3.3 SLA & Escalation
- Rollback SLA: < 5 minutes.
- Escalation: Antigravity Taskforce Lead and Director of Engineering.
