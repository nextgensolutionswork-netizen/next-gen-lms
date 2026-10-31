# Expense tenant isolation — conditional proposal and ownership gate

Date: 2026-10-31. Project: `E:\my erp hub\next gen lms`.

**Recommendation: NO-GO. Implementation and staging validation stopped because historical local expense ownership cannot be established.**

This follows the explicit instruction: “Stop if historical tenant ownership cannot be established.” The material below records inspection findings and a conditional design, not an implemented, executable, or validated migration. No migration file was added to `supabase/migrations`, no migrations were executed, no RLS was disabled, and no existing records or application changes were altered.

## What was verified

Two SELECT-only Supabase queries inspected the current schema/policies and aggregated ownership evidence in project `tgohtdzwehhjfahtgovq` (`next-gen lms`). No credentials, invoice URLs, contact details, bank details, or student personal information were retrieved for the report.

At `2026-10-31T06:49:22.344624Z`:

- **`public.expenses` contains 0 records.** There are no existing relational expense rows to backfill at this observation time. This must be rechecked under a controlled migration window; it is not a permanent guarantee that the table stays empty.
- Both `default` and `staging-isolated-tenant` workflow snapshots contain 0 expense records.
- The local persisted store contains **3 expenses totaling ₹1,11,500**, all `Paid`, all without `tenant_id`, and none with `recorded_by`. IDs `exp-01`, `exp-02`, `exp-03` and their amounts correspond to the application seed records at `lib/services/data-store.ts:1321`.
- There is one local expense audit entry, but no verified tenant assignment manifest or historical ownership evidence for the three records. Local `paid_by` values and the application's default-tenant fallback are not sufficient proof of ownership. Seed correspondence is not proof that these entries should become real production expenses.
- Current profile membership must not be treated as historical expense ownership. In particular, `profiles.tenant_id` was introduced with a `default` default in the existing migration; that default is not a provenance record.

**Ownership disposition:** 0 verified tenant assignments for the 3 local records. Preserve them in place; do not import, relabel, delete, or silently count them as authoritative default-tenant expenses. Production relational history is empty, but replacing live-mode fallback without a reviewed disposition for these existing displayed/local records would leave the requested preservation and ownership requirements unresolved.

Evidence: [expense-tenant-ownership-evidence.json](expense-tenant-ownership-evidence.json).

## Actual schema and relationships

`public.expenses` has UUID `id`, required unique `voucher_number`, nullable `vendor_id`, `category`, positive `amount`, `expense_date`, `payment_mode`, `reference_number`, `invoice_url`, required `recorded_by`, `status`, `notes`, and `created_at`. There is no `tenant_id`.

- `recorded_by` references `profiles.id`.
- `vendor_id` references `vendors.id`, with `ON DELETE SET NULL`.
- `vendors` also lacks `tenant_id`, so vendor association cannot currently establish tenant ownership.
- Allowed expense statuses are `Pending`, `Approved`, and `Rejected`; database default is **Approved**.
- Categories and payment methods are constrained, and do not directly match all existing UI values.
- `Accounts manage expenses` is a permissive ALL policy for role-based Accounts/Admin access only. It does not impose tenant membership.
- The existing tenant architecture uses text tenant identifiers, authenticated membership in `profiles`, and restrictive `workflow_tenant_boundary` policies on other financial tables. `lib/auth/tenant.ts:5` maps untagged application objects to default; **do not reuse that fallback to assign expense ownership**.
- The inspected `audit_logs` policy allows public INSERT with `WITH CHECK true`. Existing audit rows alone should not be treated as independently trustworthy authorization evidence without provenance review.

## Identified application paths and dependencies

The source search covered `app`, `lib`, and `components`. These are the identified direct paths and shared-adapter dependencies; the generic adapter also requires review before claiming exhaustive runtime coverage.

