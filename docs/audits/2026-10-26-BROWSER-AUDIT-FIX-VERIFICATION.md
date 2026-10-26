# 26 October 2026 browser audit fix verification

**Recommendation: do not promote these changes to production yet.** Local fixes and regression evidence are available, but the required independently verified Supabase staging environment is not connected. Live student login, profile relationships, RLS, tenant boundaries and database timing remain release gates. No deployment was performed.

## Scope and evidence integrity

Original evidence was located in [page-browser-2026-10-26](page-browser-2026-10-26/): [results.json](page-browser-2026-10-26/results.json), [followup.json](page-browser-2026-10-26/followup.json), [student-login.json](page-browser-2026-10-26/student-login.json), desktop/mobile PNGs, and the repository scripts `scripts/page-by-page-audit.mjs` and `scripts/page-audit-followup.mjs`.

New evidence is in [browser-fix-2026-10-26](browser-fix-2026-10-26/). The local application on port 3000 is configured for production Supabase and was not used for state-changing verification. The test server on port 3001 uses the local synthetic adapter, mock Supabase configuration, a separate build directory and separate persistence under `staging-runtime/browser-fix-synthetic`. Browser runners block external origins. This fixture is **not** a substitute for Supabase staging.

Connected-project discovery returned production `tgohtdzwehhjfahtgovq` and inactive `yutulwbkkvmryaxqjbfp`. The user explicitly confirmed that the inactive project is **not** staging and will connect the correct project. Neither was restored or modified. The project referenced in `.env.staging` could not be independently verified through the connections. No production financial/student records or Supabase schema were changed by this fix verification.

Before screenshots contain the original audit data; after screenshots contain local synthetic fixtures. They establish layout differences, not equivalence of production and synthetic database content. Original PASS_SMOKE labels do not establish full responsive correctness or live authentication security.

## 1. Mobile dashboard layout

**Root cause:** the shared fixed-width sidebar occupied 256px on a 375px viewport. Flex children and intrinsic-width controls also forced several page toolbars wider than the available space. Checking document width alone had missed constrained or clipped main content.

**Fix:** retain the desktop sidebar at widths of 1024px and above; use a native modal navigation drawer below that breakpoint, with Escape, close button, link-navigation close, focus containment and desktop-resize close. Main content takes the available width. Header actions wrap. Table parents have their own horizontal scroll area. Select controls shrink to their container, and attendance, timetable, admissions, dashboard, placement-enrollment and student-directory toolbars wrap.

**Affected files:** `app/(dashboard)/layout.tsx`, `components/layout/sidebar.tsx`, `components/layout/header.tsx`, `app/globals.css`, and the `page.tsx` files for `academics/attendance`, `academics/schedule`, `admissions`, `dashboard`, `placement/enrollments`, and `students`.

**Screenshots:** [before mobile](page-browser-2026-10-26/_dashboard-mobile.png), [after 375](browser-fix-2026-10-26/_dashboard-375.png), [after 768](browser-fix-2026-10-26/_dashboard-768.png), [after 1366](browser-fix-2026-10-26/_dashboard-1366.png), [after 1440](browser-fix-2026-10-26/_dashboard-1440.png). All route screenshots are stored alongside the JSON measurements.

**Verification:** `scripts/verify-browser-fixes.mjs` measures document and main widths, opens/closes the mobile drawer, captures screenshots, and checks runtime errors and route outcomes at all four requested sizes. Final counts appear below. Layout is not hidden using root overflow clipping.

**Remaining risks:** screenshots cover the initial route state, not every possible modal, form validation state, dataset or permission combination. Actual staging datasets still require the same sweep.

## 2. Intermittent student profile not found

**Confirmed mechanisms:** the profile page originally rendered an empty/not-found state while its asynchronous load was pending. Live lookup mixed UUID IDs and human-readable references, swallowed query failures, and could fall back to cached seed records. A separate session-restoration defect was reproduced locally: the server form serializes an already encoded cookie, while the browser reader decoded only once. Middleware could accept the session while client context was empty. These mechanisms explain unreliable lookup states; their exact contribution to the original live incident cannot be conclusively attributed without staging reproduction.

**Fix:** wait for authentication and a valid route parameter; represent loading, failed lookup, confirmed absence and success separately. Key requests by user and record, abort obsolete requests and suppress stale results. Surface failures with Retry. Browser live queries use the authenticated Supabase session directly and query UUID IDs separately from student codes. Successful empty results no longer repopulate the directory with cached seeds. Cookie restoration supports both browser and server serialization formats.

**Affected files:** `app/(dashboard)/students/page.tsx`, `app/(dashboard)/students/[id]/page.tsx`, `lib/hooks/use-record-load.ts`, `lib/services/student-service.ts`, `components/providers/auth-provider.tsx`; regression tests in `tests/student-record-loading.test.ts`, `tests/auth-cookie-restoration.test.ts`, and `tests/e2e/record-loading-regression.mjs`. The directory now loads authorized records instead of rendering browser seed data directly. Cancelled account requests cannot replace the shared directory cache.

