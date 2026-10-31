# SA-004 — Course assignment reconciliation investigation

Implementation follow-up: [SA-004 fix verification](sa-004-fix-verification.md) records the locally verified fix, changed files, and remaining unrelated baseline failure. The investigation below is retained as historical pre-fix evidence; its FAIL verdict and expected-failure results describe the original code.

Date: 2026-10-31 (Asia/Calcutta). Verdict: **FAIL — confirmed, not fixed**.

## Scope and safety

Production project `tgohtdzwehhjfahtgovq` was inspected through the connected Supabase plugin using SELECT queries only. No application endpoint was invoked, no migration was applied, and no assignment or production record was changed. Local additions are this report, redacted record evidence, and regression tests/results. Earlier workspace changes were left intact.

## Confirmed counts

The authoritative `public.fee_workflow_state` row for tenant `default`, revision **75**, updated at `2026-10-31T06:10:28.885156Z`, contains **22 students and 22 admissions**. Joining snapshot student IDs to `public.courses.id::text` reproduces the reported discrepancy exactly:

| Classification | Count |
| --- | ---: |
| Recognized canonical course UUID | 9 |
| Legacy course IDs absent from UUID catalog | 13 |
| Missing/empty course IDs | 0 |
| Missing linked admissions | 0 |
| Student/admission course-ID mismatches | 0 |

| Legacy ID | Affected students | Candidate canonical catalog ID |
| --- | ---: | --- |
| `crs-fico-01` | 11 | `c1000000-0000-0000-0000-000000000001` |
| `crs-mm-01` | 1 | `c1000000-0000-0000-0000-000000000002` |
| `crs-abap-01` | 1 | `c1000000-0000-0000-0000-000000000004` |

Every affected student has a linked admission with the same legacy ID and a recognizable course name. Each stored student course name has exactly one exact-name candidate in the current catalog. These are **legacy-attributed records, not genuinely blank assignments**. The Dashboard accurately reports an unresolved raw ID but groups legacy-attributed and genuinely unassigned records under one label. Candidate mappings require reviewed aliases; names alone must not trigger automatic reassignment.

The relational `public.students` table has **2 records**, both with valid course IDs and matching admission IDs. It does not represent the 22-row workflow snapshot. A separate `staging-isolated-tenant` snapshot has one legacy FICO record; it is excluded from the default-tenant count of 13. Project health was reported `ACTIVE_HEALTHY` by project discovery.

Affected IDs and admission links, without student names/contact information: [sa-004-affected-records.json](sa-004-affected-records.json).

## Root cause and resolution paths

1. **Strict catalog membership on Dashboard.** `lib/utils/dashboard-metrics.ts:3` returns `__unassigned__` unless the exact ID occurs in the catalog. `app/(dashboard)/dashboard/page.tsx:57` builds the catalog ID set from `store.courses`; lines 166–173 compute enrolled counts from `store.students[].course_id`. No admission lookup, legacy alias lookup, or name lookup participates. The page has no independent fetch/refresh effect: it depends on the existing in-memory/persisted store. Its current-roster counts are not period-filtered enrollment events (UI explanation at line 443).

2. **Admissions displays a denormalized label.** `app/(dashboard)/admissions/page.tsx:221` retrieves admissions, and line 493 renders `adm.course_name` directly. It does not join the catalog to validate the displayed label. Course prefetch at line 165 is separate from row rendering. `lib/services/admission-service.ts:22` uses `/api/admissions` in the browser; `app/api/admissions/route.ts:32` reads a visible snapshot through `paymentTransaction(..., true)`.

3. **Snapshot data and catalog use different ID namespaces.** `lib/services/payment-workflow-transaction.ts:36` selects the tenant snapshot; line 44 merges it when present. Relational bootstrap at line 47 runs only when the snapshot is absent. `lib/services/payment-workflow-state.ts:5` includes students/admissions but not courses; line 16 merges rows without canonicalizing course IDs. `lib/services/academics-service.ts:22` independently reads `courses.select('*')`, replacing cached courses with UUID catalog rows on a successful nonempty result. This creates the observed 22-record legacy/canonical roster versus UUID-only catalog.

4. **Legacy IDs are supported by seeded application data and accepted on creation.** `lib/services/data-store.ts:600` seeds courses (`crs-fico-01` at 602, `crs-mm-01` at 618, `crs-abap-01` at 648). `lib/services/admission-service.ts:211` checks the in-memory catalog first and queries the live course table only if no local match exists. Lines 337–338 and 393–394 copy the submitted course ID and cached name to admission/student records. Lines 293–297 explicitly tolerate FICO/MM legacy-versus-UUID batch matches. This is a confirmed path by which legacy references can remain valid to application code yet unresolved against the database catalog. The exact historical request that created each row was not reconstructed.

## Tables, fields, and joins

