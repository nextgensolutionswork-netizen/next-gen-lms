# Page-by-page browser audit ? 26 October 2026

Tested http://localhost:3000 using Chrome, the configured super-admin test account, and a separate anonymous context. The configured student account did not reach an authenticated page.

35/35 routes visited; 66 desktop/mobile screenshots captured at 1440?900 and 375?812. Search fields on 17 pages accepted test input and were restored. This verifies control interaction, not correctness of every search result. No operational forms were submitted.

## Findings

1. **Mobile dashboard layout is unusably narrow.** The shared sidebar stays 256px wide on a 375px viewport, leaving a 119px main area. Confirmed on dashboard (423px scroll width), batches (217px), and CRM leads (263px). The same fixed sidebar is used by dashboard-layout routes. Outer overflow is hidden, so document-level overflow checks alone falsely appeared clean. See `_academics_batches-mobile.png` and `followup.json`.
2. **Student detail navigation intermittently reports a missing profile.** The directory link to `/students/stu-01` displayed ?Student profile not found.? This reproduced in the follow-up; reloading then displayed the student profile.
3. **Receipt detail intermittently reports a missing receipt.** The registry link to `/accounts/receipts/81000000-0000-0000-0000-000000000001` initially displayed ?Receipt Not Found.? Follow-up navigation and reload succeeded. Investigate data loading/hydration; the root cause is not established by this audit.
4. **Public certificate overflows on mobile.** The valid certificate route `/certificate/verify/CERT-2026-FICO-0091` rendered but exceeded viewport width at 375px.
5. **Student portal remains unverified.** Two login attempts with the configured student test account stayed on `/login`. No failing authentication HTTP response or useful alert text was captured; the cause is unresolved.

No uncaught browser page errors or HTTP 4xx/5xx responses from local `/api/` endpoints were recorded during the primary scan. This does not exclude errors returned inside successful HTTP responses or failures in external services.

## Route results

?Loaded? means the page rendered in the smoke test; it does not mean all forms, role permissions, record operations, or financial calculations passed. Shared dashboard mobile concerns apply even when desktop content loaded.

| Route | Desktop/content outcome | Mobile | Search input checked |
| --- | --- | --- | --- |
| / | Expected redirect to login | No document overflow detected | No |
| /academics/assessments | Loaded | Shared sidebar layout issue | No |
| /academics/assignments | Loaded | Shared sidebar layout issue | No |
| /academics/attendance | Loaded | Shared sidebar layout issue | No |
| /academics/batches | Loaded | Shared sidebar layout issue | No |
| /academics/courses | Loaded | Shared sidebar layout issue | No |
| /academics/sap-servers | Loaded | Shared sidebar layout issue | Yes |
| /academics/schedule | Loaded | Shared sidebar layout issue | No |
| /accounts/approvals | Loaded | Shared sidebar layout issue | Yes |
| /accounts/expenses | Loaded | Shared sidebar layout issue | Yes |
| /accounts/fees | Loaded | Shared sidebar layout issue | Yes |
| /accounts/installments | Expected redirect to /accounts/fees (retired page) | Redirect only | No |
| /accounts/payments | Loaded | Shared sidebar layout issue | Yes |
| /accounts/receipts | Loaded | Shared sidebar layout issue | Yes |
| /accounts/receipts/[id] | Intermittent: initial Receipt Not Found; registry link and reload passed on retest | Shared sidebar layout issue | No |
| /accounts/reports | Loaded | Shared sidebar layout issue | No |
| /accounts/vendors | Loaded | Shared sidebar layout issue | Yes |
| /admissions | Loaded | Shared sidebar layout issue | Yes |
| /audit-logs | Loaded | Shared sidebar layout issue | Yes |
| /certificate/verify/[id] | Loaded | Overflow confirmed | No |
| /certificates | Loaded | Shared sidebar layout issue | No |
| /crm/followups | Loaded | Shared sidebar layout issue | Yes |
| /crm/leads | Loaded | Shared sidebar layout issue | Yes |
| /dashboard | Loaded | Shared sidebar layout issue | No |
| /login | Loaded | No document overflow detected | No |
| /onboarding | Loaded | Shared sidebar layout issue | Yes |
| /placement | Loaded | Shared sidebar layout issue | Yes |
| /placement/enrollments | Loaded | Shared sidebar layout issue | Yes |
| /portal | BLOCKED: configured student login remained on /login | Blocked | No |
| /settings | Loaded | Shared sidebar layout issue | No |
| /students | Loaded | Shared sidebar layout issue | Yes |
| /students/[id] | Intermittent: profile not found on navigation; reload displayed Amit Gupta | Shared sidebar layout issue | No |
| /support | Loaded | Shared sidebar layout issue | Yes |
| /todos | Loaded | No document overflow detected | No |
| /users | Loaded | Shared sidebar layout issue | Yes |

## Evidence and limitations

- `results.json`: original observations; its initial PASS_SMOKE labels do not account for visually discovered clipping or intermittent not-found states. The findings and table above supersede those labels.
- `followup.json`: receipt/student navigation retests and measured mobile widths.
- `student-login.json`: student-login probe outcome.
- `*-desktop.png`, `*-mobile.png`: screenshots, including initial missing-record states.
- Reusable scripts: `scripts/page-by-page-audit.mjs` and `scripts/page-audit-followup.mjs`. The main script now also checks inner-main overflow and discovered-record not-found states.

No production deployment, operational record edits, payment submission, email dispatch, or deletion was performed. Full role-by-role authorization, every button/modal, form submission, and backend persistence remain outside this page-rendering audit.