**Screenshots:** [before mobile](page-browser-2026-10-26/_students__id_-mobile.png), [after mobile](browser-fix-2026-10-26/_students__id_-375.png), [after desktop](browser-fix-2026-10-26/_students__id_-1440.png). Original intermittent observations are in `followup.json`; the original screenshot alone is not a reproduction of every failure state.

**Tests:** mocked live lookup errors, empty RLS-visible results, UUID/code routing, directory errors; real-browser hook loading/retry/cancellation; local direct navigation, reload, directory links and back/forward in three cycles; invalid ID.

**Status:** local behavior verified; live database verification pending. Related profile sections still depend on the existing application store; this work does not redesign their persistence or prove live related-data completeness.

## 3. Intermittent receipt not found

**Root cause:** empty local receipt state could be interpreted as absence before authorized synchronization completed, and transport errors were not distinct from absence. The shared session cookie decoding defect also affected authenticated detail rendering. Original follow-up evidence showed valid receipts becoming available after navigation/reload.

**Fix:** request the authorized receipt snapshot with `cache: no-store` and cancellation; resolve the exact route reference only within that response. Failures produce an error with Retry. Not Found requires a successful response without an accessible matching receipt. Old responses cannot overwrite a newer route/account. Existing server role, tenant and student ownership filtering remains in place. No first-receipt fallback was introduced.

**Affected files:** `app/(dashboard)/accounts/receipts/[id]/page.tsx`, `lib/hooks/use-record-load.ts`, `components/providers/auth-provider.tsx`.

**Screenshots:** [before mobile](page-browser-2026-10-26/_accounts_receipts__id_-mobile.png), [after mobile](browser-fix-2026-10-26/_accounts_receipts__id_-375.png), [after desktop](browser-fix-2026-10-26/_accounts_receipts__id_-1440.png).

**Tests:** direct/refresh/directory/back/forward navigation, invalid ID, injected HTTP 503 followed by Retry, anonymous API/page denial, student receipt response ownership filtering and denial of another synthetic student's receipt. See `detail-navigation.json`.

**Status:** local behavior and synthetic ownership checks verified; actual Supabase RLS and cross-tenant database enforcement remain unverified. Existing tenant-scoped workflow snapshot storage architecture was preserved; no new RLS bypass or service-role testing was added.

## 4. Student login failure

**Findings:** the original audit only establishes that login remained at `/login` without understandable feedback. It does not establish whether Auth rejected credentials or the LMS access gate denied an authenticated student. Code review confirmed that middleware used `reason=onboarding_pending` while the form read only `error`; this could conceal the denial reason. Database errors and genuinely pending access also shared the same message. Local server-form login exposed the double-encoded cookie restoration defect described above.

**Fix:** accept the existing `reason` parameter for compatibility and use explicit error codes for pending access versus temporarily unverifiable access. Keep both paths fail-closed. Read `student_lms_access` using the existing authenticated Supabase client and its own-user policy instead of constructing an elevated client. Restore encoded cookies correctly without changing signature verification or bypassing middleware.

**Affected files:** `middleware.ts`, `app/login/page.tsx`, `components/providers/auth-provider.tsx`, `tests/student-access-feedback.test.ts`, `tests/auth-cookie-restoration.test.ts`; updated old error-URL assertions in `docs/audits/evidence-20261017/auth-reproductions.test.ts`.

**Screenshots/evidence:** [original login page](page-browser-2026-10-26/_login-mobile.png), [original failed-login result](page-browser-2026-10-26/student-login.json), [local synthetic portal after login](browser-fix-2026-10-26/_portal-375.png). The portal screenshot proves only the local fixture path.

**Tests:** middleware allows enabled access, denies missing/disabled access, distinguishes database errors safely, and uses the anonymous/publishable client configuration rather than a service key. Cookie tests cover one/two encoding layers and malformed data. Local student form login and `/portal` access pass.

**Status: PARTIALLY FIXED / LIVE VERIFICATION BLOCKED.** No claim is made that the configured live student's failure is resolved. Required staging checks: genuine Supabase password response; profile/auth user linkage and role; student and LMS-access relationships; session refresh/cookies; portal navigation; pending/disabled/error paths; cross-student and cross-tenant access. Existing legacy local-auth fallback paths require review under that staging setup before a production security recommendation.

## 5. Certificate mobile overflow

**Root cause:** the verification navbar/actions and certificate spacing assumed desktop width; long text and multi-column metrics had insufficient mobile wrapping rules.

**Fix:** stack/wrap navigation actions, reduce mobile card padding, use one metric column on small screens, permit long strings to wrap, and explicitly retain print padding/columns while hiding navigation in print.

