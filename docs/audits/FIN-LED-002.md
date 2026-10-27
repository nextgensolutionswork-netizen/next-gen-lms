# FIN-LED-002 Audit Remediation: Student Fee Account Lookup

| Parameter | Value |
| :--- | :--- |
| **Defect ID** | FIN-LED-002 |
| **Module** | Accounts & Finance / Student Fee Accounts Ledger |
| **Target Route** | `http://localhost:3001/accounts/fees` |
| **Reported Issue** | Searching for "Amit Gupta" in Student Fee Ledger returned "No student fee accounts found", despite verified receipt `REC-2026-0001` and approved fee record |
| **Severity** | High (Financial Visibility & Operational Block) |
| **Status** | **RESOLVED & VERIFIED** |
| **Environment** | Local Staging (Port 3001, isolated Supabase `neiccpnxftfmmwnvtgdy`, production blocklisted) |
| **Resolution Evidence** | `docs/audits/fin-led-002-resolved.png` |

---

## 1. Root Cause Analysis

Detailed investigation across the PostgreSQL schema, workflow state persistence, and client-side ledger rendering identified four compounding factors:

1. **Relational Schema vs. In-Memory DTO Discrepancy:**
   - In Supabase PostgreSQL table `student_fee_accounts`, columns are strictly normalized: `id, student_id, admission_id, original_fee, discount, net_payable, collected_amount, outstanding_balance, status, tenant_id`.
   - The table does *not* contain `student_name` or `course_name` columns (which reside in `students` and `courses`/`admissions`).
   - The TypeScript frontend model `StudentFeeAccount` expects `student_name?: string` and `course_name?: string`, as well as `paid_amount` and `outstanding_amount` (matching legacy fields rather than raw PostgreSQL column names `collected_amount` and `outstanding_balance`).

2. **In-Memory Enrichment Failure:**
   - When fee accounts were loaded into memory from Supabase or restored from `fee_workflow_state.snapshot`, raw rows lacked `student_name` and `course_name`.
   - `fa.paid_amount` and `fa.outstanding_amount` were `undefined` because raw rows had `collected_amount` and `outstanding_balance`.
   - In `reconcileDualLedgers()`, the synchronization between `this.feeAccounts` and `this.studentFees` evaluated `fa.paid_amount` and `fa.outstanding_amount` as `undefined`, failing to populate student names or balance amounts.

3. **Strict Client-Side Filter:**
   - In `app/(dashboard)/accounts/fees/page.tsx`:
     ```tsx
     list = list.filter((f) =>
       f.student_name?.toLowerCase().includes(q) ||
       f.course_name?.toLowerCase().includes(q) ||
       f.student_id?.toLowerCase().includes(q)
     );
     ```
   - When the user typed `Amit Gupta`, `f.student_name` was `undefined`, evaluating to `undefined?.includes(...) -> undefined` (falsy). The filter dropped the account and displayed the empty state: *"No student fee accounts found"*.

4. **Snapshot Persistence in Staging Database:**
   - `fee_workflow_state` table in Supabase persisted the un-enriched snapshot. Read-only requests to `/api/fees/payments` returned this snapshot without triggering on-the-fly reconciliation.

---

## 2. Comprehensive Remediation

### 2.1 Dual-Ledger Normalization & Relational Enrichment (`lib/services/data-store.ts`)
- Added **Step 0 Pre-Normalization** in `reconcileDualLedgers()`:
  - Maps `paid_amount` from `collected_amount` and `outstanding_amount` from `outstanding_balance` defensively.
  - Joins each fee account with `this.students`, `this.admissions`, and `this.courses` to populate `student_name`, `course_id`, `course_name`, and `admission_number`.
  - Normalizes PostgreSQL status values (`Partial`, `Pending`) into UI status values (`Partially Paid`, `Unpaid`, `Paid`).
  - Ensures synchronization back and forth between `this.studentFees` and `this.feeAccounts` never overwrites valid numeric balances with `undefined`.

### 2.2 Reactive Reconciliation on Snapshot Merge (`lib/services/payment-workflow-state.ts`)
- Updated `mergeWorkflowSnapshot()` to invoke `store.reconcileDualLedgers()` immediately upon receiving any snapshot from `/api/fees/payments` or Supabase transaction RPCs.

### 2.3 Resilient Multi-Field Search & Defective-State Defense (`app/(dashboard)/accounts/fees/page.tsx`)
- Extended the ledger search bar to check:
  - `student_name`
  - `course_name`
  - `student_id`
  - `admission_id`
  - `admission_number` (from linked student)
  - `student_code` (e.g. `STU-2026-001`)
  - `email` (e.g. `amit.gupta@student.next-gen.com`)
- Added row-level defensive fallback in `map(fa => ...)` to resolve `studentName` and `courseName` from `store.students` even during transient state transitions.
- Adjusted status badge and `Collect` button logic to evaluate `safeAmount(fa.outstanding_amount ?? fa.outstanding_balance)`.

