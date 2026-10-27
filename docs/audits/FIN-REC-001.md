# FIN-REC-001 — Receipt Amount Mismatch Investigation & Resolution

**Bug Reference:** FIN-REC-001  
**Severity / Priority:** P1 (Financial Integrity & Display Consistency)  
**Status:** **RESOLVED & VERIFIED LIVE ON PORT 3001**  
**Evidence Artifacts:**
- Before screenshot: `docs/audits/reproduce-fin-rec-001-before.png` (displayed ₹0)
- After screenshot: `docs/audits/fin-rec-001-after.png` (displays ₹20,000)

---

## 1. Investigation: Root Cause Identification

The audit was requested to determine whether the ₹0 display issue was caused by:
1. **Underlying financial records**
2. **Stale data**
3. **Incorrect field mapping**

### A. Underlying Financial Records: PASS (Intact & Non-Corrupt)
Direct inspection of the staging Supabase PostgreSQL database tables revealed:
- **`payments` table:**
  - `id`: `61000000-0000-0000-0000-000000000001`
  - `receipt_number`: `REC-2026-0001`
  - `amount`: `20000`
  - `payment_mode`: `UPI`
  - `transaction_reference`: `UPI-98234827104`
  - `status`: verified historical transaction
- **`receipts` table:**
  - `id`: `81000000-0000-0000-0000-000000000001`
  - `receipt_number`: `REC-2026-0001`
  - `payment_id`: `61000000-0000-0000-0000-000000000001`
  - `student_name`: `Amit Gupta`
  - `amount`: `20000`
  - `amount_in_words`: `Twenty Thousand Rupees Only`
  - `payment_mode`: `UPI`
  - `transaction_reference`: `UPI-98234827104`

**Conclusion on records:** The database records are completely intact with the correct financial value of ₹20,000.

### B. Stale Data: PASS (Not Caused by Caching)
All receipt endpoints (`/api/fees/receipts`, `/api/receipts/[id]/pdf`) strictly enforce `Cache-Control: private, no-store` and dynamic execution (`export const dynamic = 'force-dynamic'`).

### C. Incorrect Field Mapping: CONFIRMED ROOT CAUSE
The bug was caused by a schema-to-frontend field name discrepancy:
- The Supabase SQL table `receipts` was designed with columns:
  - `amount` (numeric)
  - `receipt_date` (date)
  - `student_code` (varchar)
  - `issued_by` (uuid)
- The frontend TypeScript `Receipt` interface and newer workflow service methods expected:
  - `payment_amount` (number)
  - `payment_date` (string)
  - `admission_number` (string)
  - `authorized_by` (string)

When `paymentTransaction` bootstrapped raw database rows into `store.receipts`:
- The receipt object had `amount: 20000`, while `payment_amount` was `undefined`.
- In `app/(dashboard)/accounts/receipts/[id]/page.tsx`, the code called `formatINR(receipt.payment_amount)`.
- Because `formatINR(undefined)` returns `'₹0'`, the page displayed `₹0`.
- Similarly:
  - `amountToWordsINR(receipt.payment_amount)` printed `Rupees Only` (missing "Twenty Thousand").
  - `formatDate(receipt.payment_date)` printed `—` because `receipt_date` was not mapped.
  - `receipt.admission_number` was blank because `student_code` was not mapped.
  - `receipt.authorized_by` was blank because `issued_by` was not mapped.

---

## 2. Remediation Implemented

1. **Type Definitions ([`types/index.ts`](file:///e:/my%20erp%20hub/next%20gen%20lms/types/index.ts)):**
   - Added schema aliases to `interface Receipt`: `amount?: number`, `receipt_date?: string`, `student_code?: string`, `issued_by?: string`, `amount_in_words?: string`.

2. **Automatic Bidirectional Normalization ([`lib/services/data-store.ts`](file:///e:/my%20erp%20hub/next%20gen%20lms/lib/services/data-store.ts)):**
   - Inside `store.reconcileDualLedgers()`:
     - Automatically normalizes `payment_amount = r.amount ?? linkedPayment?.amount ?? 0` and mirrors `r.amount = r.payment_amount`.
     - Normalizes `payment_date = r.receipt_date ?? linkedPayment?.payment_date`.
     - Normalizes `admission_number = r.student_code ?? student?.admission_number`.
     - Normalizes `authorized_by = issuer?.full_name ?? 'Accounts Department'`.
     - Reconciles `remaining_balance` from student ledger / fee accounts.
     - Ensures any verified payment in `payments` or `studentPayments` with a receipt number has a corresponding receipt in `this.receipts`.

3. **Receipt Detail View ([`app/(dashboard)/accounts/receipts/[id]/page.tsx`](file:///e:/my%20erp%20hub/next%20gen%20lms/app/(dashboard)/accounts/receipts/[id]/page.tsx)):**
   - Uses normalized getters with safe fallbacks:
     - `paymentAmount = receipt.payment_amount ?? receipt.amount ?? 0`
     - `paymentDate = receipt.payment_date || receipt.receipt_date || receipt.created_at`
     - `admissionNumber = receipt.admission_number || receipt.student_code || '—'`
     - `authorizedBy = receipt.authorized_by || receipt.issued_by || 'Finance & Accounts Office'`
     - `remainingBalance = receipt.remaining_balance ?? 0`

4. **Receipts Registry List ([`app/(dashboard)/accounts/receipts/page.tsx`](file:///e:/my%20erp%20hub/next%20gen%20lms/app/(dashboard)/accounts/receipts/page.tsx)):**
   - Updated table row amounts to `r.payment_amount ?? r.amount ?? 0`.
   - Updated KPI card "Net Billed & Collected" sum to include `safeAmount(r.payment_amount ?? r.amount)`.
   - Updated CSV and Excel exports to populate from both field mappings.

5. **PDF Service ([`lib/services/pdf-service.ts`](file:///e:/my%20erp%20hub/next%20gen%20lms/lib/services/pdf-service.ts) & [`app/api/receipts/[id]/pdf/route.ts`](file:///e:/my%20erp%20hub/next%20gen%20lms/app/api/receipts/[id]/pdf/route.ts)):**
   - Safely accepts both field naming conventions while preserving strict validation against corrupted/negative records.

---

## 3. Live Verification Results on Port 3001

Playwright automated test script: `scripts/verify-fin-rec-001.mjs`

| Step | Check | Expected | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| 1 | Staff Login | Authenticate as Admin | Reached Dashboard | **PASS** |
| 2 | Payments Registry | `/accounts/payments` | Shows `REC-2026-0001` with `₹20,000` | **PASS** |
| 3 | Receipts Registry | `/accounts/receipts` | Shows `REC-2026-0001` with `₹20,000` | **PASS** |
| 4 | Receipt Detail Page | `/accounts/receipts/REC-2026-0001` | Displays `₹20,000` and `Twenty Thousand Rupees Only` | **PASS** |
| 5 | PDF Download API | `/api/receipts/REC-2026-0001/pdf` | HTTP 200, valid A4 vector PDF (`%PDF-`) | **PASS** |
| 6 | Unit Test Suite | `tests/pdf-generation.test.ts` | 25 / 25 tests passing | **PASS** |
| 7 | Full Vitest Suite | 57 test files | 709+ tests passing | **PASS** |
