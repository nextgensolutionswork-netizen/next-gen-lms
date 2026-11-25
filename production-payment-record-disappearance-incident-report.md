# P0 Incident Report — All 19 Payment Records Missing From Production Fee Approval Desk

## A. Executive Summary
- **Incident:** Live production `/accounts/approvals` transitioned from displaying **19 recorded payments** (`11` Pending Approval, `8` Approved & Cleared) to **0 recorded payments** (`Pending: 0`, `Approved: 0`, `Verified Collections: ₹0`).
- **Confirmed Root Cause:** Architectural split-brain between `commit_fee_workflow` RPC (which writes **only** to `public.fee_workflow_state` JSONB and `public.student_lms_access`, **never** to `public.admissions`, `public.students`, `public.payments`, or `public.receipts`) and TASK-01 snapshot pruning in `lib/services/payment-workflow-transaction.ts` (introduced in `1dcca99`, which prunes `fee_workflow_state` against normalized PostgreSQL tables whenever a transaction runs).
- **Production Safety:** Zero production records were modified or restored during this investigation. Report submitted for explicit authorization before executing any recovery or schema/RPC alignment.

---

## B. Confirmed Root Cause
1. `commit_fee_workflow(p_tenant, p_revision, p_snapshot)` (from `supabase/migrations/20261012094737_payment_approval_workflow.sql`) updates **only** `public.fee_workflow_state` and `public.student_lms_access`. It does **not** insert rows into `public.admissions`, `public.students`, `public.student_fee_accounts`, `public.payments`, or `public.receipts`.
2. Furthermore, `public.courses` in Supabase `tgohtdzwehhjfahtgovq` has **`0` rows**, while `public.admissions.course_id` has a foreign key `REFERENCES courses(id)`.
3. In `1dcca99` (TASK-01), `paymentTransaction` added pruning:
   - Queries `public.admissions`, `public.students`, `public.payments`, `public.receipts`.
   - Filters `store.*` to keep only IDs present in those normalized tables (`store.studentPayments` filtered by `validStudentIds`).
4. When a write transaction (`!readOnly`) ran at **`2026-11-25 12:39:32 UTC` (`18:09:32 IST`)** (moving `fee_workflow_state` from `revision 35` to `revision 37`), `paymentTransaction` queried the empty normalized tables (`0` rows), pruned all `19` payments, `1` student, and `1` admission out of `store.*`, and committed the resulting empty `[]` snapshot back to `public.fee_workflow_state` (`revision 37`).

---

## C. Incident Timeline (UTC & IST)
| Timestamp (UTC) | Timestamp (IST) | Event | Evidence |
|---|---|---|---|
| `2026-11-25` (Pre-TASK-01) | Earlier today | Normalized tables (`admissions`, `students`, `payments`, `receipts`) cleaned to `0`; `fee_workflow_state` retained 18 historical `spr-pay-spr-*` payment records | `public.fee_workflow_state` snapshot inspection |
| `2026-11-25 09:18 UTC` | `14:48 IST` | Commit `1dcca99` added snapshot pruning in `paymentTransaction` against normalized tables | `git show 1dcca99` |
| `2026-11-25 11:52:50 UTC` | `17:22:50 IST` | Live admission `ADM-2026-0025` (`NGERP-2026-00001`, payment `spr-1795607574382-67k9`, bank `bank-acc-14` / `T Usha`, counsellor `Vineethaa`) created via `POST /api/admissions` (`idempotency_key: d2215990-1d0a-4dd6-bcc6-8ec2dc18f635`) | `public.idempotency_keys` & `fee_workflow_state` `revision = 35` |
| `2026-11-25 12:18:34 UTC` | `17:48:34 IST` | Read-only SQL audit confirmed `fee_workflow_state` `revision = 35` had `19` `studentPayments`, `19` `payments`, `1` `student`, `1` `admission` | Supabase MCP `execute_sql` |
| `2026-11-25 12:35:00 UTC` | `18:05:00 IST` | Commit `2e9c79b` deployed to production | Vercel deployment `Ready` |
| `2026-11-25 12:39:32 UTC` | `18:09:32 IST` | A write transaction (`!readOnly`) ran via `paymentTransaction`, pruned `revision 35` against `0`-row normalized tables, and committed empty `[]` snapshot at `revision = 37` | `public.fee_workflow_state` (`revision = 37`, `updated_at = 12:39:32.825116+00`) |

