# TASK-05 — PDF Branding Regression & Document Integrity Report

## 1. Executive Summary
- **Task ID:** TASK-05
- **Tested Baseline:** `db7002b` (TASK-04 closure) -> TASK-05 fix in [lib/services/pdf-service.ts](lib/services/pdf-service.ts) + [tests/task-05-pdf-qa-and-security.test.ts](tests/task-05-pdf-qa-and-security.test.ts).
- **Result:** Resolved the remaining `tests/pdf-generation.test.ts` failure (`25/25` passing), verified `bug-18` (`12/12`), `bug-20` (`10/10`), `task-05-pdf-qa-and-security.test.ts` (`3/3`), `patch-pdfkit.js` idempotency, `tsc` (`0` errors), `eslint` (`0` errors, `0` warnings), `next build` (`52/52` routes), and full 132-file Vitest run (`2,155/2,162` passed, `0` PDF failures).

## 2. Original Failing PDF Test & Exact Root Cause
- **Failing Test:** `tests/pdf-generation.test.ts > PDF Generation Service & API Routes > generateReceiptPdfBuffer > prints payment and balance without tax details, including for historical receipts` (line 86).
- **Expected:** `expect(text).not.toMatch(/GST|IRN|Tax|LEGACY-INVOICE-ID|LEGACY-GST-ID/)`
- **Actual Received Text:** `...Phone: +91 90003 33859  |  GST: LEGACY-GST-IDOFFICIAL FEE RECEIPT...`
- **Responsible File:** [lib/services/pdf-service.ts](lib/services/pdf-service.ts) (lines 105–110).
- **Root Cause (Actual Document Defect):** Unlike the initial audit hypothesis of an `ERP` branding conflict, `generateReceiptPdfBuffer()` still appended `gst ? 'GST: ' + gst : ''` to `contactLine` on Official Fee Receipts when `receipt.institute_gst` was populated (including historical receipts with `LEGACY-GST-ID` or settings fallbacks).
- **Fix Applied:** Updated `generateReceiptPdfBuffer()` in `lib/services/pdf-service.ts` so `contactLine` outputs only `Phone: ${phone}` on Official Fee Receipts (preserving `institute_gst` on Tax/Fee Invoices in `lib/services/invoice-pdf-service.ts`).

## 3. Approved Branding Audit & Complete Existing PDF Document Inventory (Phase C & E)
- **Authoritative Branding (`lib/constants/branding.ts`):**
  - `OFFICIAL_INSTITUTE_NAME`: `Next-Gen ERP Solutions`
  - `OFFICIAL_INSTITUTE_ADDRESS`: `Pillar No 707, Flat No. 502, 5th Floor, Plot No 129, PJR ARCADE Sri Sai Nagar Colony, near JNTU, opp. Sri Chaitanya Junior Kalasala, Jawaharlal Nehru Technological University, Hyderabad, Telangana 500085`
  - `OFFICIAL_INSTITUTE_PHONE`: `+91 90003 33859`
  - `OFFICIAL_LOGO_PATH`: `/branding/nextgen-logo.png` (`480x182`, aspect ratio `2.63736`)
  - `OFFICIAL_RECEIPT_TERMS`: 3 approved non-late-fee conditions.

| Document Type | Source / Service | API Route | Authorized Roles | Approved Branding | Status |
|---|---|---|---|---|---|
| **Official Fee Receipt** | `lib/services/pdf-service.ts` (`generateReceiptPdfBuffer`) | `GET /api/receipts/[id]/pdf` & `/api/fees/receipts/[id]/pdf` | `super_admin`, `admin`, `accountant`, `counsellor`, own `student` | `Next-Gen ERP Solutions` + logo (no GST) | **PASS** |
| **Fee / Tax Invoice** | `lib/services/invoice-pdf-service.ts` (`generateInvoicePdfBuffer`) | `GET /api/invoices/[id]/pdf` & `/api/fees/invoices/[id]/pdf` | `super_admin`, `admin`, `accountant`, `counsellor`, own `student` | `Next-Gen ERP Solutions` + logo | **PASS** |
| **Student Fee Statement** | `lib/services/student-fee-statement-pdf.ts` (`generateStudentFeeStatementPdf`) | `GET /api/fees/statements/[id]?format=pdf` | `super_admin`, `admin`, `accountant`, `counsellor`, own `student` | `Student Fee Statement` (ledger summary) | **PASS** |
| **Course Completion Certificate** | `lib/services/pdf-service.ts` (`generateCertificatePdfBuffer`) | `GET /api/certificates/[id]/pdf` | Public valid/non-revoked ledger verification (`410` if revoked) | `NEXT-GEN ERP SOLUTIONS` + SAP emblem | **PASS** |
| **Expense Vouchers / Progress Reports / Placement Docs** | N/A | N/A | N/A | N/A | **NOT APPLICABLE** (no PDF generator in repo) |

## 4. PDFKit Patch Idempotency (Phase K)
Executed `node scripts/patch-pdfkit.js` repeatedly in `wt-task05-closure` after `npm ci`:
- Output on both runs: `[patch-pdfkit] Already cleanly patched: pdfkit.node.mjs` and `pdfkit.js`.
- Verified `const _INLINED_STANDARD_FONTS` appears **exactly once** in `pdfkit.node.mjs`.


---

## Final Integration & Full Regression Closure (2026-11-26)
- **Full Regression Suite (`task-05-final-closure`):** **130/135 files passed**, **2,210/2,216 tests passed** (`0` PDF failures, `0` new regressions; only the 6 pre-existing unrelated failures remain).
- **PDF Targeted Suites:** `pdf-generation.test.ts` (`25/25`), `bug-18-fee-receipt-branding.test.ts` (`12/12`), `bug-20-standardize-invoices.test.ts` (`10/10`), `task-05-pdf-qa-and-security.test.ts` (`3/3`) — **50/50 passed**.
- **Static & Build Checks:** `tsc --noEmit` (`0` errors), `npm run lint` (`0` errors, `0` warnings), `npm run build` (`52/52` routes).
