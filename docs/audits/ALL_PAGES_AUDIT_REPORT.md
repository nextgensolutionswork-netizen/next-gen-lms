# Complete page-by-page audit report

17 October 2026. Frozen source revision `0000e5e6ff878f14d4cbd6704ab93cd769346167`. Audit-only; no application fixes, deployment, operational writes, live accounts or load tests.

**Verdict: NO-GO for unrestricted production use.** The inventory is complete under the stated source-discovery rules; authenticated functional coverage is blocked. The remediation claim “all 32 fixed” is not supported by current source and fresh checks.

35 route declarations; 39 API route files; 1511 JSX control declarations, including 630 buttons, 69 forms, 98 modal/dialog declarations and 38 table declarations. Counts are distinct source locations, not rendered row buttons or unique runtime modal instances. Shared primitives and currently unreferenced components are included and identified. Dynamic record IDs do not add routes.

| Metric | Evidence / denominator |
| --- | --- |
| Source-discovered and structurally reviewed pages | 35/35 (100%); deeper workflow tracing is recorded below, not a claim of every branch execution |
| Anonymous route navigation attempted | 35/35 (100%); 33 end at login, including root |
| Actual page content browser-tested | 2/35 (5.71%): login and missing-certificate state |
| Authenticated page content browser-tested | 0/32 protected page routes (0%) |
| Fully verified pages | 0/35 (0%) |
| Partially verified pages | 2/35 (5.71%): root redirect and public certificate missing state |
| Failed pages | 1/35 (2.86%): login native error-feedback check G46 |
| Blocked pages | 32/35 (91.43%): protected page content; source findings still recorded |
| Untested/unaccounted routes | 0/35; BLOCKED does not mean functionally tested |
| Buttons successfully tested for their scoped function | 3/630 (0.48%): password visibility, forgot-mode opening, return to login; each at four widths; login submit remains partial |
| Forms fully successfully tested | 0/69 (0%); login form exercised for invalid credentials only |
| Responsive content checks | 8/140 page×width combinations (5.71%); 132 blocked. Redirect-only root layout is not separately counted |
| Role/page runtime matrix | 0/315 (0%); 9 roles × 35 routes explicitly blocked for session/permission testing |
## Fresh verification

| Check | Result | Evidence |
| --- | --- | --- |
| Frozen production build | PASS, exit 0 | page-evidence/build.log; build-result.json |
| TypeScript after generated types | PASS, exit 0 | page-evidence/tsc.log; tsc-result.json |
| ESLint | PASS with warnings, exit 0 | page-evidence/lint.log; lint-result.json |
| Existing unit/integration/API fixtures | 651 passed, 1 failed / 652; 48 passed, 1 failed / 49 suites | page-evidence/unit.log |
| Additional residual defect probes | 3 passed / 3; passing assertions reproduce G02/G11/G14 defects | page-evidence/residual-probes.test.ts; residual-probes.log |
| PGlite isolated migration fixture | PASS: snapshot migration, CAS stale write/rollback, LMS gate, tenant RLS/profile authority/private proof policies | page-evidence/database.log |
| Playwright public/anonymous | 35 navigations, 8 viewport checks, 12 public control/width cases, JS/native invalid login, 8 API GET checks | page-evidence/browser-results.json; public-controls.json; browser.cjs |
| Live Supabase Auth/RLS/Storage and complete migration chain | BLOCKED: independently isolated project not proven | No operational project used |
| 100 concurrent authenticated users/video/database capacity | NOT RUN | No safe independently isolated authenticated environment |

The fresh gateway test fails at tests/payment-gateway.test.ts:307: expected 200, got 500, with “Payment amount exceeds outstanding balance (0)”. The test takes store.students[0] and its fee account rather than building a fresh payable fixture. This is a reproducibility/fixture failure, not a demonstrated live payment failure. No test was weakened or application changed.

The historical 627 and remediation 652/652 claims are not current results. An earlier run in this turn on 0d2f2e6 passed 552 tests and build, but was superseded when HEAD changed. Initial workspace tsc errors referenced stale .next routes. A clean frozen copy of the new revision passes tsc/build. The five prior reports reappeared in the new commit and were reviewed; they contain conflicting counts and verdicts, including an expanded G01–G43 list despite the request referencing 32. This audit reconciles G01–G32 and preserves G33–G43 separately.