---

## D. Actual Production Database & Tenant Verification
Supabase project: **`tgohtdzwehhjfahtgovq`**, tenant: **`default`**.

| Table | Total Count | Notes |
|---|---:|---|
| `leads` | 27 | Intact (`26` + `1` new live lead at `11:47 UTC`) |
| `profiles` | 8 | Intact |
| `courses` | 0 | Empty (authoritative courses currently defined in code only) |
| `admissions` | 0 | Normalized table empty (`commit_fee_workflow` never inserted here) |
| `students` | 0 | Normalized table empty |
| `student_fee_accounts` | 0 | Normalized table empty |
| `installments` | 0 | Normalized table empty |
| `payments` | 0 | Normalized table empty |
| `receipts` | 0 | Normalized table empty |
| `audit_logs` | 37 | CRM & Vendor/Expense logs intact (`LEAD_CREATED`, `EXPENSE_RECORDED`, `VENDOR_*`) |
| `idempotency_keys` | 1 | `d2215990-1d0a-4dd6-bcc6-8ec2dc18f635` (`admission_create`, `completed` at `11:52:55 UTC`) |
| `fee_workflow_state` | 1 | `tenant_id='default'`, `revision=37`, all JSONB entity arrays now `0` |

---

## E. Location and Status of the 19 Previously Displayed Payments
Captured during our read-only inspection of `fee_workflow_state` (`revision = 35`) at `17:48 IST` prior to `revision 37`:
1. **1 Legitimate Newly Created Admission & Payment (`11:52:55 UTC` / `17:22:55 IST`):**
   - Payment ID: `spr-1795607574382-67k9` | Student ID: `ed0378b7-9213-4e23-ba01-00eefda4ecbc` (`NGERP-2026-00001`) | Admission: `ADM-2026-0025` | Mode: `UPI` | Status: `Pending Approval` | Bank: `bank-acc-14` (`T Usha`, `Canara - Thenebanda`) | Counsellor: `Vineethaa`.
2. **18 Historical Snapshot-Only `studentPayments` (`ADM-2026-0001` through `ADM-2026-0023`):**
   - `10` Pending Approval (`spr-pay-spr-1795586687996-44l1` .. `spr-pay-spr-1795512691590-se5a`, recorded by Sandhya, Radhika, Mohan Reddy, Amulya)
   - `8` Approved (`spr-pay-spr-1795498742419-wv2d` .. `spr-pay-spr-1795457567334-88fr`, recorded by Dilip Palukuri)
   - These 18 rows had **no** corresponding `admissions` or `students` records in `fee_workflow_state` (`revision = 35`) or in normalized PostgreSQL tables because their parent admissions/students had been cleaned prior to TASK-01. Audit log entries (`PAYMENT_SUBMITTED`) existed in `snapshot->'auditLogs'` at `revision = 35`.

---

## F. Snapshot Investigation Results & G. Deletion Evidence
- **Was there a `DELETE` or `TRUNCATE` SQL command executed against `public.payments` after `11:52 UTC`?** No. `public.payments` already had `0` rows before `11:52 UTC`.
- **How were the 19 rows removed from `fee_workflow_state`?** Via `commit_fee_workflow` (`revision 35 -> 37` at `12:39:32 UTC`), when `paymentTransaction` pruned `fee_workflow_state` against empty normalized tables (`admissions=0`, `students=0`, `payments=0`, `receipts=0`) and persisted the pruned `[]` snapshot.

---