| File / location | Behavior and required future work |
| --- | --- |
| `lib/services/finance-service.ts:529` | `getExpenses`: unscoped SELECT, nonempty-result-only acceptance, silent local fallback on errors/empty results. Require authenticated tenant-scoped reads and explicit errors. |
| `lib/services/finance-service.ts:552` | `createExpense`: local-first mutation/persistence, client-supplied actor lookup, `exp-*` ID, incompatible insert payload, no checked returned DB error. Require trusted actor/tenant, UUID, schema adapter, atomic persistence and audit. |
| `lib/services/finance-service.ts:613` | `approveExpense`: local role/amount checks, unscoped update by ID, local success before DB acknowledgement. Preserve the >₹50,000 Super Admin rule and enforce it on the server. |
| `lib/services/finance-service.ts:676` | `markExpenseAsPaid`: local mutation, vendor total update, unscoped update, status/column mismatch. Require valid state transition, same-tenant vendor, idempotent disbursement and atomic audit. |
| `lib/services/finance-service.ts:760` | `rejectExpense`: local mutation and unscoped update. Require current authorized membership and tenant predicate. |
| `lib/services/finance-service.ts:812` | `submitExpenseForApproval`: local-only transition/audit. Needs authoritative persisted transition and authorization. |
| `app/(dashboard)/accounts/expenses/page.tsx:57`, `:80` | Reads local expenses directly; invokes all create/approval/rejection/disbursement functions; exports filtered records. Move to a tenant-scoped service/API result with loading/error states. |
| `app/(dashboard)/dashboard/page.tsx:87`, `:217` | Reads locally stored expenses and sums Paid records. Untagged rows are currently treated as default by the helper. Require authoritative expense retrieval and explicit tenant identity. |
| `app/(dashboard)/accounts/reports/page.tsx:134`; `lib/services/finance-service.ts:1079` | Expense reporting/financial dashboard aggregation over local arrays. Must share the authoritative tenant and eligibility rules. |
| `lib/utils/excel-export.ts:477` | Export defaults to all locally stored expenses. Require an explicitly authorized tenant dataset. |
| `app/(dashboard)/accounts/vendors/page.tsx:282`; `lib/services/finance-service.ts:1018` | Vendor deletion dependency checks reference expenses. Must preserve links and avoid cross-tenant reference checks or totals. |
| `lib/services/data-store.ts:152`, `:1321`; `lib/services/persistent-storage-adapter.ts:147` | Hydration, seeds, persistence and browser cache. Do not auto-import, auto-assign, or delete historical cached rows; distinguish offline demo state from live results. |
| `lib/supabase/db.ts:92`; `lib/supabase/rls.ts:337`, `:554` | Generic local adapter and expense/vendor access rules. Enforce the same tenant/role boundaries; audit generic update/delete paths too. |
| `lib/services/audit-service.ts:52` | Local-first audit persistence and unchecked DB insert errors. A privileged operation must not succeed without a durable trusted audit. |
| `types/index.ts:629`, `:650`; `lib/services/payment-workflow-state.ts:5` | Expense/vendor models lack the required ownership contract; the workflow snapshot does not include expenses. Define a dedicated authoritative expense boundary rather than silently folding cached rows into financial snapshots. |

No dedicated expense DELETE service/API was found in the searched application paths. This does not justify granting DELETE: generic adapter and direct database-client access must remain denied until a retention policy authorizes it.

## Additional confirmed blocker: application/schema mismatch

The application attempts `expense_code`, `reference`, `attachment_url`, `paid_by`, `approved_by`, and `updated_at`, and generates non-UUID `exp-*` IDs. The database instead requires `voucher_number`, `recorded_by`, UUID IDs, and uses `reference_number`/`invoice_url`. UI workflow statuses include Draft, Pending Approval, and Paid, which the current database constraint does not accept. Some UI categories and `Card` likewise do not match the live constraints.

Consequently, adding tenant RLS alone is insufficient. The local-first behavior and unchecked Supabase errors can hide failed writes. The empty production table plus the ₹1,11,500 local seed total is consistent with this path; this inspection did not replay historical writes or attribute each past failure to a particular constraint.

## Conditional migration design — not executable, not validated

1. **Ownership gate and manifest:** obtain a reviewer-approved disposition for every existing cached/local expense. Required fields: source system, stable record ID, verified tenant, evidence reference, reviewer, review time, and decision (genuine expense, demo-only, unresolved). A current recorder profile, a matching name, or a default value is not sufficient. Unresolved records block migration/import; demo-only records remain preserved and are not imported as financial history.
2. **Recheck production shape and row count:** inspect again immediately before a separately approved migration. If relational rows appeared since the verified zero count, abort unless all have reviewed ownership mappings. No blanket default/backfill.
3. **Additive schema:** propose `expenses.tenant_id text` with **no default**. Validate ownership against the application's reviewed tenant membership model. With an empty table, eventual NOT NULL needs no historical expense backfill; if rows exist, stage nullable ownership only within a controlled gate and prevent unowned rows from normal access until reviewed. Do not introduce a foreign key to `profiles.tenant_id`, which is not a unique tenant registry.
4. **Dependencies:** define whether vendors are shared or tenant-owned before allowing expense/vendor references. Tenant-owned vendors need their own reviewed ownership and matching composite-reference enforcement. Preserve existing UUIDs, voucher uniqueness, and historical invoice/reference data.
5. **Schema contract:** define an explicit adapter or separately reviewed additive fields/status transitions for the existing UI workflow. New expenses must not default to Approved. Keep submission, approval, and disbursement distinct. Do not reinterpret historical Approved as Paid without evidence.
6. **Policy plan:** keep RLS enabled. Use an AS RESTRICTIVE tenant guard for authenticated users so the existing permissive role policy cannot widen scope. Separate role permission from tenant ownership, and validate both before and after updates. Do not grant normal access to anonymous users or null-owned rows.

