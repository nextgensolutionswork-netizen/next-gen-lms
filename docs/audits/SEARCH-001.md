# SEARCH-001 — Global search did not respond

**Priority:** P1.
**Issue:** Global search input did not respond to the Enter key or show results.
**Root Cause:**
1. The dashboard header had an unbound dummy input field without form submission or keydown handlers.
2. The search service queried non-existent column `admission_number` on the `receipts` table.
3. Workflow receipts (such as `REC-2026-000001`) are stored within tenant-scoped workflow state snapshots (`fee_workflow_state`), which require authoritative tenant access.

**Resolution:**
1. Replaced the dummy input in `components/layout/header.tsx` with an accessible, keyboard-navigable `GlobalSearch` component (`components/layout/global-search.tsx`) supporting Enter submission, search button click, ArrowUp/ArrowDown selection, Escape dismissal, and auto-dismiss on blur.
2. Implemented `/api/search` and `lib/services/global-search.ts` with multi-category search:
   - Students
   - Admissions
   - CRM Leads
   - Batches
   - Receipts (both `receipts` table and `fee_workflow_state` snapshot records)
3. Enforced tenant isolation and role-based permissions (`role === 'student'` restricted to personal records; counsellor/trainer/accounts/admin permissions applied per module).
4. Provided deep-links from search results to:
   - `/accounts/receipts/{receipt_number}` for receipts
   - `/students/{id}` for students
   - `/admissions?search={query}` for admissions
   - `/crm/leads?search={query}` for leads
   - `/academics/batches?search={query}` for batches

**Verification & Test Results:**
- **Unit Tests (`tests/global-search.test.ts`):** 6/6 tests passing (blank query, invalid query, permissions filtering, results structure).
- **Regression Suite (`tests/e2e/global-search-regression.mjs`):** Passed Enter submission, button submission, keyboard navigation, Escape dismissal, stale response cancellation.
- **Live Playwright Verification on Staging Port 3001 (`scripts/test-global-search-live.mjs`):**
  - Authenticated as Super Admin on `http://localhost:3001`.
  - Typed `REC-2026-000001` and pressed Enter.
  - Search results dropdown displayed matching receipt: `Workflow Candidate 6098 | Receipt · REC-2026-000001`.
  - Navigated to `http://localhost:3001/accounts/receipts/REC-2026-000001`.
  - Receipt details page loaded with HTTP 200 and rendered receipt content.
  - Screenshot captured at `docs/audits/global-search-receipt-success.png`.
