# Direct Supabase verification — SA-003, SA-004, SA-005

Date: 2026-10-31, Asia/Calcutta. **Overall verdict: BLOCKED at the tenant-isolation safety gate.**

The user's instruction requires stopping if database identity or tenant isolation cannot be verified. Identity was established, but default-tenant isolation cannot be established for operating expenses. Further database queries stopped at that point. Monetary figures below are not certified. No production data, schema, RLS policy, assignment, or application code was modified.

## Connection identity and authorized access

- Local `.env.local` configuration resolves to `tgohtdzwehhjfahtgovq.supabase.co`; no credentials were printed. `NEXT_PUBLIC_APP_ENV` and `NODE_ENV` were unset in the inspected local configuration, so those variables do not independently prove the deployed runtime environment.
- The connected Supabase project list confirms project `tgohtdzwehhjfahtgovq`, name `next-gen lms`, region `ap-southeast-2`, status `ACTIVE_HEALTHY`. This matches the intended production project previously identified for this workspace; it is not a mock URL or a different staging project.
- Direct SELECT metadata returned database `postgres`, query role `postgres`, database timezone `UTC`, read timestamp `2026-10-31T06:45:27.12313Z` (12:15:27 IST).
- The database contains separate workflow rows for tenants `default` and `staging-isolated-tenant`. A staging-named tenant in the same project must not be confused with a separate staging database.
- Default snapshot: revision **75**, updated `2026-10-31T06:10:28.885156Z`. All inspected nested financial/admission/student rows were explicitly tagged `default`; zero foreign or untagged rows were found in those arrays.
- Queries used the authorized Supabase connector, not application credentials in a browser. Only two SELECT statements were executed: identity/tenant/RLS metadata and follow-up RLS mode/schema metadata. No role switching, session impersonation, application GET endpoints, or write-capable functions were executed.

## Isolation blocker

The actual `public.expenses` table has `id`, `amount`, `expense_date`, and `status`, but **no `tenant_id` column**. Its sole inspected policy is:

```text
Accounts manage expenses
PERMISSIVE, ALL, roles: public
get_current_user_role() = ANY (['super_admin','admin','accountant'])
```

The role helper returns the requesting profile's role and supplies no expense ownership constraint. Therefore this policy cannot demonstrate default-tenant expense isolation in a database containing multiple tenant snapshots. No cross-tenant browser access was attempted; this is a schema/policy finding, not a claimed observed data leak.

By contrast, `students`, `admissions`, `payments`, `receipts`, and `student_fee_accounts` have RLS enabled and an **AS RESTRICTIVE** `workflow_tenant_boundary` policy for authenticated users comparing `tenant_id` to the authenticated profile's tenant. These restrictive policies are not bypassed merely because a role-based permissive policy also exists. `fee_workflow_state` has RLS enabled and SELECT revoked from `anon` and `authenticated`; its application reads are server-side and explicitly tenant-filtered.

RLS catalog inspection confirms configured policies, not a full runtime test with authenticated tenant identities. The connector's `postgres` role is privileged and its successful SELECTs do not prove browser-level RLS behavior. Neither RLS nor grants were altered.

**Safety action:** stop before monetary/status/detail queries or further course-assignment verification. Do not presume untagged expenses belong to `default`, and do not certify an institute-wide expense sum as tenant-isolated without an explicit ownership model.

## Actual direct-database facts obtained before stopping

These counts are nested arrays in the authoritative default-tenant `fee_workflow_state.snapshot`, not counts of identically named relational tables:

| Snapshot collection | Actual count |
| --- | ---: |
| students | 22 |
| admissions | 22 |
| feeAccounts | 22 |
| studentFees | 22 |
| payments | 23 |
| studentPayments | 23 |
| receipts | 16 |
| studentFinancialLedgers | 34 |

Payments and studentPayments are overlapping representations. **23 + 23 must not be reported as 46 transactions**, and these counts alone neither validate nor disprove the Dashboard's 30 merged transactions. Approval statuses, eligibility, deduplication, receipt links, and ledger amounts were not queried after the blocker.

## Dashboard versus database comparison

| Metric | User-reported Dashboard | Direct database verification |
| --- | ---: | --- |
| Collections | ₹6,39,500 | BLOCKED; no eligible-payment sum calculated |
| Transactions | 30 | BLOCKED; 23 legacy and 23 advanced rows counted, overlap not reconciled |
| Outstanding fees | ₹5,65,500 | BLOCKED; 22 fee-account rows counted, amounts not summed |
| Operating expenses | ₹1,11,500 | BLOCKED; tenant attribution cannot be established |
| Enrolled students | 22 | 22 default snapshot students confirmed |
| FICO / MM / SD / ABAP | 17 / 2 / 1 / 2 | Not freshly recalculated in this run after isolation stop |
| Student Fee Ledger collected | ₹3,64,500 | BLOCKED; fee balances not summed |
| Collections minus Fee Ledger | ₹2,75,000 | Arithmetic from user-supplied totals only; database cause not certified |

The earlier SA-004 investigation and local resolver tests are historical supporting evidence, not a substitute for this requested direct-database verification. Their local PASS does not establish a PASS for this run.

## Confirmed source findings and limits

### Data loading and cached expenses

