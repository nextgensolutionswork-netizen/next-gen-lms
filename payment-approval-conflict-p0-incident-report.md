# P0 Incident Report — Accountant Payment Verification Conflict & Financial Transaction Failure

**Incident Status:** Resolved, Migrated & Deployed (`origin/main` + Production `tgohtdzwehhjfahtgovq`)  
**Production URL:** https://next-gen-lms-omega.vercel.app  
**Production Deployment (`e172dba`):** `dpl_9rTBUKGyzRJgvnonP1xefyCPNGFo` (`● Ready`, aliased to `next-gen-lms-omega.vercel.app`)  
**Applied Production Migration:** `20261127070545` (`fix_commit_fee_workflow_receipt_issued_by`)  
**Production Supabase Project:** `tgohtdzwehhjfahtgovq`  
**Isolated QA Project:** `mzkrvvnmmjcjygwllabn`  

---

## 1. Executive Summary
When Accountant **Padmaja** (`82b47429-6dca-47d8-aa73-ac959cb26429`) attempted to verify & clear a ₹9,000 UPI payment (`spr-1795735527117-07vj`) on **Accounts → Approval Desk**, the UI returned:
> `"Conflict: Payment state changed or could not be committed. Refresh and retry."`

Read-only production investigation confirmed that **no revision conflict occurred** (`fee_workflow_state.revision` remained `54`) and **no partial financial mutation occurred** (`spr-1795735527117-07vj` remains `Pending Approval` / `Pending Verification`, `receipts` count is `0`, and `student_fee_accounts.collected_amount` is `0`).

The root cause (`SQLSTATE 22P02` in `public.commit_fee_workflow` `3G` due to missing `issued_by` UUID) has been fixed in application code, hardened in PostgreSQL migration `20261127070545`, deployed to Vercel production, and verified across both `PGlite` and isolated Supabase PostgreSQL (`mzkrvvnmmjcjygwllabn`).

---

## 2. Affected Payment Identification (Read-Only Production Reconciliation)

| Field | Authoritative Production Value (`tgohtdzwehhjfahtgovq`) |
| :--- | :--- |
| **Workflow Payment ID (`studentPayments[].id`)** | `spr-1795735527117-07vj` |
| **Legacy Snapshot Payment ID (`payments[].id`)** | `pay-spr-1795735527117-07vj` |
| **Normalized `public.payments.id` (UUID)** | `0cc9ab8d-61b9-cf63-3da5-cde93ed2c7c5` |
| **Student ID** | `19ce0822-ce1b-4894-8d85-4cf9a7f2e047` (`test`, `STU-FICO-003`) |
| **LMS Registration Number** | `NGERP-2026-00003` |
| **Admission ID & Number** | `da384cda-e98d-41fe-9c41-ada94fa9d21c` (`ADM-2026-0029`) |
| **Student Fee ID (`fee_id`)** | `3eac5b4e-1b35-4288-a386-1fc807013bc8` |
| **Fee Account ID (`fee_account_id`)** | `e6845bf3-09ab-429e-a439-8b75dd9e1ce6` (Original ₹35,000; Discount ₹2,000; Net Payable ₹33,000; Collected ₹0; Outstanding ₹33,000; Status `Pending`) |
| **Amount Recorded / Submitted** | `₹9,000` (`amount: 9000`) |
| **Payment Date & Mode** | `2026-11-27`, `UPI` |
| **UTR / Transaction Reference** | `12345` |
| **Receiving Bank Account** | `bank-acc-01` (`HDFC Bank`, `Katari Charitha`, `•••• •••• 1140`) |
| **Current Status (Pre-Retry)** | `Pending Approval` / `Pending Verification` (`verified_by: null`, `verified_at: null`, `receipt_number: PENDING-spr-1795735527117-07vj`, `receipt_count: 0`) |
| **Current `fee_workflow_state.revision`** | `54` (`updated_at: 2026-11-26 23:25:27.293356+00`) |

> **Note:** Genuine business approval by Accountant Padmaja has not yet been executed on production after deployment. No test approval was performed on production per safety constraints.

---

## 3. Confirmed Root Cause
1. **`finalizeVerifiedPayment` (`lib/services/fee-workflow-service.ts`):** Set `receipt.authorized_by = verifierName` (e.g. `'Padmaja'`) for PDF/Portal display, omitting `issued_by: verifierUserId`.
2. **`public.commit_fee_workflow` (`3G` — `public.receipts` INSERT):** Executed `COALESCE(NULLIF(rcpt->>'authorized_by', '')::uuid, NULLIF(rcpt->>'issued_by', '')::uuid)`, raising **PostgreSQL SQLSTATE `22P02` (`invalid input syntax for type uuid: "Padmaja"`)** and rolling back the entire transaction.
3. **`paymentTransaction` (`lib/services/payment-workflow-transaction.ts`):** Caught every `response.error` from `commit_fee_workflow` without classifying `pgCode`, masking `22P02` as HTTP `409` (`"Conflict: Payment state changed or could not be committed. Refresh and retry."`).

---

## 4. Changes Implemented
1. **`lib/services/fee-workflow-service.ts`:** Added `issued_by: verifierUserId` on generated receipts in `finalizeVerifiedPayment` while preserving `authorized_by: verifierName`.
2. **`lib/services/payment-workflow-transaction.ts` & `app/api/fees/payments/route.ts`:** Classified `commit_fee_workflow` RPC errors (`40001`, `23505`, `22P02`, `22023`, `42501`, and HTTP `500` `Database failure` for unhandled DB errors).
3. **`lib/services/payment-workflow-client.ts`:** Added in-flight double-click deduplication and stable `idempotency_key` generation on `verifyPayment` and `rejectPayment`.
4. **`supabase/migrations/20261127_fix_commit_fee_workflow_receipt_issued_by.sql`:** Preserves historical receipts (`IF EXISTS ... CONTINUE;`), resolves `v_issued_by` strictly via UUID regex (`22023` on missing/non-UUID), validates active `accountant`/`admin`/`super_admin` in `p_tenant` (`42501`), and rolls back atomically on failure. Applied to isolated QA (`mzkrvvnmmjcjygwllabn`) and production (`tgohtdzwehhjfahtgovq`, version `20261127070545`).
5. **`lib/security/auth-cookie.ts` (`54e95df`):** Replaced module-load IIFE with lazy runtime `getAuthCookieSecret()` (verified fail-closed when `AUTH_COOKIE_SECRET` is unset).
6. **`lib/services/onboarding-service.ts`:** Aligned `resolveAndEnsureOnboardingCase` with `initializeOnboardingCase` (`admission.status === 'Confirmed'`) so `forwardSubmittedPaymentToOnboarding` (merged from `d855594`) does not throw HTTP `400` when recording payments for `Active` admissions.

---

## 5. Production Readiness Conclusion
- **Can `spr-1795735527117-07vj` be safely retried?** **YES** — `spr-1795735527117-07vj` is cleanly `Pending Approval` with zero partial ledger or receipt mutations, migration `20261127070545` is live on `tgohtdzwehhjfahtgovq`, and production logs show zero `22P02` errors post-migration.
