# BUG — Fee Approval Desk Data Mapping Report (`fee-approval-desk-data-mapping-report.md`)

## 1. Confirmed Root Causes
1. **Invalid SQL Column Projections in `payment-workflow-transaction.ts`:**
   - `paymentTransaction` queried `payments.select('id, amount, status, receipt_number')` and `receipts.select('id, payment_id, receipt_number, payment_amount, status')`.
   - `public.payments` has no `status` column, and `public.receipts` uses `amount` (not `payment_amount`) and has no `status` column. Those queries errored in PostgreSQL while `admissions` and `students` returned `0` rows from normalized tables.
   - **Fix:** Updated queries to `payments.select('id, amount, receipt_number')` and `receipts.select('id, payment_id, receipt_number, amount')`.
2. **LMS ID Falling Back to Internal Database UUID (`app/(dashboard)/accounts/approvals/page.tsx`):**
   - When `matchingStudent` / `matchingAdmission` was missing for historical snapshot payments (`ADM-2026-0001`..`0023`), `lmsId` fell back to `p.student_id`, displaying internal UUIDs (e.g. `53a3c00b-6802-4f48-a48b-9c8ecd53305c`) under `LMS ID:`.
   - **Fix:** Added strict UUID guard (`UUID_REGEX`) so internal UUIDs are never displayed as LMS IDs (displaying `'Registration Pending'` when genuinely missing), and persisted `student_unique_id` and `student_code` directly onto `StudentPaymentRecord` in `feeWorkflowService.recordPayment` and `store.reconcileDualLedgers`.
3. **Missing Counsellor Name & Phone Number (`app/(dashboard)/accounts/approvals/page.tsx`, `fee-workflow-service.ts`, `data-store.ts`):**
   - `StudentPaymentRecord` did not store `student_phone`, `counsellor_id`, or `counsellor_name` directly, and `loadData()` in `approvals/page.tsx` did not forward them. When `effectiveAdm` / `matchingStudent` was absent in snapshot rows 1–18, `Counsellor Name` fell back to `'Unassigned'` and `Phone Number` fell back to `'Not Provided'`.
   - **Fix:** Persisted `student_phone`, `counsellor_id`, and `counsellor_name` on `StudentPaymentRecord` during `recordPayment` and `reconcileDualLedgers`, forwarded them in `approvals/page.tsx` `loadData()`, and resolved `counsellorName` strictly from authoritative assignment (`effectiveAdm?.counsellor_name || p.counsellor_name || counsellorStaff?.full_name || 'Unassigned'`), never substituting `recorded_by_name`.
4. **Missing Bank Account Holder on 18 Historical Snapshot Payments (`spr-pay-spr-*`):**
   - Read-only inspection of `public.fee_workflow_state` (`revision = 35`) showed 19 `studentPayments`:
     - **1 recent payment** (`spr-1795607574382-67k9`, `ADM-2026-0025`) has `our_bank_profile_id: 'bank-acc-14'`, `our_bank_account_name: 'T Usha'`, `student_unique_id: 'NGERP-2026-00001'`, `counsellor_name: 'Vineethaa'`, and `phone`.
     - **18 historical payments** (`spr-pay-spr-*`, `ADM-2026-0001`..`0023`) had `null` bank fields on the `studentPayments` row, **while `snapshot->'auditLogs'` (`PAYMENT_SUBMITTED`/`PAYMENT_RECORDED`) retained the exact `our_bank_name` and `our_bank_account_name` for all 18 payments** (e.g. `E Anasuya`, `Katari Charitha`, `B Jyothi`, `K Munemma`).
   - **Fix:** Added read-only audit-log evidence lookup (`store.auditLogs` matching `record_id === p.id` with `our_bank_profile_id` or `our_bank_name + our_bank_account_name`) in `approvals/page.tsx` without mutating historical DB rows and without ever matching by bank name alone.

## 2. Production Payment Audit Summary (`fee_workflow_state`, Read-Only)
- **Total recorded payments in snapshot:** `19` (`11` Pending Approval, `8` Approved & Cleared, `0` Rejected)
- **Bank accounts resolved directly on payment row:** `1` (`bank-acc-14` / `T Usha`)
- **Bank accounts recoverable from exact `PAYMENT_SUBMITTED` audit log evidence:** `18` (`18/18` have `our_bank_name` + `our_bank_account_name`)
- **Genuinely missing bank accounts after audit resolution:** `0` (for any future row lacking both payment & audit bank ID, `'Bank Account Verification Required'` is retained)
- **Resolved counsellors (snapshot admissions):** `1` (`ADM-2026-0025` → `Vineethaa`); `18` historical rows lack `admissions` entries in snapshot and display `'Unassigned'` unless linked via admission/counsellor assignment (never fabricated from `recorded_by_name`).
- **Resolved phone numbers (snapshot students):** `1` (`ADM-2026-0025`); `18` historical rows lack `students` entries in snapshot and display `'Not Provided'` (never fabricated).
- **LMS IDs:** `1` (`NGERP-2026-00001`); `18` historical rows previously displayed internal UUIDs and now display `'Registration Pending'` instead of leaking UUIDs.

## 3. Files Modified & Created
- `lib/services/payment-workflow-transaction.ts`
- `lib/services/fee-workflow-service.ts`
- `lib/services/data-store.ts`
- `types/index.ts`
- `app/(dashboard)/accounts/approvals/page.tsx`
- `tests/fee-approval-desk-data-mapping.test.ts` (New — 26 tests covering `FAD-001` through `FAD-030`)
- `fee-approval-desk-data-mapping-report.md` (New)

## 4. Verification Results
- `tests/fee-approval-desk-data-mapping.test.ts`: Passed
- `tests/production-data-integrity.test.ts` (TASK-01): `40/40` passed
- `tests/backend-synchronization-task-02.test.ts` (TASK-02 sync): `60/60` passed
- `tests/backend-synchronization-task-02-hardening.test.ts` (TASK-02 hardening): `31/31` passed
- `tests/financial-transaction-consistency-task-03.test.ts` (TASK-03): `101/101` passed
- TypeScript (`tsc --noEmit`), ESLint (`0` errors), Next.js build (`52/52` pages): Passed

## 5. Final Recommendation
- **GO** for deployment to `main` and live accountant verification on `https://next-gen-lms-omega.vercel.app/accounts/approvals`.
