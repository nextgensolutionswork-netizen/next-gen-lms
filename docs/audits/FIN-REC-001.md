# FIN-REC-001 — Receipt Amount Mismatch Investigation & Resolution

**Bug Reference:** FIN-REC-001  
**Severity / Priority:** P1 (Financial Integrity & Display Consistency)  
**Status:** **RESOLVED, HARDENED & VERIFIED LIVE ON PORT 3001**  
**Evidence Artifacts:**
- Before screenshot: `docs/audits/reproduce-fin-rec-001-before.png` (previously displayed ₹0)
- After screenshot: `docs/audits/fin-rec-001-after.png` (displays ₹20,000)
- Incomplete guard screenshot: `docs/audits/incomplete-financial-record-guard.png` (blocks finalized rendering & printing/downloading for unverified/zero records)

---

## 1. Investigation: Root Cause Identification

The audit evaluated whether the ₹0 display issue was caused by:
1. **Underlying financial records**
2. **Stale data**
3. **Incorrect field mapping**

### A. Underlying Financial Records: PASS (Intact & Non-Corrupt)
Direct inspection of PostgreSQL records in Supabase staging confirmed:
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
- Because `formatINR(undefined)` returns `'₹0'`, the page rendered **₹0**.
- Concurrently:
  - `amountToWordsINR(receipt.payment_amount)` printed `Rupees Only` (missing "Twenty Thousand").
  - `formatDate(receipt.payment_date)` printed `—` because `receipt_date` was not mapped.
  - `receipt.admission_number` was blank because `student_code` was not mapped.
  - `receipt.authorized_by` was blank because `issued_by` was not mapped.

---

## 2. Remediation Implemented

1. **Type Definitions ([`types/index.ts`](file:///e:/my%20erp%20hub/next%20gen%20lms/types/index.ts)):**
   - Added schema aliases to `interface Receipt`: `amount?: number`, `receipt_date?: string`, `student_code?: string`, `issued_by?: string`, and `amount_in_words?: string`.

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

## 3. Financial Completeness & Anti-Leak Guards (Zero-Amount / Unfinalized Protection)

To guarantee that incomplete financial records cannot briefly appear as finalized receipts, be printed, or be downloaded:

1. **Frontend Completeness Gate (`accounts/receipts/[id]/page.tsx`):**
   - Verified check: `isComplete = paymentAmount > 0 && Boolean(receipt.student_name) && Boolean(receipt.receipt_number)`.
   - When incomplete, the page **suppresses the official receipt layout**.
   - Instead, renders a dedicated **"Incomplete Financial Record"** alert screen explaining the restriction.
   - **Print, Download PDF, and WhatsApp Share buttons are strictly withheld**.
   - Page is marked `print:hidden` to suppress browser printing.

2. **Server-Side PDF Generation Guard (`lib/services/pdf-service.ts`):**
   - `generateReceiptPdfBuffer` strictly enforces `paymentAmount !== null && paymentAmount > 0`.
   - Zero or negative amounts throw `ReceiptPdfDataError('... has no valid payment amount. Incomplete or zero-amount receipts cannot be generated or downloaded.')`.

3. **API Endpoint Route Guard (`app/api/receipts/[id]/pdf/route.ts`):**
   - Rejects any receipt request where `effectiveAmount <= 0` or missing with **HTTP 422 Unprocessable Entity**.
   - Ensures no PDF stream can ever be generated or transmitted for incomplete records.

---

## 4. Test Evidence & Live Verification

### A. Vitest Financial Integrity Suite (`tests/receipt-financial-guard.test.ts`)
- `strictly forbids PDF generation for receipts with payment_amount: 0`: **PASS**
- `strictly forbids PDF generation for receipts with negative payment_amount`: **PASS**
- `permits PDF generation for valid, verified positive receipts`: **PASS**
- `returns HTTP 422 when attempting to download an unfinalized receipt with amount: 0`: **PASS**
- `returns HTTP 200 when downloading a finalized receipt with positive amount`: **PASS**

### B. Live Playwright Browser Verification on Staging Port 3001
- Verified `REC-2026-0001` renders finalized ₹20,000 receipt with download/print buttons: **PASS**
- Simulated incomplete financial record (`payment_amount: 0`):
  - Verified official receipt article is **NOT** rendered: **PASS**
  - Verified Print button is **NOT** rendered: **PASS**
  - Verified Download PDF button is **NOT** rendered: **PASS**
  - Verified Share button is **NOT** rendered: **PASS**
  - Verified Incomplete Financial Record warning is displayed: **PASS**
  - Captured screenshot: `docs/audits/incomplete-financial-record-guard.png`: **PASS**