## Workflow trace and release evidence

| Workflow | Source path and positive evidence | Remaining gap / blocked proof |
| --- | --- | --- |
| Admission | CRM pages → crm/admission service → /api/admissions → payment session/transaction → enrollment/fee snapshot; workflow unit fixtures pass | G02/G09/G15/G36; lead cancellation, duplicate admission, notifications, reload and cross-tenant runtime blocked |
| Fees | Payment entry/proof → /api/fees/payments → authenticated actor/transaction → Pending Approval → independent Accounts approve/reject → ledger/receipt; partial payment, self-approval and duplicate cases exist in passing unit suites | G02/G04/G09/G31; authoritative relational-vs-snapshot balances, real proof storage, simultaneous approvals and receipt UI blocked |
| Onboarding | Approved admission/payment → forwardApprovedPaymentToOnboarding → assignment/notification/checklist → provisionStudentLmsAccount → student_lms_access; createUser rejection fixture now passes | G07/G10; profile error recovery, existing-user tenant ownership, real login and document/trainer prerequisites blocked |
| Training | Portal identity/enrollment → video/lesson progress → attendance/assignment/quiz → certificate | G14/G15/G16/G17/G18/G32/G34/G44; real playback, uploads, authorized quizzes and progress persistence blocked |
| Placement | Eligibility → enrollment/declarations/documents → profile/resume → job application → status/interview/outcome | G24/G26; closed/expired jobs denied in local tests; multi-role complete lifecycle, provider notifications and authoritative persistence blocked |

## Requested product changes

- Admission source contains Fee Due Date, partial payment entry, transaction reference and optional proof upload.
- Student fee GST and installment-plan selectors are removed from the admission form. /accounts/installments remains a redirect to /accounts/fees. Historical installment/payment types remain, as required for records.
- Vendor GST identification and institutional tax settings still exist; these are distinct from removed fee-entry selectors. Legal compliance of tax processes was not audited or certified.
- Financial Preview Role selectors are absent from current payment/approval pages. Public login still exposes preset role accounts; production fallback security is G11.

## Responsive and accessibility evidence

Login and missing-certificate state had no horizontal overflow at 375, 768, 1366 and 1920 px. Eight screenshots are retained in page-evidence. Login mobile and native-error screenshots were visually inspected. Geometry does not certify keyboard, contrast, every modal or table. All 32 protected pages remain blocked at all four widths. G46 screenshot shows the confirmed failure feedback problem.

## Counts of confirmed open source/runtime findings

| Severity | Open findings |
| --- | --- |
| P0 | 9 |
| P1 | 17 |
| P2 | 2 |
| P3 | 0 |

Counts include remaining parts of historical findings plus new G44–G46, excluding fixed/not verified/not reproducible entries. Prior report priority is retained for residual historical gaps, not a claim that every original exploit remains intact. Full per-ID evidence is in NEW_GAPS_AND_BUGS.md.

## Report index

- [Coverage, every page, API and role matrix](ALL_PAGES_COVERAGE_MATRIX.md)
- [Every inventoried control and dynamic state declaration](ALL_BUTTONS_FORMS_AUDIT.md)
- [Current findings and all historical IDs](NEW_GAPS_AND_BUGS.md)
- [Fix priority and verification gates](ALL_PAGES_FIX_PRIORITY.md)
- [Production readiness](UPDATED_PRODUCTION_READINESS.md)
- [Machine-readable source inventory](page-evidence/inventory.json)
- [Browser evidence](page-evidence/browser-results.json)

## Safety and provenance

Work ran from a frozen source copy with no .env files, production data directory or Supabase CLI linkage. Mock Supabase URL/key and synthetic signing secret were explicit; no provider notification/payment credentials were supplied. Browser requests were restricted to loopback port 3137. Source tests used mocks/disposable storage; the PGlite fixture is local. localhost:3000 and operational databases were not tested or modified. No successful role login, cloud resources, deployment, 100-user run or production sign-off occurred.