**Affected file:** `app/certificate/verify/[id]/page.tsx`.

**Screenshots:** [before mobile](page-browser-2026-10-26/_certificate_verify__id_-mobile.png), [after mobile](browser-fix-2026-10-26/_certificate_verify__id_-375.png), [after desktop](browser-fix-2026-10-26/_certificate_verify__id_-1440.png). Long-text screenshots and `certificate-print.pdf` are generated by `scripts/verify-certificate-layout.mjs`.

**Tests:** four viewport widths, long unbroken synthetic name and certificate ID inserted only into browser DOM, invalid long route ID, and A4 print generation. DOM stress fixtures do not modify persisted certificates.

**Remaining risks:** actual server-generated certificate PDFs use their existing separate renderer; this change targets the verification page and browser print layout. PDF endpoint business logic was not changed.

## Executed checks and final evidence

- `npm run typecheck`: executed; final exit codes in [static-checks.json](browser-fix-2026-10-26/static-checks.json), output in `typecheck.log`.
- `npm run lint`: executed with zero warnings/errors; output in [lint.log](browser-fix-2026-10-26/lint.log). The previously reported 28 lint warnings remain cleared.
- `npm run build`: PASS, exit 0, isolated mock environment and `.next-build-check`; [build-result.json](browser-fix-2026-10-26/build-result.json), [build.log](browser-fix-2026-10-26/build.log). Webpack emitted cache-serialization performance notices; these are not lint warnings or build errors.
- `npm test -- --silent --maxWorkers=2 --minWorkers=2`: PASS, **708 tests in 56 files** on the final code; [unit-tests.log](browser-fix-2026-10-26/unit-tests.log). An earlier run failed two assertions for the old login error URL; these were updated to verify the distinct fail-closed outcomes, then the full suite passed. The final suite includes rejection of cancelled directory responses.
- Chrome/Playwright route sweep: **35/35 routes, 140/140 viewport checks passed**; [routes-375-768-1366-1440.json](browser-fix-2026-10-26/routes-375-768-1366-1440.json). Mobile dashboard main width is 375px, not the original 119px. Desktop main widths are 1110px at 1366 and 1184px at 1440, preserving the 256px sidebar. The final directory change also receives a targeted four-width rerun in `routes-375-768-1366-1440-targeted.json`.
- Chrome/Playwright detail and authorization checks: [detail-navigation.json](browser-fix-2026-10-26/detail-navigation.json).
- Certificate stress/print checks: PASS at all four widths; [certificate-layout.json](browser-fix-2026-10-26/certificate-layout.json). A4 output contains one page: [certificate-print.pdf](browser-fix-2026-10-26/certificate-print.pdf).
- Isolated component browser regressions: record loading/cancellation and quiz timer both PASS, exit 0; [component-browser-checks.json](browser-fix-2026-10-26/component-browser-checks.json), `record-loading-browser.log`, `quiz-timer-browser.log`.

| Issue | Local verification | Required live verification |
| --- | --- | --- |
| Mobile dashboard | PASS: all routes/four widths, drawer and desktop sidebar | Repeat with staging datasets and role combinations |
| Student profiles | PASS: loading, errors, cancellation, invalid IDs and navigation | Authenticated Supabase lookup and related-data completeness pending |
| Receipt details | PASS: navigation, retry, invalid IDs and synthetic ownership denial | Staging RLS/cross-tenant enforcement pending |
| Student login | PARTIAL: local login/portal and mocked fail-closed access gate pass | Genuine staging login and relationships blocked |
| Certificate layout | PASS: four widths, long text and one-page A4 output | Live certificate data smoke check pending |

Some concurrent build/test/browser attempts timed out under resource contention. Their incomplete navigation output is retained in `detail-navigation-resource-contention.json`; only completed reruns count toward final verification. The route runner waits for the intentional `/accounts/installments` → `/accounts/fees` redirect and reports it separately from content failures.

Supporting isolation/configuration changes: `package.json` typecheck command; `next.config.mjs` configurable build directory; `tsconfig.json`, `vitest.config.ts`, `.gitignore` generated-directory exclusions; staging-only isolated persistence support in `lib/services/persistent-storage-adapter.ts`; local verification scripts under `scripts/`. Existing unrelated worktree changes were preserved.

## Release gates

1. Connect and independently identify the intended staging Supabase project; confirm it is distinct from production before any database-dependent test.
2. Configure the isolated app with staging-only keys without logging secrets; create/use authorized synthetic accounts and records there.
3. Repeat genuine Auth, session refresh, profile/receipt navigation and negative access tests against staging, including cross-tenant receipts and student financial privacy.
4. Repeat the four-width route sweep against staging data and review remaining warnings/advisories.

Until those gates pass, the evidence supports local regression confidence, **not an unconditional production-readiness PASS**.