- `app/(dashboard)/dashboard/page.tsx:69` loads courses and line 70 refreshes the payment workflow; `lib/services/payment-workflow-transaction.ts:36` reads the tenant-filtered Supabase snapshot, and line 44 merges it. A missing snapshot triggers relational bootstrap at line 47.
- `lib/services/payment-workflow-state.ts:5` lists the refreshed snapshot keys. **Expenses are not included.** Dashboard reads `view.expenses` and aggregates Paid expenses at `app/(dashboard)/dashboard/page.tsx:217`. This route does not establish a fresh authoritative expense read. An expense amount already present in the local store can still supply the displayed value. The exact ₹1,11,500 value was not traced to database rows in this run.
- `lib/services/academics-service.ts:22` now explicitly propagates live catalog failures rather than returning cached courses; offline mode still intentionally uses the local adapter. `lib/services/payment-workflow-transaction.ts:31` selects the live or local adapter. Configuration-sensitive offline behavior is distinct from a verified live data read.

### Collections versus ledger

- `app/(dashboard)/dashboard/page.tsx:112` excludes Rejected advanced payments, but its synthesized records at line 134 can have status Pending. The period filter at line 178 checks dates/course, and the collections sum at line 204 sums their amounts **without a Success/Verified-only condition**. Legacy payment entries are also added before any eligibility filter.
- This confirms an inconsistent aggregation rule capable of counting nonapproved payments. It does **not** establish how much of the reported ₹2,75,000 gap comes from pending payments without the stopped status/amount queries.
- `app/(dashboard)/accounts/fees/page.tsx:74` refreshes the workflow; line 109 sums fee-account `paid_amount`. That is a different aggregation basis from the Dashboard's merged payment list.
- The Dashboard merges representations by receipt number or record ID. Duplicate economic transactions, mismatched legacy/advanced IDs, missing ledger links, voided receipts, and status differences remain unverified. Do not label ₹2,75,000 as a confirmed pending-payment total or duplicate-payment total.

### Date boundaries

- `app/(dashboard)/dashboard/page.tsx:147` implements date filtering with browser-local JavaScript Date calculations. It does not explicitly anchor boundaries to Asia/Kolkata. The database timezone is UTC; that setting alone does not fix browser-local filtering.
- Today is local midnight through local end-of-day; This Week starts Monday and ends at today's end-of-day. The month branch uses a trailing 30-day interval (today minus 29 days), despite the This Month label. All Time bypasses date filtering. Outstanding/roster figures are current balances/roster rather than period movements.
- For the requested timezone and report date, intended calendar Today is `[2026-10-31 00:00, 2026-11-01 00:00)` IST, equivalent to `[2026-10-30 18:30Z, 2026-10-31 18:30Z)`. Monday week start is `2026-10-26 00:00` IST. Calendar month start is `2026-10-01 00:00` IST; the current trailing-30-day branch starts October 2 instead. Whether the product intends a calendar month or a rolling window must be made explicit.
- These are source/expected-boundary observations; no period-specific database amounts were certified after the isolation blocker. No browser timezone test was performed.

## Verdicts

| Scope | Verdict | Reason |
| --- | --- | --- |
| SA-003 — Dashboard Filters | **BLOCKED** | Cannot finish authoritative, tenant-isolated period reconciliation; browser-local timezone and rolling-month semantics are confirmed source risks. |
| SA-004 — Course Mapping | **BLOCKED for this direct-DB run** | 22 default-tenant students confirmed, but current course distribution was not re-queried after the mandatory stop. Earlier local fix verification remains separate. |
| SA-005 — Revenue Accuracy | **BLOCKED** | Expense isolation fails the prerequisite; monetary sums, approvals, duplicate analysis, and the ₹2,75,000 gap remain unverified. Status-blind collection summing is a confirmed source defect. |

No scope is marked PASS based solely on expected values, cached figures, or earlier fixture tests.

## Recommended next steps — not applied

1. Establish and review expense ownership: either explicit tenant ownership with restrictive RLS and appropriately scoped reads, or a documented shared institute-expense model that does not present shared costs as tenant-isolated. Do not automatically assign existing expenses to a tenant.
2. After the isolation prerequisite is resolved or the scope is explicitly narrowed, repeat SELECT-only verification with tenant predicates. Reconcile snapshot and relational sources separately, join verified payments to fees/receipts/ledger entries, and deduplicate by stable payment identity before summing.
3. Make Dashboard collections use the same approved/nonvoided eligibility rule as fee balances. Show pending/failed/rejected payments separately. Investigate unmatched ledger links before changing balances.
4. Load expenses explicitly from their authorized authoritative source. Never silently treat a local-store expense total as a freshly verified Supabase total.
5. Define Asia/Kolkata period boundaries centrally with half-open ranges; label rolling 30 days distinctly from calendar month. Test midnight, Monday, month-start, and future-dated cases against SELECT-derived totals.
6. Retain the verified default-tenant course aliases and raw admission information. Re-run live, tenant-scoped course grouping after the safety gate is satisfied; do not update assignments merely to match expected Dashboard counts.

Evidence: [sanitized direct database metadata](sa-003-005-direct-db-evidence.json). No credentials or student personal information are included.