- `public.courses`: UUID `id`, `course_code`, `course_name`; four current rows.
- `public.students`: UUID `course_id` → `courses.id`, UUID `admission_id` → `admissions.id`, UUID `batch_id` → `batches.id`.
- `public.admissions`: UUID `course_id` → `courses.id`, UUID `batch_id` → `batches.id`. The relational table has no `course_name` column.
- `public.batches`: UUID `course_id`; `public.batch_students` links student and batch IDs. Neither is used by Dashboard to resolve its enrolled-course buckets.
- `public.fee_workflow_state`: tenant-keyed JSONB `snapshot`, revision, timestamp. Nested students/admissions have string course IDs and denormalized names. Relational foreign keys do not validate references inside JSONB. The schema definition is in `supabase/migrations/20261012094737_payment_approval_workflow.sql:22`.
- The displayed modules perform no SQL course join. Investigation joins were `snapshot.students.admission_id = snapshot.admissions.id`, `snapshot.students.course_id = courses.id::text`, and, separately, relational `students.course_id = courses.id` / `students.admission_id = admissions.id`.

## Fallback/error masking

- `lib/services/academics-service.ts:31` accepts only nonempty successful catalog reads; at line 38 it returns `store.courses` for returned errors and empty successful results. Returned Supabase errors are not thrown or surfaced. Regression tests reproduce both behaviors with a mocked database.
- `lib/services/admission-service.ts:28` has a similar server-side direct-query fallback, but the browser path uses the snapshot API and propagates failed requests. Do not attribute all Admissions success to that server fallback.
- `lib/services/data-store.ts:61` hydrates existing state; lines 91–94 only replace arrays when nonempty, potentially retaining seeded values for empty data. Browser hydration reads localStorage in `lib/services/persistent-storage-adapter.ts:179`.
- `app/(dashboard)/admissions/page.tsx:215` also defaults its creation form to the first cached course, with a fee default at 216. This does not resolve the Dashboard's 13 rows.
- A historical database error during the observed browser session is **not proven**. Masking capability is confirmed by source and isolated tests; the 13 invalid catalog references are independently confirmed in the live snapshot.

## Proposed fixes — not applied

1. Add one shared read-only course resolver with explicit classifications: canonical, reviewed legacy alias, missing, and invalid. Use it consistently for Dashboard filtering/counts and Admissions validation/display. Preserve stored IDs and historical labels; do not silently infer assignments from names, current batch, or current student course.
2. Maintain a reviewed, unique alias map (legacy ID → canonical course UUID), preferably in a constrained table with an FK to `courses.id`. The three mappings above are candidates for review. Unknown IDs must remain visible as data-quality issues. A resolver-only change can repair categorization without rewriting assignments.
3. Load the roster and catalog through an explicit, authenticated data-loading contract. Surface catalog read errors and distinguish empty results from errors. Disable seed/cache fallback in live mode, or clearly mark stale data; clear successful empty lists. Do not make course selection depend on whichever page last updated the global store.
4. On future admissions, require authoritative catalog validation even when the submitted ID exists in local seed data. If reviewed legacy aliases are accepted, canonicalize explicitly at the controlled write boundary and retain the original alias in audit history.
5. Separately plan a reviewed, backed-up, tenant-scoped data migration only if canonical storage is required: inventory course references across snapshot admissions/students/fees/payments/batches and historical records; preview the exact changes; enforce revision checks and transactionality; audit updates. Do not blanket-replace strings or rewrite receipts/ledger history. Address the 22-snapshot-versus-2-relational source divergence before treating relational tables as the complete enrollment source.
6. Add snapshot reference validation or migrate normalized enrollment storage to proper FKs. Existing relational FKs alone cannot protect JSONB course references.

## Regression evidence and verdict

Command: `node node_modules/vitest/vitest.mjs run tests/sa-004-course-reconciliation.test.ts tests/dashboard-metrics.test.ts --reporter=json --outputFile=docs/audits/sa-004-course-regression-results.json`.

Result: **17 tests reported passed, 0 unexpected failures**. This consists of **14 normal assertions/reproductions and 3 explicit `it.fails` cases** showing that the required legacy-alias resolution still fails. Expected failures are deliberately distinguished from passing acceptance tests; they must be converted to ordinary passing tests when a resolver is implemented. Coverage includes canonical IDs, missing/invalid IDs, all three legacy aliases, the 22/9/13 distribution, record immutability, catalog replacement, error masking, and empty-result fallback. Tests use synthetic aggregate fixtures and mocked database responses; no live test writes or network calls.

Machine-readable results: [sa-004-course-regression-results.json](sa-004-course-regression-results.json).

**SA-004: FAIL.** Root cause and affected count are confirmed. Application code and assignments remain unchanged under the read-only instruction; the issue is not fixed.