Proposed policy behavior, pending actual staging SQL and review:

| Operation | Required predicate / decision |
| --- | --- |
| SELECT | Existing row has explicit non-null tenant equal to the active authenticated profile's tenant; role is accountant/admin/super_admin. |
| INSERT | New row tenant equals that active membership; server-derived recorder is the authenticated actor; permitted role and initial pending/draft state. Client-supplied tenant/actor values cannot override membership. |
| UPDATE | USING checks old row tenant and active role; WITH CHECK checks new row tenant and membership. Tenant transfer is prohibited. Server enforces allowed transitions, approval thresholds, and separation/idempotency rules. |
| DELETE | Deny to all application roles initially, including same-tenant administrators, because record preservation is required and no expense-delete workflow was identified. Cross-tenant deletion must also fail. Any later retention/deletion policy requires separate approval. |

A restrictive policy alone grants no access; it must coexist with narrowly scoped permissive role policies and appropriate grants. Re-test SELECT and UPDATE together, since update visibility depends on SELECT authorization. Protect profile tenant/role fields against self-escalation.

## Privileged authorization and audit design

- Prefer session-authenticated database access with RLS for normal expense reads/writes. Derive identity from the verified session and active database membership, not browser IDs or user-editable metadata.
- Do not provide a cross-tenant wildcard simply because a user is Super Admin. Any authorized cross-tenant administrative action needs an explicit target tenant, documented scope, reason, and trusted audit.
- Service-role/database-owner access bypasses ordinary RLS. Keep it server-only and limited to separately authorized maintenance; application checks and tenant predicates remain mandatory. Do not rely on an RLS test run as owner to establish user isolation.
- Audit the trusted actor, tenant, operation, target expense, before/after state, timestamp, request/idempotency identifier, and justification in the same transaction. Audit storage must be append-only to application users and not freely forgeable. Audit persistence failure must roll back the business operation.
- No privileged expense route, audit mechanism, or policies were implemented in this blocked turn.

## Required staging tests — not run

Use a verified isolated database with synthetic tenants A/B, active/inactive members, accountant/admin/Super Admin/student/anonymous roles, vendors, and expenses. Do not clone production invoices or personal information. No migration may be executed automatically; staging execution must follow an explicit approved staging plan and verified target identity.

- A cannot SELECT B, including direct-ID requests, reports, exports, and Dashboard totals.
- A cannot INSERT an expense for B or forge recorder/approver/tenant; null tenant rejected.
- A cannot UPDATE B, move its own row to B, alter immutable ownership, or bypass approval thresholds/state transitions.
- DELETE attempts fail for both own and foreign expenses under the preservation policy.
- Correct same-tenant creation/approval/payment succeeds once and produces a trusted audit; inactive/unauthorized actors fail.
- Vendor relationships/totals never cross tenant boundaries; stale client caches cannot supply another tenant's data.
- Database errors and successful empty reads do not return seed/local expenses as live success.
- Financial aggregation includes only the authenticated tenant's authorized eligible expenses and uses the intended timezone boundaries.
- Synthetic legacy rows with no verified ownership abort migration/import without changes.
- Injected commit/audit failure restores the original row, totals, and audit state.
- Verify policies using actual authenticated-role contexts; owner/service-role tests are not sufficient RLS coverage.

**Test results:** ownership/schema inspection completed; cross-tenant regression tests NOT IMPLEMENTED/RUN; isolated staging migration NOT EXECUTED; TypeScript/lint/build NOT RUN because no application implementation was made. No PASS or successful isolation claim is made.

## Rollback and migration risks

- Before any future approved execution, capture a verified encrypted backup, schema/policy/grant definitions, and the ownership manifest. Freeze or control concurrent expense writes while validating row counts and mappings.
- Prefer transaction rollback before commit if ownership or policy validation fails. Do not remove records, disable RLS, or restore broad cross-tenant access as a rollback tactic.
- After deployment, prefer rolling application traffic back to a read-only/error state while retaining protective tenant columns and restrictive policies. An old client that cannot supply authorized ownership must fail closed rather than silently succeed locally.
- A post-commit tenant reassignment rollback must use the approved per-record manifest and a new audit, not mass reassignment to default. Do not drop ownership columns or audit history once new data depends on them.
- Main risks: misclassifying demo/local rows as real expenses; concurrent records appearing in an initially empty table; incompatible statuses/fields/IDs; cross-tenant vendor references; actor impersonation; failed writes masked by cache; freely insertable audit events; monetary totals changing when synthetic seed values stop appearing.

## Deliverable status and release gate

Only this proposal and [sanitized evidence](expense-tenant-ownership-evidence.json) were added. All existing application changes and data were preserved. **NO-GO** until the three local records' ownership/disposition is reviewed, the schema contract is agreed, and a separately authorized isolated staging run validates the completed implementation. Production deployment requires its own approval afterward.
