# Installment receipts and running fee statements

Open **Statement / Fee statement** from Student Fee Accounts Ledger, Payments, Receipts, or Admissions. Student 360 → Finance & Ledger embeds the same statement. Use **Download latest PDF** for a cumulative statement and the receipt links for individual documents.

The statement reads a fresh, tenant-scoped financial snapshot through `/api/fees/statements/[id]`. `?format=pdf` downloads the same projection. Authentication, staff roles and student ownership are checked server-side. A failed financial read returns 503 rather than cached financial information.

Approved payments are deduplicated across the legacy and modern ledgers. Pending and rejected payments do not reduce balances. Receipt reversals and processed refunds remain separate chronological entries. Posted fee revisions and standalone adjustments change the obligation without replacing the original invoice amount. Explicit installment allocations take priority; unallocated verified payments settle the oldest scheduled dues within the same fee account.

New approved fees and admissions retain an original invoice number, date and approved amount through subsequent revisions. Historical records without an invoice reference display **Not recorded**; no historical invoice references are invented. Existing receipt numbers, original amounts, tax fields, credit notes and audit records remain intact. Payment approval continues to use the existing atomic commit and separation-of-duties workflow.

## Verification

- Synthetic ₹45,000 fee with ₹5,000, ₹10,000 and ₹30,000 approvals: balances ₹40,000 → ₹30,000 → ₹0.
- Failed approval commit rolls back balances and receipt creation; repeated approval creates no duplicate receipt.
- Partial/full reversals, processed refunds, pending/rejected payments, standalone adjustments, duplicate mirrors/imports, due dates and report reconciliation tested.
- JSON/PDF endpoint, tenant/role/ownership checks, unavailable database behavior and actual PDF buffer generation tested.
- Relevant approval, dual-ledger and reconciliation regression suites passed.
- TypeScript and production build passed. Repository lint: zero errors; existing warnings remain. Focused lint on the new core implementation passed without warnings.
- Browser verification was not completed: automatic approval review blocked launching the isolated local LMS server with “blocked by policy.” No deployment was attempted and production student/financial records were not changed.

Tests use temporary storage via `tests/setup-storage.ts`; example payments are test fixtures only.