## H. Financial Impact Assessment & I. Code Findings
- **Scenario Classification:** **Combination of Scenario B (18 prior records had already been cleaned from normalized `admissions`/`students`/`payments`) and Scenario D/C (`ADM-2026-0025` was a legitimate live record created at `11:52:55 UTC` that existed only in `fee_workflow_state` and was unintentionally pruned at `12:39:32 UTC`).**
- **Root Architectural Gap:** `commit_fee_workflow` + `paymentTransaction` cannot safely run TASK-01 normalized-table pruning until writes (`POST /api/admissions`, `POST /api/fees/payments`, etc.) **also persist to the normalized PostgreSQL tables** (starting with seeding `public.courses` with the 6 `AUTHORITATIVE_TRAINING_COURSES` so `admissions.course_id` FK succeeds!).

---

## J & K. Proposed Recovery Plan & Record-Level Eligibility (Requires Explicit Authorization)
1. **Do NOT blindly restore all 19 records:**
   - **18 Historical Records (`ADM-2026-0001`..`0023`):** Verify with business stakeholders whether these were intentionally cleaned before TASK-01. They currently have no parent `students` or `admissions` rows in PostgreSQL. Only restore if business confirms they are active production enrollments and Point-in-Time Recovery (PITR) in Supabase is used to extract their parent `admissions`/`students` records from before the cleanup.
   - **1 Live Record (`ADM-2026-0025`, `spr-1795607574382-67k9`):** Confirmed legitimate live creation at `11:52:55 UTC` (`public.idempotency_keys` `d2215990-1d0a-4dd6-bcc6-8ec2dc18f635`). Eligible for immediate PITR recovery (extracting `fee_workflow_state` at `2026-11-25 12:00:00 UTC` via Supabase PITR) once authorized.
2. **Permanent Architectural Fix (Requires Authorization):**
   - Seed the authoritative configured courses (`c1000000-0000-4000-a000-000000000101`..`0106`) into `public.courses`.
   - Extend `commit_fee_workflow` (via reviewed migration) or `paymentTransaction` to upsert `admissions`, `students`, `student_fee_accounts`, `installments`, `payments`, and `receipts` into PostgreSQL normalized tables on every `!readOnly` commit so normalized PostgreSQL and `fee_workflow_state` never diverge.

---

## L. Regression & Build Results
- Created [payment-record-disappearance-regression.test.ts](file:///E:/my%20erp%20hub/next%20gen%20lms/tests/payment-record-disappearance-regression.test.ts) (`9/9` tests verifying normalized visibility, empty DB handling, TASK-01 pruning, DB error fail-closed behavior, stale snapshot override protection, counts, bank/counsellor/phone/LMS mappings, tenant isolation, and reconciliation).

---

## M. Production Data Safety Verification
- Zero writes, deletes, resets, or `fee_workflow_state` modifications were performed during this investigation.

---

## N. Git & Deployment Details
- Investigation & regression suite added locally; **no production data recovery executed**.

---

## O. Remaining Blockers & Assumptions
1. Supabase Point-in-Time Recovery (PITR) or backup inspection at `2026-11-25 12:00:00 UTC` (`revision 35`) is required to recover the exact full JSONB payload of `ADM-2026-0025` (and, if authorized, the 18 prior records).
2. Explicit authorization is required to: (a) seed `AUTHORITATIVE_TRAINING_COURSES` into `public.courses`, (b) align `commit_fee_workflow` / `paymentTransaction` to persist to normalized PostgreSQL tables, and (c) execute record-level PITR recovery.

---

## P. Final Recommendation
- **NO-GO** for blindly clearing or ignoring the empty Approval Desk; **REQUEST AUTHORIZATION** for:
  1. Extracting `fee_workflow_state` `revision = 35` (`2026-11-25 12:00:00 UTC`) via Supabase PITR in an isolated branch/environment.
  2. Persisting `public.courses` (`AUTHORITATIVE_TRAINING_COURSES`) and migrating `commit_fee_workflow` / `paymentTransaction` to write directly to normalized PostgreSQL tables (`admissions`, `students`, `student_fee_accounts`, `payments`, `receipts`) so TASK-01 pruning never wipes newly created records.
