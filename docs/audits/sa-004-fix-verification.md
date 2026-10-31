# SA-004 fix verification

Date: 2026-10-31. **SA-004: PASS for the local implementation. Not deployed.**

## Result

The verified default-tenant snapshot distribution now reconciles through the shared resolver as follows:

| Course | Canonical records | Legacy records | Total |
| --- | ---: | ---: | ---: |
| FICO | 6 | 11 | 17 |
| MM | 1 | 1 | 2 |
| SD | 1 | 0 | 1 |
| ABAP | 1 | 1 | 2 |
| Unresolved | 0 | 0 | 0 |
| Total | 9 | 13 | 22 |

These counts are verified against the investigation's snapshot distribution and all 13 individually identified records in `sa-004-affected-records.json`. They are local test results, not a claim that production has changed.

## Changed application files

- `lib/utils/course-resolver.ts`: single shared resolver with the three verified aliases, scoped to tenant `default`. A mapping only resolves if its canonical target exists in the available catalog. No name-based inference. Helpers filter tenant records and deduplicate alias/canonical catalog rows; explicitly tenant-owned courses are not visible to other tenants. The existing untagged relational course catalog remains shared.
- `lib/utils/dashboard-metrics.ts`: course buckets use the resolver; payment attribution preserves the historical course and permits fallback only for missing/general attribution. Payment and fallback lookup rows are tenant checked.
- `app/(dashboard)/dashboard/page.tsx`: catalog and authorized workflow refresh, explicit loading/error/retry states, tenant-scoped data, refreshed memoized aggregates, canonical course filters, reconciled enrollment and payment buckets. Rendering no longer invokes ledger reconciliation as a side effect.
- `lib/services/academics-service.ts`: live catalog errors propagate to callers; successful empty catalogs clear cached courses. Individual course reads no longer resurrect missing courses from cache. Offline mode retains its local adapter behavior.
- `lib/services/admission-course.ts`: live admission validation requires a canonical UUID and an authoritative database lookup even when cached data matches; errors, absent/foreign courses, and archived courses reject. Offline fixtures remain supported explicitly.
- `lib/services/admission-service.ts`: calls the validator before creating records, copies the authoritative course ID into new input without mutating the caller, and uses the shared resolver for batch-course compatibility. Existing admission IDs, course IDs, names, and historical records are not rewritten.
- `app/(dashboard)/admissions/page.tsx`: explicit catalog failure state and submission gate; canonical course selection and shared batch matching; removes first-course/fee fallback for an invalid selection. Existing admission rows continue displaying their original stored course information.

## Regression files

- `tests/sa-004-course-reconciliation.test.ts`: 33 passing tests. The former three expected failures are ordinary passing tests. Includes all 13 affected record IDs, 22-record totals, canonical/missing/unknown IDs, preserved raw admission data, tenant boundaries, mixed catalogs, historical payments, database/transport errors, empty catalogs, and missing individual courses.
- `tests/sa-004-admission-course.test.ts`: 10 passing tests covering canonical live validation, stale-cache bypass prevention, all legacy IDs rejected for new live admissions, absent UUIDs, database failure, foreign ownership, and archived courses.
- Historical investigation and original evidence remain available in `sa-004-course-assignment-investigation.md` and `sa-004-affected-records.json`.

## Executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| SA-004 and supporting suites, 7 files | 109 passed, 0 failed, 0 skipped; no expected-failure tests | [Test JSON](sa-004-fix-tests.json) |
| Existing admission audit, separately | 9 passed, 1 pre-existing failure | [Audit JSON](sa-004-existing-admission-tests.json) |
| Same failing audit against pre-change `git HEAD` admission service | Same failure reproduced; 9 nonselected tests skipped | [Baseline JSON](sa-004-baseline-auth-result.json) |
| TypeScript `tsc --noEmit --incremental false` | Exit 0, no diagnostics | [Log](sa-004-typecheck.log) |
| ESLint `next lint` | Exit 0, no warnings or errors | [Log](sa-004-lint.log) |
| Production `next build` | Exit 0; compiled and generated pages successfully | [Log](sa-004-build.log) |
| `git diff --check` | Exit 0 | Whitespace validation |

The 109-test command:

```text
node node_modules/vitest/vitest.mjs run tests/sa-004-course-reconciliation.test.ts tests/sa-004-admission-course.test.ts tests/dashboard-metrics.test.ts tests/crm-admissions-operations.test.ts tests/student-fee-payment-approval-workflow.test.ts tests/payment-approval-automation.test.ts tests/audit-admission-failure-contract.test.ts --reporter=json --outputFile=docs/audits/sa-004-fix-tests.json
```

The build used `.next-build-check`, temporary isolated persistence, `VITEST=1`, and explicit mock Supabase URL/keys in the build child process. `NODE_ENV` was not changed; this was an optimized production build with isolated data access. No production database writes, migrations, assignment changes, or deployment occurred. Temporary baseline source/test files were removed after verification. Pre-existing workspace changes were preserved.

## Remaining risks and limits

1. The existing admission-audit test `does not substitute another staff identity for a removed actor` still fails. It also fails against the pre-change admission service: the direct service entry point can fall back to another staff actor. This unrelated authentication defect is not fixed by SA-004. Do not interpret the SA-004 PASS as a clean security-audit verdict or a completely green repository-wide suite.
2. Production still contains legacy IDs and the existing workflow-snapshot/relational-table divergence. This implementation resolves the verified aliases without migrating data. No production browser/deployment verification was performed.
3. The alias mapping is intentionally limited to the three verified default-tenant mappings. Other tenants and unknown IDs are not silently mapped. Missing canonical targets remain unresolved.
4. Live catalog failures now intentionally block new admissions and show Dashboard errors. Offline/demo adapters retain local seeded data behavior; they are not evidence of live catalog validity.
5. The database currently exposes a shared course catalog without a `tenant_id` column. New tenant-owned catalogs would require corresponding server-side catalog policies, beyond the client and adapter filtering provided here.

No new TypeScript, ESLint, production-build, or SA-004 regression failures remain. **SA-004 is locally fixed and verified; deployment remains unperformed.**
