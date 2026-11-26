# P0 Incident Report — Accountant Payment Verification Conflict & Financial Transaction Failure

**Incident Status:** Root Cause Identified & Hotfix Prepared (Production SQL Migration Pending Approval)  
**Production URL:** https://next-gen-lms-omega.vercel.app  
**Production Supabase Project:** `tgohtdzwehhjfahtgovq`  
**Isolated QA Project:** `mzkrvvnmmjcjygwllabn`  
**Branch:** `hotfix/payment-approval-conflict`  

---

## 1. Executive Summary
When Accountant **Padmaja** (`82b47429-6dca-47d8-aa73-ac959cb26429`) attempted to verify & clear a ₹9,000 UPI payment (`spr-1795735527117-07vj`) on **Accounts → Approval Desk**, the UI returned:
> `"Conflict: Payment state changed or could not be committed. Refresh and retry."`

Read-only production investigation confirmed that **no revision conflict occurred** (`fee_workflow_state.revision` remained `54`) and **no partial financial mutation occurred** (`spr-1795735527117-07vj` remains `Pending Approval` / `Pending Verification`, `receipts` is empty, and `student_fee_accounts.collected_amount` is `0`).

---

## 2. Affected Payment Identification (Read-Only Production Evidence)

| Field | Authoritative Production Value (`tgohtdzwehhjfahtgovq`) |
| :--- | :--- |
| **Workflow Payment ID (`studentPayments[].id`)** | `spr-1795735527117-07vj` |
| **Legacy Snapshot Payment ID (`payments[].id`)** | `pay-spr-1795735527117-07vj` |
| **Normalized `public.payments.id` (UUID)** | `0cc9ab8d-61b9-cf63-3da5-cde93ed2c7c5` |
| **Student ID** | `19ce0822-ce1b-4894-8d85-4cf9a7f2e047` (`test`, `STU-FICO-003`) |
| **LMS Registration Number** | `NGERP-2026-00003` |
| **Admission ID & Number** | `da384cda-e98d-41fe-9c41-ada94fa9d21c` (`ADM-2026-0029`) |
| **Student Fee ID (`fee_id`)** | `3eac5b4e-1b35-4288-a386-1fc807013bc8` |
| **Fee Account ID (`fee_account_id`)** | `e6845bf3-09ab-429e-a439-8b75dd9e1ce6` (Net Payable ₹33,000; Collected ₹0; Outstanding ₹33,000) |
| **Amount Recorded / Submitted** | `₹9,000` (`amount_paid: 9000`) |
| **Payment Date & Mode** | `2026-11-27`, `UPI` |
| **UTR / Transaction Reference** | `12345` |
| **Receiving Bank Account** | `bank-acc-01` (`HDFC Bank`, `Katari Charitha`, `•••• •••• 1140`) |
| **Current Status** | `Pending Approval` / `Pending Verification` (`verified_by: null`, `receipts: []`) |
| **Current `fee_workflow_state.revision`** | `54` (`updated_at: 2026-11-26 23:25:27.293356+00`) |

---

## 3. Confirmed Root Cause
1. **`finalizeVerifiedPayment` (`lib/services/fee-workflow-service.ts:1502`):** Sets `receipt.authorized_by = verifierName` (e.g. `'Padmaja'`) for PDF/Portal display, and omitted `issued_by: verifierUserId`.
2. **`public.commit_fee_workflow` (`3G` — `public.receipts` INSERT):** Executes:
   ```sql
   COALESCE(NULLIF(rcpt->>'authorized_by', '')::uuid, NULLIF(rcpt->>'issued_by', '')::uuid)
   ```
   Casting `'Padmaja'::uuid` raises **PostgreSQL SQLSTATE `22P02` (`invalid input syntax for type uuid: "Padmaja"`)**, rolling back the entire `commit_fee_workflow` transaction.
3. **`paymentTransaction` (`lib/services/payment-workflow-transaction.ts:185`):** Caught every `response.error` from `commit_fee_workflow` without checking `pgCode` (`40001` vs `23505` vs `22P02`) and threw the generic `'Conflict: Payment state changed or could not be committed. Refresh and retry.'` (HTTP `409`).

---

## 4. Changes Implemented
1. **`lib/services/fee-workflow-service.ts`:** Added `issued_by: verifierUserId` on generated receipts in `finalizeVerifiedPayment` while preserving `authorized_by: verifierName` for PDF & Portal rendering.
2. **`lib/services/payment-workflow-transaction.ts` & `app/api/fees/payments/route.ts`:** Classified `commit_fee_workflow` RPC errors accurately:
   - `40001` -> HTTP `409` (`Conflict: This payment was updated by another user. Review the latest payment details before continuing.`)
   - `23505` (`transaction_reference`) -> HTTP `409` (`Conflict: This transaction reference is already associated with another payment.`)
   - `23505` (`receipt_number`/`payment_id`) -> HTTP `409` (`Conflict: This payment has already been verified. View the existing receipt.`)
   - `22P02`/other DB errors -> HTTP `500` (`Database failure: Payment verification could not be completed. Please try again after checking the transaction status.`) with sanitized server-side diagnostic logging.
3. **`lib/services/payment-workflow-client.ts`:** Added in-flight double-click deduplication and stable `idempotency_key` generation to `verifyPayment` (and `idempotency_key` to `rejectPayment`).
4. **`supabase/migrations/20261127_fix_commit_fee_workflow_receipt_issued_by.sql`:** Updated `commit_fee_workflow` `3G` to resolve `v_issued_by` safely using UUID regex matching (`issued_by` preferred, `authorized_by` fallback only if UUID, else `NULL`). **Applied and verified on isolated QA (`mzkrvvnmmjcjygwllabn`); NOT applied to production (`tgohtdzwehhjfahtgovq`) pending explicit approval.**

---

## 5. Can the Affected Production Payment Be Safely Retried?
- **Currently (before applying `20261127_fix_commit_fee_workflow_receipt_issued_by.sql` to `tgohtdzwehhjfahtgovq`):** **NO** — retrying on production will still trigger `22P02` inside `commit_fee_workflow` (now accurately surfaced as HTTP 500 `"Database failure..."` rather than a false 409 conflict).
- **Once `20261127_fix_commit_fee_workflow_receipt_issued_by.sql` is approved and applied to `tgohtdzwehhjfahtgovq`:** **YES** — `spr-1795735527117-07vj` is cleanly `Pending Approval` with zero partial ledger/receipt state and can be safely verified by Padmaja on Approval Desk.