### 2.4 Staging Database State Synchronization
- Reconciled and committed the corrected snapshot to Supabase staging table `fee_workflow_state` for tenant `default` via the `commit_fee_workflow` RPC (incrementing revision to 12).

---

## 3. Verification & Evidence

### 3.1 Playwright Verification (`scripts/verify-fin-led-002.mjs`)
Executed an automated browser audit against `http://localhost:3001`:

```text
--- Starting FIN-LED-002 Verification ---
1. Setting authenticated session cookies for Admin...
2. Navigating to http://localhost:3001/accounts/fees...
Page heading: Student Fee Accounts Ledger
Found 7 total rows in ledger.
 Row [0]: Bharadwaz Naidu SAP S/4HANA Finance (FICO) ₹45,000 -₹5,000 ₹40,000 ₹10,000 ₹30,000 Partially Paid Collect
 Row [1]: Vikas Sharma SAP S/4HANA Finance (FICO) ₹45,000 -₹5,000 ₹40,000 ₹0 ₹40,000 Unpaid Collect
 Row [2]: Workflow Candidate 8974 SAP S/4HANA Finance (FICO) ₹45,000 — ₹45,000 ₹0 ₹45,000 Unpaid Collect
 Row [3]: Workflow Candidate 4377 SAP S/4HANA Finance (FICO) ₹45,000 — ₹45,000 ₹0 ₹45,000 Unpaid Collect
 Row [4]: Workflow Candidate 1089 SAP S/4HANA Finance (FICO) ₹45,000 — ₹45,000 ₹0 ₹45,000 Unpaid Collect
 Row [5]: Amit Gupta SAP S/4HANA Finance (FICO) ₹45,000 -₹5,000 ₹40,000 ₹20,000 ₹20,000 Partially Paid Collect
 Row [6]: Sneha Kulkarni SAP S/4HANA Sourcing & Procurement (MM) ₹40,000 — ₹40,000 ₹40,000 ₹0 Paid Cleared
SUCCESS: Amit Gupta found in initial ledger: Amit Gupta SAP S/4HANA Finance (FICO) ₹45,000 -₹5,000 ₹40,000 ₹20,000 ₹20,000 Partially Paid Collect
3. Searching for "Amit Gupta"...
Rows matching "Amit Gupta": [
  'Amit Gupta SAP S/4HANA Finance (FICO) ₹45,000 -₹5,000 ₹40,000 ₹20,000 ₹20,000 Partially Paid Collect'
]
SUCCESS: Amit Gupta row matched search: Amit Gupta SAP S/4HANA Finance (FICO) ₹45,000 -₹5,000 ₹40,000 ₹20,000 ₹20,000 Partially Paid Collect
SUCCESS: Financial amounts verified (Net ₹40,000, Paid ₹20,000, Due ₹20,000)
SUCCESS: Verified "Collect" action button is available for Amit Gupta
4. Searching by admission code "ADM-2026-001"...
SUCCESS: Search by ADM-2026-001 matched Amit Gupta
5. Searching for "Sneha Kulkarni"...
Rows matching "Sneha Kulkarni": [
  'Sneha Kulkarni SAP S/4HANA Sourcing & Procurement (MM) ₹40,000 — ₹40,000 ₹40,000 ₹0 Paid Cleared'
]
SUCCESS: Sneha Kulkarni verified as fully Cleared/Paid
Saved resolution screenshot to docs/audits/fin-led-002-resolved.png
====================================================
🎉 FIN-LED-002 VERIFICATION COMPLETED SUCCESSFULLY!
====================================================
```

### 3.2 Regression Test Suite Results
Executed Vitest test suites:
- `tests/pdf-generation.test.ts`: **25 / 25 PASS**
- `tests/receipt-financial-guard.test.ts`: **5 / 5 PASS**
- `tests/critical-p0-fixes.test.ts`: **15 / 15 PASS**
- Total: **45 / 45 PASS (100% green)**

---

## 4. Verification Checkpoint

| Check | Expected | Actual | Result |
| :--- | :--- | :--- | :--- |
| **Search by Student Name** | Shows "Amit Gupta" | Row rendered with Net ₹40,000, Paid ₹20,000, Outstanding ₹20,000 | **PASS** |
| **Search by Admission No.** | Matches `ADM-2026-001` | Displays Amit Gupta | **PASS** |
| **Collect Action Button** | Present when balance > 0 | "Collect" button rendered leading to `/accounts/payments` | **PASS** |
| **Cleared Account Status** | Displays "Cleared" badge | Sneha Kulkarni displayed as Paid / Cleared (₹0 balance) | **PASS** |
| **Production Isolation** | Production DB untouched | Zero connections to `tgohtdzwehhjfahtgovq.supabase.co` | **PASS** |
| **Zero Cost Impact** | No billable services created | Local staging environment on port 3001 | **PASS** |
