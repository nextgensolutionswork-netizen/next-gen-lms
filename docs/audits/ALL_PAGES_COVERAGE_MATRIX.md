# All pages coverage matrix

17 October 2026. Frozen source revision `0000e5e6ff878f14d4cbd6704ab93cd769346167`. Audit-only; no application fixes, deployment, operational writes, live accounts or load tests.

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

Role column is source-derived intent from RBAC, middleware, page checks and sidebar, not verified runtime entitlement. “B” means blocked without synthetic authenticated staging. HTTP 200 after redirect is the login document, not the requested protected page.

| Page ID | URL | Role | Page Loads | Buttons | Forms | API | Database | Security | Mobile | Gaps | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | / | Public redirect | anonymous content/redirect checked | 0 reachable; B | 0 reachable; B | 0 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G02 | PARTIAL |
| P02 | /academics/assessments | Admin, trainer; scoped student | B; anonymous → login | 31 reachable; B | 4 reachable; B | 2 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G14 G15 | BLOCKED |
| P03 | /academics/assignments | Admin, trainer; scoped student | B; anonymous → login | 32 reachable; B | 4 reachable; B | 7 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G15 G16 | BLOCKED |
| P04 | /academics/attendance | Admin, assigned trainer | B; anonymous → login | 23 reachable; B | 0 reachable; B | 3 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G32 G33 G37 G44 | BLOCKED |
| P05 | /academics/batches | Admin, assigned trainer; scoped staff reads | B; anonymous → login | 28 reachable; B | 3 reachable; B | 2 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G15 G35 | BLOCKED |
| P06 | /academics/courses | Admin, assigned trainer; counsellor read | B; anonymous → login | 53 reachable; B | 6 reachable; B | 2 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G15 G41 | BLOCKED |
| P07 | /academics/sap-servers | Admin, trainer; student allocation view | B; anonymous → login | 32 reachable; B | 2 reachable; B | 2 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G34 | BLOCKED |
| P08 | /academics/schedule | Admin, assigned trainer; scoped student/support | B; anonymous → login | 30 reachable; B | 2 reachable; B | 3 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G15 G16 G32 | BLOCKED |
| P09 | /accounts/approvals | Accounts, admin/super admin; counsellor own submissions | B; anonymous → login | 57 reachable; B | 2 reachable; B | 11 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G02 G04 G09 G31 G37 | BLOCKED |
| P10 | /accounts/expenses | Accounts/admin | B; anonymous → login | 24 reachable; B | 1 reachable; B | 13 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G09 G15 | BLOCKED |
| P11 | /accounts/fees | Accounts/admin; scoped counsellor | B; anonymous → login | 16 reachable; B | 0 reachable; B | 1 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G09 | BLOCKED |
| P12 | /accounts/installments | Financial role via redirect | B; anonymous → login | 8 reachable; B | 0 reachable; B | 1 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | none confirmed | BLOCKED |
| P13 | /accounts/payments | Accounts/admin; counsellor own submissions | B; anonymous → login | 33 reachable; B | 2 reachable; B | 11 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G02 G04 G05 G09 G39 | BLOCKED |
| P14 | /accounts/receipts | Accounts/admin; scoped staff | B; anonymous → login | 21 reachable; B | 0 reachable; B | 7 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G06 G08 G09 | BLOCKED |
| P15 | /accounts/receipts/[id] | Accounts/admin; student owner | B; anonymous → login | 15 reachable; B | 0 reachable; B | 3 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G09 | BLOCKED |
| P16 | /accounts/reports | Accounts/admin | B; anonymous → login | 14 reachable; B | 0 reachable; B | 13 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G09 G27 | BLOCKED |
| P17 | /accounts/vendors | Accounts/admin | B; anonymous → login | 20 reachable; B | 2 reachable; B | 13 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G15 | BLOCKED |
| P18 | /admissions | Admin, counsellor | B; anonymous → login | 30 reachable; B | 1 reachable; B | 11 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G02 G09 G36 | BLOCKED |
| P19 | /audit-logs | Admin, super admin | B; anonymous → login | 22 reachable; B | 0 reachable; B | 2 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G23 | BLOCKED |
| P20 | /certificate/verify/[id] | Public | anonymous content/redirect checked | 5 reachable; B | 0 reachable; B | 1 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | 375/768/1366/1920 geometry | G17 G18 | PARTIAL |
| P21 | /certificates | Admin/authorized issuer; placement read | B; anonymous → login | 23 reachable; B | 2 reachable; B | 8 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G17 G18 | BLOCKED |
| P22 | /crm/followups | Admin, counsellor | B; anonymous → login | 47 reachable; B | 2 reachable; B | 6 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G15 G38 | BLOCKED |
| P23 | /crm/leads | Admin, counsellor | B; anonymous → login | 32 reachable; B | 1 reachable; B | 9 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G15 G36 G38 G41 | BLOCKED |
| P24 | /dashboard | Admin; role-specific staff restrictions | B; anonymous → login | 15 reachable; B | 0 reachable; B | 1 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G09 G15 | BLOCKED |
| P25 | /login | Public; all nine roles | anonymous content/redirect checked | 12 reachable; B | 3 reachable; B | 3 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | 375/768/1366/1920 geometry | G02 G11 G12 G20 G46 | FAILED |
| P26 | /onboarding | Admin, assigned onboarding team | B; anonymous → login | 46 reachable; B | 4 reachable; B | 7 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G03 G07 G10 | BLOCKED |
| P27 | /placement | Admin, placement coordinator | B; anonymous → login | 33 reachable; B | 4 reachable; B | 7 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G24 G25 G26 | BLOCKED |
| P28 | /placement/enrollments | Admin, placement coordinator | B; anonymous → login | 36 reachable; B | 8 reachable; B | 2 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G24 G26 | BLOCKED |
| P29 | /portal | Student owner; staff preview limited by mode | B; anonymous → login | 81 reachable; B | 8 reachable; B | 22 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G03 G13 G14 G16 G17 G31 G34 | BLOCKED |
| P30 | /settings | Admin, super admin | B; anonymous → login | 13 reachable; B | 1 reachable; B | 2 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G21 G28 G29 | BLOCKED |
| P31 | /students | Scoped staff; admin | B; anonymous → login | 25 reachable; B | 0 reachable; B | 5 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G09 G15 | BLOCKED |
| P32 | /students/[id] | Scoped staff; admin | B; anonymous → login | 41 reachable; B | 2 reachable; B | 14 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G09 G17 G35 G42 | BLOCKED |
| P33 | /support | Support, trainer, admin; student via portal | B; anonymous → login | 28 reachable; B | 2 reachable; B | 8 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G15 G43 | BLOCKED |
| P34 | /todos | Super admin | B; anonymous → login | 0 reachable; B | 0 reachable; B | 0 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G02 | BLOCKED |
| P35 | /users | Admin, super admin | B; anonymous → login | 28 reachable; B | 3 reachable; B | 2 literal dependencies; scoped checks only | B; source traced | anonymous boundary checked; roles B | B | G19 G20 | BLOCKED |

## Complete inventory and individual source review

Dependency lists below are conservative static import reachability, including layouts; broad shared services can add tables not executed by that page. They are not runtime network traces. Absence of a loading/error/pagination token is a review cue, not proof of absent nested UI.

### P01 /

- Main component: `RootPage`; source: [app/page.tsx](../../app/page.tsx).
- Module: Entry; intended role: Public redirect.
- Review: Role-aware entry redirect; anonymous request reaches login.
- API literals: none discovered; direct services/redirect.
- Database table literals: `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":[],"loading":false,"empty":false,"error":true,"pagination":false}`.
- Redirect declarations: /login.
- All control IDs: none; redirect only. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: limited anonymous evidence in browser-results.json.

### P02 /academics/assessments

- Main component: `AssessmentsPage`; source: [app/(dashboard)/academics/assessments/page.tsx](../../app/(dashboard)/academics/assessments/page.tsx).
- Module: academics; intended role: Admin, trainer; scoped student.
- Review: Create/edit assessments, questions, publish, review submissions; quiz scoring risks G14.
- API literals: `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `courses`, `batches`, `batch_transfer_audits`, `students`, `class_sessions`, `attendance_records`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`, `audit_logs`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/academics-service.ts`, `lib/services/audit-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Assessments & Certification Exams","No assessments available","","Solution & Feedback Review"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0001, C0002, C0003, C0004, C0005, C0006, C0007, C0008, C0009, C0010, C0011, C0012, C0013, C0014, C0015, C0016, C0017, C0018, C0019, C0020, C0021, C0022, C0023, C0024, C0025, C0026, C0027, C0028, C0029, C0030, C0031, C0032, C0033, C0034, C0035, C0036, C0037, C0038, C0039, C0040, C0041, C0042, C0043, C0044, C0045, C0046, C0047, C0048, C0049, C0050, C0051, C0052, C0053, C0054, C0055, C0056, C0057, C0058, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P03 /academics/assignments

- Main component: `AssignmentsPage`; source: [app/(dashboard)/academics/assignments/page.tsx](../../app/(dashboard)/academics/assignments/page.tsx).
- Module: academics; intended role: Admin, trainer; scoped student.
- Review: Assignment create/edit, uploads, submission and grading; returned DB errors need verification.
- API literals: `/api/fees/proof`, `/api/upload`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `courses`, `batches`, `batch_transfer_audits`, `students`, `class_sessions`, `attendance_records`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`, `audit_logs`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/storage-service.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/academics-service.ts`, `lib/services/audit-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["","No assignments posted yet",""],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0059, C0060, C0061, C0062, C0063, C0064, C0065, C0066, C0067, C0068, C0069, C0070, C0071, C0072, C0073, C0074, C0075, C0076, C0077, C0078, C0079, C0080, C0081, C0082, C0083, C0084, C0085, C0086, C0087, C0088, C0089, C0090, C0091, C0092, C0093, C0094, C0095, C0096, C0097, C0098, C0099, C0100, C0101, C0102, C0103, C0104, C0105, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1487, C1488, C1489, C1490, C1491, C1492, C1493, C1494, C1495, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P04 /academics/attendance

- Main component: `AttendancePage`; source: [app/(dashboard)/academics/attendance/page.tsx](../../app/(dashboard)/academics/attendance/page.tsx).
- Module: academics; intended role: Admin, assigned trainer.
- Review: Batch/date register, marking, meeting sync/logs, CSV export; render dependency loop found.
- API literals: `/api/attendance/sync-meeting`, `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `courses`, `batches`, `batch_transfer_audits`, `students`, `class_sessions`, `attendance_records`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`, `audit_logs`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/academics-service.ts`, `lib/services/audit-service.ts`, `lib/services/realtime-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Attendance Registers & Automated Tracking"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0106, C0107, C0108, C0109, C0110, C0111, C0112, C0113, C0114, C0115, C0116, C0117, C0118, C0119, C0120, C0121, C0122, C0123, C0124, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P05 /academics/batches

- Main component: `BatchesPage`; source: [app/(dashboard)/academics/batches/page.tsx](../../app/(dashboard)/academics/batches/page.tsx).
- Module: academics; intended role: Admin, assigned trainer; scoped staff reads.
- Review: Batch CRUD, capacity, trainer/course allocation and roster. Local count races unverified.
- API literals: `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `courses`, `batches`, `batch_transfer_audits`, `students`, `class_sessions`, `attendance_records`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`, `audit_logs`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/academics-service.ts`, `lib/services/audit-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["SAP Batch Management","No batches available",""],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0125, C0126, C0127, C0128, C0129, C0130, C0131, C0132, C0133, C0134, C0135, C0136, C0137, C0138, C0139, C0140, C0141, C0142, C0143, C0144, C0145, C0146, C0147, C0148, C0149, C0150, C0151, C0152, C0153, C0154, C0155, C0156, C0157, C0158, C0159, C0160, C0161, C0162, C0163, C0164, C0165, C0166, C0167, C0168, C0169, C0170, C0171, C0172, C0173, C0174, C0175, C0176, C0177, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P06 /academics/courses

- Main component: `CoursesPage`; source: [app/(dashboard)/academics/courses/page.tsx](../../app/(dashboard)/academics/courses/page.tsx).
- Module: academics; intended role: Admin, assigned trainer; counsellor read.
- Review: Course/module/lesson authoring and media/document presentation; empty-state guards exist.
- API literals: `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `courses`, `batches`, `batch_transfer_audits`, `students`, `class_sessions`, `attendance_records`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`, `audit_logs`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/academics-service.ts`, `lib/services/audit-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["SAP Course & Curriculum LMS","No Assigned SAP Courses","No Courses Available","","Reference Handout / Manual","Interactive Assessment / Lab Task"],"loading":false,"empty":true,"error":false,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0178, C0179, C0180, C0181, C0182, C0183, C0184, C0185, C0186, C0187, C0188, C0189, C0190, C0191, C0192, C0193, C0194, C0195, C0196, C0197, C0198, C0199, C0200, C0201, C0202, C0203, C0204, C0205, C0206, C0207, C0208, C0209, C0210, C0211, C0212, C0213, C0214, C0215, C0216, C0217, C0218, C0219, C0220, C0221, C0222, C0223, C0224, C0225, C0226, C0227, C0228, C0229, C0230, C0231, C0232, C0233, C0234, C0235, C0236, C0237, C0238, C0239, C0240, C0241, C0242, C0243, C0244, C0245, C0246, C0247, C0248, C0249, C0250, C0251, C0252, C0253, C0254, C0255, C0256, C0257, C0258, C0259, C0260, C0261, C0262, C0263, C0264, C0265, C0266, C0267, C0268, C0269, C0270, C0271, C0272, C0273, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P07 /academics/sap-servers

- Main component: `SapServersPage`; source: [app/(dashboard)/academics/sap-servers/page.tsx](../../app/(dashboard)/academics/sap-servers/page.tsx).
- Module: academics; intended role: Admin, trainer; student allocation view.
- Review: Server systems and student allocation forms expose lab credentials to authorized UI; scope unverified.
- API literals: `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `sap_server_systems`, `sap_server_allocations`, `audit_logs`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/sap-lab-service.ts`, `lib/services/audit-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["","No SAP Server Infrastructure Configured","Student Enrollment Profile Not Linked"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0274, C0275, C0276, C0277, C0278, C0279, C0280, C0281, C0282, C0283, C0284, C0285, C0286, C0287, C0288, C0289, C0290, C0291, C0292, C0293, C0294, C0295, C0296, C0297, C0298, C0299, C0300, C0301, C0302, C0303, C0304, C0305, C0306, C0307, C0308, C0309, C0310, C0311, C0312, C0313, C0314, C0315, C0316, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P08 /academics/schedule

- Main component: `SchedulePage`; source: [app/(dashboard)/academics/schedule/page.tsx](../../app/(dashboard)/academics/schedule/page.tsx).
- Module: academics; intended role: Admin, assigned trainer; scoped student/support.
- Review: Session scheduling, cohort lookup, meeting operations and calendar views.
- API literals: `/api/conference/create-meeting`, `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `courses`, `batches`, `batch_transfer_audits`, `students`, `class_sessions`, `attendance_records`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`, `audit_logs`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/academics-service.ts`, `lib/services/audit-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["","Student Enrollment Profile Not Linked","Cohort Assignment Pending","No sessions scheduled for this"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0317, C0318, C0319, C0320, C0321, C0322, C0323, C0324, C0325, C0326, C0327, C0328, C0329, C0330, C0331, C0332, C0333, C0334, C0335, C0336, C0337, C0338, C0339, C0340, C0341, C0342, C0343, C0344, C0345, C0346, C0347, C0348, C0349, C0350, C0351, C0352, C0353, C0354, C0355, C0356, C0357, C0358, C0359, C0360, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P09 /accounts/approvals

- Main component: `FeeApprovalsPage`; source: [app/(dashboard)/accounts/approvals/page.tsx](../../app/(dashboard)/accounts/approvals/page.tsx).
- Module: accounts; intended role: Accounts, admin/super admin; counsellor own submissions.
- Review: Fee proposals and payment decisions; review proof, approve/reject, record reasons. API uses session actor.
- API literals: `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/audit-logs`, `/api/fees/proof`, `/api/upload`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/workflow/notifications`.
- Database table literals: `admissions`, `students`, `student_fee_accounts`, `leads`, `audit_logs`, `profiles`, `notifications`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/payment-workflow-client.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/admission-service.ts`, `lib/services/audit-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/fee-workflow-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/storage-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Global LMS Fee Approvals Desk"],"loading":true,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0361, C0362, C0363, C0364, C0365, C0366, C0367, C0368, C0369, C0370, C0371, C0372, C0373, C0374, C0375, C0376, C0377, C0378, C0379, C0380, C0381, C0382, C0383, C0384, C0385, C0386, C0387, C0388, C0389, C0390, C0391, C0392, C0393, C0394, C0395, C0396, C0397, C0398, C0399, C0400, C0401, C0402, C0403, C0404, C0405, C0406, C0407, C0408, C0409, C0410, C0411, C0412, C0413, C0414, C0415, C0416, C0417, C0418, C0419, C0420, C0421, C0422, C0423, C0424, C0425, C0426, C0427, C0428, C0429, C0430, C0431, C0432, C0433, C0434, C0435, C0436, C0437, C0438, C0439, C0440, C0441, C0442, C0443, C0444, C0445, C0446, C0447, C0448, C0449, C0450, C0451, C0452, C0453, C0454, C0455, C0456, C0457, C0458, C0459, C0460, C0461, C0462, C0463, C0464, C0465, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1487, C1488, C1489, C1490, C1491, C1492, C1493, C1494, C1495, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P10 /accounts/expenses

- Main component: `ExpensesPage`; source: [app/(dashboard)/accounts/expenses/page.tsx](../../app/(dashboard)/accounts/expenses/page.tsx).
- Module: accounts; intended role: Accounts/admin.
- Review: Expense create/edit/status and vendor outflows; persistence and duplicate submissions blocked.
- API literals: `/api/receipts/${receiptNumber}/pdf`, `/api/receipts/${newReceipt.id}/pdf`, `/api/audit-logs`, `/api/receipts/${receipt.id}/pdf`, `/api/certificates/${cert.certificate_id}/pdf`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `student_fee_accounts`, `payments`, `receipts`, `students`, `expenses`, `vendors`, `audit_logs`, `notifications`, `admissions`, `leads`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/finance-service.ts`, `lib/services/audit-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/pdf-service.ts`, `lib/services/finance-formatters.ts`, `lib/services/storage-service.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-client.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/admission-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/fee-workflow-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Institute Expense & Vendor Outflows"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0466, C0467, C0468, C0469, C0470, C0471, C0472, C0473, C0474, C0475, C0476, C0477, C0478, C0479, C0480, C0481, C0482, C0483, C0484, C0485, C0486, C0487, C0488, C0489, C0490, C0491, C0492, C0493, C0494, C0495, C0496, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P11 /accounts/fees

- Main component: `StudentFeesPage`; source: [app/(dashboard)/accounts/fees/page.tsx](../../app/(dashboard)/accounts/fees/page.tsx).
- Module: accounts; intended role: Accounts/admin; scoped counsellor.
- Review: Student fee account list, search and balance views; authoritative reconciliation blocked.
- API literals: `/api/workflow/notifications`.
- Database table literals: `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Student Fee Accounts Ledger"],"loading":false,"empty":true,"error":false,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0497, C0498, C0499, C0500, C0501, C0502, C0503, C0504, C0505, C0506, C0507, C0508, C0509, C0510, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P12 /accounts/installments

- Main component: `RetiredInstallmentsPage`; source: [app/(dashboard)/accounts/installments/page.tsx](../../app/(dashboard)/accounts/installments/page.tsx).
- Module: accounts; intended role: Financial role via redirect.
- Review: Retired management route redirects to /accounts/fees; historical records remain in models.
- API literals: `/api/workflow/notifications`.
- Database table literals: `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":[],"loading":false,"empty":false,"error":false,"pagination":false}`.
- Redirect declarations: /accounts/fees.
- All control IDs: C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P13 /accounts/payments

- Main component: `PaymentsPage`; source: [app/(dashboard)/accounts/payments/page.tsx](../../app/(dashboard)/accounts/payments/page.tsx).
- Module: accounts; intended role: Accounts/admin; counsellor own submissions.
- Review: Payment entry/edit, date, proof and references; pending approval and verified ledger paths.
- API literals: `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/audit-logs`, `/api/fees/proof`, `/api/upload`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/workflow/notifications`.
- Database table literals: `admissions`, `students`, `student_fee_accounts`, `leads`, `audit_logs`, `profiles`, `notifications`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/payment-workflow-client.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/admission-service.ts`, `lib/services/audit-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/fee-workflow-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/storage-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Fee Payments & Verification Desk"],"loading":true,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0511, C0512, C0513, C0514, C0515, C0516, C0517, C0518, C0519, C0520, C0521, C0522, C0523, C0524, C0525, C0526, C0527, C0528, C0529, C0530, C0531, C0532, C0533, C0534, C0535, C0536, C0537, C0538, C0539, C0540, C0541, C0542, C0543, C0544, C0545, C0546, C0547, C0548, C0549, C0550, C0551, C0552, C0553, C0554, C0555, C0556, C0557, C0558, C0559, C0560, C0561, C0562, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1487, C1488, C1489, C1490, C1491, C1492, C1493, C1494, C1495, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P14 /accounts/receipts

- Main component: `ReceiptsListPage`; source: [app/(dashboard)/accounts/receipts/page.tsx](../../app/(dashboard)/accounts/receipts/page.tsx).
- Module: accounts; intended role: Accounts/admin; scoped staff.
- Review: Receipt list, search, print/PDF and void dialog; optimistic failure fallback removed.
- API literals: `/api/receipts/${encodeURIComponent(r.id`, `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `admissions`, `students`, `student_fee_accounts`, `leads`, `audit_logs`, `profiles`, `notifications`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/payment-workflow-client.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/admission-service.ts`, `lib/services/audit-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/fee-workflow-service.ts`, `lib/services/receipt-amounts.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Signed Official Receipts Registry","No receipts match &ldquo;","No official fee receipts found"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0563, C0564, C0565, C0566, C0567, C0568, C0569, C0570, C0571, C0572, C0573, C0574, C0575, C0576, C0577, C0578, C0579, C0580, C0581, C0582, C0583, C0584, C0585, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P15 /accounts/receipts/[id]

- Main component: `ReceiptPrintPage`; source: [app/(dashboard)/accounts/receipts/[id]/page.tsx](../../app/(dashboard)/accounts/receipts/[id]/page.tsx).
- Module: accounts; intended role: Accounts/admin; student owner.
- Review: Dynamic receipt lookup, access check, print/download and totals; valid/invalid authorized IDs blocked.
- API literals: `/api/fees/receipts`, `/api/receipts/${receipt.id}/pdf`, `/api/workflow/notifications`.
- Database table literals: `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/payment-workflow-state.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/finance-formatters.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Receipt Not Found","Access Restricted","Official Fee Receipt"],"loading":false,"empty":false,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0586, C0587, C0588, C0589, C0590, C0591, C0592, C0593, C0594, C0595, C0596, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P16 /accounts/reports

- Main component: `FinanceReportsPage`; source: [app/(dashboard)/accounts/reports/page.tsx](../../app/(dashboard)/accounts/reports/page.tsx).
- Module: accounts; intended role: Accounts/admin.
- Review: Financial aggregates, fees/collections/dues and export; snapshot consistency unverified.
- API literals: `/api/receipts/${receiptNumber}/pdf`, `/api/receipts/${newReceipt.id}/pdf`, `/api/audit-logs`, `/api/receipts/${receipt.id}/pdf`, `/api/certificates/${cert.certificate_id}/pdf`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `student_fee_accounts`, `payments`, `receipts`, `students`, `expenses`, `vendors`, `audit_logs`, `notifications`, `admissions`, `leads`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/finance-service.ts`, `lib/services/audit-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/pdf-service.ts`, `lib/services/finance-formatters.ts`, `lib/services/storage-service.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-client.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/admission-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/fee-workflow-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Financial Intelligence & Analytics","= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>"],"loading":false,"empty":true,"error":false,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0597, C0598, C0599, C0600, C0601, C0602, C0603, C0604, C0605, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P17 /accounts/vendors

- Main component: `VendorsPage`; source: [app/(dashboard)/accounts/vendors/page.tsx](../../app/(dashboard)/accounts/vendors/page.tsx).
- Module: accounts; intended role: Accounts/admin.
- Review: Vendor add/edit/archive/delete and optional tax identification; not the removed student-fee GST input.
- API literals: `/api/receipts/${receiptNumber}/pdf`, `/api/receipts/${newReceipt.id}/pdf`, `/api/audit-logs`, `/api/receipts/${receipt.id}/pdf`, `/api/certificates/${cert.certificate_id}/pdf`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `student_fee_accounts`, `payments`, `receipts`, `students`, `expenses`, `vendors`, `audit_logs`, `notifications`, `admissions`, `leads`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/finance-service.ts`, `lib/services/audit-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/pdf-service.ts`, `lib/services/finance-formatters.ts`, `lib/services/storage-service.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-client.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/admission-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/fee-workflow-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Vendor Management"],"loading":false,"empty":true,"error":false,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0606, C0607, C0608, C0609, C0610, C0611, C0612, C0613, C0614, C0615, C0616, C0617, C0618, C0619, C0620, C0621, C0622, C0623, C0624, C0625, C0626, C0627, C0628, C0629, C0630, C0631, C0632, C0633, C0634, C0635, C0636, C0637, C0638, C0639, C0640, C0641, C0642, C0643, C0644, C0645, C0646, C0647, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P18 /admissions

- Main component: `AdmissionsPage`; source: [app/(dashboard)/admissions/page.tsx](../../app/(dashboard)/admissions/page.tsx).
- Module: admissions; intended role: Admin, counsellor.
- Review: Enrollment form captures Fee Due Date and optional proof/payment; no GST/installment plan selector.
- API literals: `/api/fees/proof`, `/api/upload`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/audit-logs`, `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/workflow/notifications`.
- Database table literals: `admissions`, `students`, `student_fee_accounts`, `leads`, `audit_logs`, `profiles`, `notifications`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/storage-service.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/admission-service.ts`, `lib/services/audit-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/fee-workflow-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/payment-workflow-client.ts`, `lib/services/finance-formatters.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Student Admissions","Academic Course & Batch Assignment","Fee Details",""],"loading":true,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0648, C0649, C0650, C0651, C0652, C0653, C0654, C0655, C0656, C0657, C0658, C0659, C0660, C0661, C0662, C0663, C0664, C0665, C0666, C0667, C0668, C0669, C0670, C0671, C0672, C0673, C0674, C0675, C0676, C0677, C0678, C0679, C0680, C0681, C0682, C0683, C0684, C0685, C0686, C0687, C0688, C0689, C0690, C0691, C0692, C0693, C0694, C0695, C0696, C0697, C0698, C0699, C0700, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1487, C1488, C1489, C1490, C1491, C1492, C1493, C1494, C1495, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P19 /audit-logs

- Main component: `AuditLogsPage`; source: [app/(dashboard)/audit-logs/page.tsx](../../app/(dashboard)/audit-logs/page.tsx).
- Module: audit-logs; intended role: Admin, super admin.
- Review: Audit search/filter/details/pagination; endpoint denies anonymous but does not tenant-filter cached logs.
- API literals: `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `audit_logs`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/audit-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","System Security & Audit Trail","Previous State (Before Mutation):","New State / Action Payload:"],"loading":true,"empty":true,"error":true,"pagination":true}`.
- Redirect declarations: none literal in page.
- All control IDs: C0701, C0702, C0703, C0704, C0705, C0706, C0707, C0708, C0709, C0710, C0711, C0712, C0713, C0714, C0715, C0716, C0717, C0718, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P20 /certificate/verify/[id]

- Main component: `CertificateVerifyPage`; source: [app/certificate/verify/[id]/page.tsx](../../app/certificate/verify/[id]/page.tsx).
- Module: certificate; intended role: Public.
- Review: Dynamic certificate status display; missing synthetic ID rendered successfully. Valid/revoked cases blocked.
- API literals: `/api/certificates/${cert.certificate_id}/pdf`.
- Database table literals: `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Next-Gen ERP Solutions","Certificate Not Found","","Authentic & Verified Certificate","Next-Gen ERP Solutions","",""],"loading":false,"empty":false,"error":false,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C1249, C1250, C1251, C1252, C1253, C1254, C1255, C1256, C1486. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: limited anonymous evidence in browser-results.json.

### P21 /certificates

- Main component: `CertificatesPage`; source: [app/(dashboard)/certificates/page.tsx](../../app/(dashboard)/certificates/page.tsx).
- Module: certificates; intended role: Admin/authorized issuer; placement read.
- Review: Eligibility, issuance, verification and revocation; absent exam attempts still get 85% fallback.
- API literals: `/api/certificates/${cert.certificate_id}/pdf`, `/api/certificates/${certificate_id}/pdf`, `/api/audit-logs`, `/api/receipts/${receipt.id}/pdf`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/workflow/notifications`.
- Database table literals: `audit_logs`, `notifications`, `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/certificate-service.ts`, `lib/services/audit-service.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/pdf-service.ts`, `lib/services/finance-formatters.ts`, `lib/services/storage-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Course Completion Certificates"],"loading":false,"empty":true,"error":false,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0719, C0720, C0721, C0722, C0723, C0724, C0725, C0726, C0727, C0728, C0729, C0730, C0731, C0732, C0733, C0734, C0735, C0736, C0737, C0738, C0739, C0740, C0741, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P22 /crm/followups

- Main component: `FollowupsPage`; source: [app/(dashboard)/crm/followups/page.tsx](../../app/(dashboard)/crm/followups/page.tsx).
- Module: crm; intended role: Admin, counsellor.
- Review: Follow-up/demo schedule, status and filters; notifications/durable delivery blocked.
- API literals: `/api/audit-logs`, `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `leads`, `lead_followups`, `audit_logs`, `admissions`, `students`, `student_fee_accounts`, `notifications`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/crm-service.ts`, `lib/services/audit-service.ts`, `lib/services/admission-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/fee-workflow-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/payment-workflow-client.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Follow-ups & Demo Calendar","No Scheduled Follow-ups Found","No Matching Follow-ups Found"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0742, C0743, C0744, C0745, C0746, C0747, C0748, C0749, C0750, C0751, C0752, C0753, C0754, C0755, C0756, C0757, C0758, C0759, C0760, C0761, C0762, C0763, C0764, C0765, C0766, C0767, C0768, C0769, C0770, C0771, C0772, C0773, C0774, C0775, C0776, C0777, C0778, C0779, C0780, C0781, C0782, C0783, C0784, C0785, C0786, C0787, C0788, C0789, C0790, C0791, C0792, C0793, C0794, C0795, C0796, C0797, C0798, C0799, C0800, C0801, C0802, C0803, C0804, C0805, C0806, C0807, C0808, C0809, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P23 /crm/leads

- Main component: `LeadsPage`; source: [app/(dashboard)/crm/leads/page.tsx](../../app/(dashboard)/crm/leads/page.tsx).
- Module: crm; intended role: Admin, counsellor.
- Review: Lead capture/edit/filter/export, stage, assignment and admission handoff.
- API literals: `/api/bulk-import/template`, `/api/bulk-import/preview`, `/api/bulk-import/execute`, `/api/audit-logs`, `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/workflow/notifications`.
- Database table literals: `audit_logs`, `students`, `attendance_records`, `notifications`, `profiles`, `leads`, `lead_followups`, `admissions`, `student_fee_accounts`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/bulk-import-service.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/audit-service.ts`, `lib/services/realtime-service.ts`, `lib/services/meeting-attendance-service.ts`, `lib/services/notification-service.ts`, `lib/services/crm-service.ts`, `lib/services/admission-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/fee-workflow-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/payment-workflow-client.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","CRM & Lead Management"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0810, C0811, C0812, C0813, C0814, C0815, C0816, C0817, C0818, C0819, C0820, C0821, C0822, C0823, C0824, C0825, C0826, C0827, C0828, C0829, C0830, C0831, C0832, C0833, C0834, C0835, C0836, C0837, C0838, C0839, C0840, C0841, C0842, C0843, C0844, C0845, C0846, C0847, C0848, C0849, C0850, C0851, C0852, C0853, C0854, C0855, C0856, C0857, C0858, C0859, C0860, C0861, C0862, C0863, C1371, C1372, C1373, C1374, C1375, C1376, C1377, C1378, C1379, C1380, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P24 /dashboard

- Main component: `DashboardPage`; source: [app/(dashboard)/dashboard/page.tsx](../../app/(dashboard)/dashboard/page.tsx).
- Module: dashboard; intended role: Admin; role-specific staff restrictions.
- Review: Executive counts, financial and pipeline panels; no authoritative database comparison possible.
- API literals: `/api/workflow/notifications`.
- Database table literals: `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Enterprise Institute Executive Dashboard","","= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>",""],"loading":false,"empty":true,"error":false,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0864, C0865, C0866, C0867, C0868, C0869, C0870, C0871, C0872, C0873, C0874, C0875, C0876, C0877, C0878, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P25 /login

- Main component: `LoginPage`; source: [app/login/page.tsx](../../app/login/page.tsx).
- Module: login; intended role: Public; all nine roles.
- Review: Login, show-password, preset roles and recovery; native POST does not leak credentials but failure is invisible without JS.
- API literals: `/api/auth/update-password`, `/api/auth/recover-password`, `/api/auth/login`.
- Database table literals: `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Build skills.",""],"loading":false,"empty":false,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C1257, C1258, C1259, C1260, C1261, C1262, C1263, C1264, C1265, C1266, C1267, C1268, C1269, C1270, C1271, C1272, C1273, C1274, C1275, C1276, C1486. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: limited anonymous evidence in browser-results.json.

### P26 /onboarding

- Main component: `OnboardingPage`; source: [app/(dashboard)/onboarding/page.tsx](../../app/(dashboard)/onboarding/page.tsx).
- Module: onboarding; intended role: Admin, assigned onboarding team.
- Review: Assignment, 11-item checklist, documents, course/batch/trainer, activation and audit.
- API literals: `/api/fees/proof`, `/api/upload`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/onboarding${path}`, `/api/workflow/notifications`.
- Database table literals: `profiles`, `notifications`, `fee_workflow_state`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/storage-service.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/onboarding-client.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/payment-workflow-state.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Student Onboarding & Handoff Workspace","Mandatory Onboarding Verification Checklist (11 Steps)","Submitted Student Documents (","Audited Onboarding Action Log"],"loading":true,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0879, C0880, C0881, C0882, C0883, C0884, C0885, C0886, C0887, C0888, C0889, C0890, C0891, C0892, C0893, C0894, C0895, C0896, C0897, C0898, C0899, C0900, C0901, C0902, C0903, C0904, C0905, C0906, C0907, C0908, C0909, C0910, C0911, C0912, C0913, C0914, C0915, C0916, C0917, C0918, C0919, C0920, C0921, C0922, C0923, C0924, C0925, C0926, C0927, C0928, C0929, C0930, C0931, C0932, C0933, C0934, C0935, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1487, C1488, C1489, C1490, C1491, C1492, C1493, C1494, C1495, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P27 /placement

- Main component: `PlacementPage`; source: [app/(dashboard)/placement/page.tsx](../../app/(dashboard)/placement/page.tsx).
- Module: placement; intended role: Admin, placement coordinator.
- Review: Jobs, profiles, applications, status, referral and interview-related controls; unchecked remote writes remain.
- API literals: `/api/fees/proof`, `/api/upload`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `placement_profiles`, `job_openings`, `job_applications`, `placement_enrollments`, `audit_logs`, `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/storage-service.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/placement-service.ts`, `lib/services/audit-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Placement Cell & Corporate Hiring","",""],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C1007, C1008, C1009, C1010, C1011, C1012, C1013, C1014, C1015, C1016, C1017, C1018, C1019, C1020, C1021, C1022, C1023, C1024, C1025, C1026, C1027, C1028, C1029, C1030, C1031, C1032, C1033, C1034, C1035, C1036, C1037, C1038, C1039, C1040, C1041, C1042, C1043, C1044, C1045, C1046, C1047, C1048, C1049, C1050, C1051, C1052, C1053, C1054, C1055, C1056, C1057, C1058, C1059, C1060, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1487, C1488, C1489, C1490, C1491, C1492, C1493, C1494, C1495, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P28 /placement/enrollments

- Main component: `PlacementEnrollmentsPage`; source: [app/(dashboard)/placement/enrollments/page.tsx](../../app/(dashboard)/placement/enrollments/page.tsx).
- Module: placement; intended role: Admin, placement coordinator.
- Review: Enrollment review, declarations, documents, notes, status, assignment, override and eligibility.
- API literals: `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `placement_profiles`, `job_openings`, `job_applications`, `placement_enrollments`, `audit_logs`, `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/placement-service.ts`, `lib/services/audit-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Placement Enrollments & Candidate Review","","","","","","","","Internal Placement Notes",""],"loading":true,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C0936, C0937, C0938, C0939, C0940, C0941, C0942, C0943, C0944, C0945, C0946, C0947, C0948, C0949, C0950, C0951, C0952, C0953, C0954, C0955, C0956, C0957, C0958, C0959, C0960, C0961, C0962, C0963, C0964, C0965, C0966, C0967, C0968, C0969, C0970, C0971, C0972, C0973, C0974, C0975, C0976, C0977, C0978, C0979, C0980, C0981, C0982, C0983, C0984, C0985, C0986, C0987, C0988, C0989, C0990, C0991, C0992, C0993, C0994, C0995, C0996, C0997, C0998, C0999, C1000, C1001, C1002, C1003, C1004, C1005, C1006, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P29 /portal

- Main component: `StudentPortalPage`; source: [app/portal/page.tsx](../../app/portal/page.tsx).
- Module: portal; intended role: Student owner; staff preview limited by mode.
- Review: Course video/materials, assignments/quizzes, fees, attendance, lab, certificates, support and placement tabs.
- API literals: `/api/payments/verify`, `/api/payments/create-order`, `/api/receipts/${r`, `/api/certificates/${certificate.certificate_id}/pdf`, `/api/receipts/${successReceipt.id}/pdf`, `/api/receipts/${selectedReceiptForModal.id}/pdf`, `/api/fees/proof`, `/api/upload`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/audit-logs`, `/api/receipts/${receiptNumber}/pdf`, `/api/receipts/${newReceipt.id}/pdf`, `/api/receipts/${receipt.id}/pdf`, `/api/certificates/${cert.certificate_id}/pdf`, `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/realtime/stream`, `/api/quizzes/submit`.
- Database table literals: `profiles`, `courses`, `batches`, `batch_transfer_audits`, `students`, `class_sessions`, `attendance_records`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`, `audit_logs`, `sap_server_systems`, `sap_server_allocations`, `student_fee_accounts`, `payments`, `receipts`, `expenses`, `vendors`, `notifications`, `admissions`, `leads`, `fee_workflow_state`, `student_doubts`, `doubt_messages`, `placement_profiles`, `job_openings`, `job_applications`, `placement_enrollments`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/storage-service.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/academics-service.ts`, `lib/services/audit-service.ts`, `lib/services/sap-lab-service.ts`, `lib/services/finance-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/pdf-service.ts`, `lib/services/finance-formatters.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-client.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/admission-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/fee-workflow-service.ts`, `lib/services/doubt-service.ts`, `lib/services/placement-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["No Active Enrollment Found","Student Learning Portal","","No Video Lessons Available","","Graduation Certificate Available!","Payment Reference Submitted!","Payment Successfully Processed!","",""],"loading":true,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C1277, C1278, C1279, C1280, C1281, C1282, C1283, C1284, C1285, C1286, C1287, C1288, C1289, C1290, C1291, C1292, C1293, C1294, C1295, C1296, C1297, C1298, C1299, C1300, C1301, C1302, C1303, C1304, C1305, C1306, C1307, C1308, C1309, C1310, C1311, C1312, C1313, C1314, C1315, C1316, C1317, C1318, C1319, C1320, C1321, C1322, C1323, C1324, C1325, C1326, C1327, C1328, C1329, C1330, C1331, C1332, C1333, C1334, C1335, C1336, C1337, C1338, C1339, C1340, C1341, C1342, C1343, C1344, C1345, C1346, C1347, C1348, C1349, C1350, C1351, C1352, C1353, C1354, C1355, C1356, C1357, C1358, C1359, C1360, C1361, C1362, C1363, C1364, C1365, C1366, C1367, C1421, C1422, C1423, C1424, C1425, C1426, C1427, C1428, C1429, C1430, C1431, C1432, C1433, C1434, C1435, C1436, C1437, C1438, C1439, C1440, C1441, C1442, C1443, C1444, C1445, C1446, C1447, C1448, C1449, C1450, C1451, C1452, C1453, C1454, C1455, C1456, C1457, C1458, C1459, C1460, C1461, C1462, C1463, C1464, C1465, C1466, C1467, C1468, C1469, C1470, C1471, C1472, C1473, C1474, C1475, C1476, C1477, C1478, C1479, C1480, C1481, C1482, C1483, C1484, C1485, C1486, C1487, C1488, C1489, C1490, C1491, C1492, C1493, C1494, C1495, C1496, C1497, C1498, C1499, C1500, C1501, C1502, C1503, C1504, C1505, C1506, C1507, C1508, C1509, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P30 /settings

- Main component: `SettingsPage`; source: [app/(dashboard)/settings/page.tsx](../../app/(dashboard)/settings/page.tsx).
- Module: settings; intended role: Admin, super admin.
- Review: Institution branding/settings, integrations and database operations; server POST now authenticates.
- API literals: `/api/settings`, `/api/workflow/notifications`.
- Database table literals: `system_settings`, `profiles`, `courses`, `sap_server_systems`, `leads`, `batches`, `students`, `attendance_records`, `admissions`, `student_fee_accounts`, `payments`, `receipts`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Institute System Settings"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C1061, C1062, C1063, C1064, C1065, C1066, C1067, C1068, C1069, C1070, C1071, C1072, C1073, C1074, C1075, C1076, C1077, C1078, C1079, C1080, C1081, C1082, C1083, C1084, C1085, C1086, C1087, C1088, C1089, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P31 /students

- Main component: `StudentsListPage`; source: [app/(dashboard)/students/page.tsx](../../app/(dashboard)/students/page.tsx).
- Module: students; intended role: Scoped staff; admin.
- Review: Student directory, search/filter/pagination, export and details navigation.
- API literals: `/api/bulk-import/template`, `/api/bulk-import/preview`, `/api/bulk-import/execute`, `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `audit_logs`, `students`, `attendance_records`, `notifications`, `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/bulk-import-service.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/audit-service.ts`, `lib/services/realtime-service.ts`, `lib/services/meeting-attendance-service.ts`, `lib/services/notification-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Student Directory (360° Management)","No students found matching your search"],"loading":false,"empty":true,"error":false,"pagination":true}`.
- Redirect declarations: none literal in page.
- All control IDs: C1090, C1091, C1092, C1093, C1094, C1095, C1096, C1097, C1098, C1099, C1100, C1101, C1102, C1103, C1104, C1105, C1106, C1107, C1108, C1109, C1110, C1371, C1372, C1373, C1374, C1375, C1376, C1377, C1378, C1379, C1380, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P32 /students/[id]

- Main component: `StudentDetailsPage`; source: [app/(dashboard)/students/[id]/page.tsx](../../app/(dashboard)/students/[id]/page.tsx).
- Module: students; intended role: Scoped staff; admin.
- Review: Student 360 tabs, batch transfer, payment/proof, certificates, documents and activity. Missing-record guard exists.
- API literals: `/api/fees/proof`, `/api/upload`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/fees/payments`, `/api/fees/proposals`, `/api/admissions`, `/api/fees/receipts`, `/api/audit-logs`, `/api/certificates/${certificate_id}/pdf`, `/api/receipts/${receipt.id}/pdf`, `/api/certificates/${cert.certificate_id}/pdf`, `/api/workflow/notifications`.
- Database table literals: `students`, `profiles`, `admissions`, `student_fee_accounts`, `leads`, `audit_logs`, `notifications`, `fee_workflow_state`, `courses`, `batches`, `batch_transfer_audits`, `class_sessions`, `attendance_records`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/storage-service.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/student-service.ts`, `lib/services/payment-workflow-client.ts`, `lib/services/payment-workflow-state.ts`, `lib/services/admission-service.ts`, `lib/services/audit-service.ts`, `lib/services/onboarding-service.ts`, `lib/services/payment-events.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`, `lib/services/payment-workflow-transaction.ts`, `lib/services/fee-workflow-service.ts`, `lib/services/receipt-amounts.ts`, `lib/services/academics-service.ts`, `lib/services/certificate-service.ts`, `lib/services/pdf-service.ts`, `lib/services/finance-formatters.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","No Onboarding Case Found","","","","","Certificate Issuance Eligibility Matrix","No Documents Uploaded Yet"],"loading":true,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C1111, C1112, C1113, C1114, C1115, C1116, C1117, C1118, C1119, C1120, C1121, C1122, C1123, C1124, C1125, C1126, C1127, C1128, C1129, C1130, C1131, C1132, C1133, C1134, C1135, C1136, C1137, C1138, C1139, C1140, C1141, C1142, C1143, C1144, C1145, C1146, C1147, C1148, C1149, C1150, C1151, C1152, C1153, C1154, C1155, C1156, C1157, C1158, C1159, C1160, C1161, C1162, C1163, C1164, C1165, C1166, C1167, C1168, C1169, C1170, C1171, C1172, C1173, C1174, C1175, C1176, C1177, C1178, C1179, C1180, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1487, C1488, C1489, C1490, C1491, C1492, C1493, C1494, C1495, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P33 /support

- Main component: `SupportDeskPage`; source: [app/(dashboard)/support/page.tsx](../../app/(dashboard)/support/page.tsx).
- Module: support; intended role: Support, trainer, admin; student via portal.
- Review: Ticket search/filter, assignment, reply, attachments, resolution and escalation.
- API literals: `/api/fees/proof`, `/api/upload`, `/api/storage/${bucket}/${storagePath}`, `/api/storage/${bucket}/${path}`, `/api/storage/signed`, `/api/realtime/stream`, `/api/audit-logs`, `/api/workflow/notifications`.
- Database table literals: `student_doubts`, `doubt_messages`, `audit_logs`, `notifications`, `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/storage-service.ts`, `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/doubt-service.ts`, `lib/services/audit-service.ts`, `lib/services/realtime-service.ts`, `lib/services/notification-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["Access Restricted","Academic & Technical Support Desk","Faculty Trainer Context"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C1181, C1182, C1183, C1184, C1185, C1186, C1187, C1188, C1189, C1190, C1191, C1192, C1193, C1194, C1195, C1196, C1197, C1198, C1199, C1200, C1201, C1202, C1203, C1204, C1205, C1206, C1207, C1208, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1487, C1488, C1489, C1490, C1491, C1492, C1493, C1494, C1495, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P34 /todos

- Main component: `TodosDiagnosticsPage`; source: [app/todos/page.tsx](../../app/todos/page.tsx).
- Module: todos; intended role: Super admin.
- Review: Implemented hidden diagnostic page; Supabase probe not executed as authenticated user. Inner fallback needs G02 review.
- API literals: none discovered; direct services/redirect.
- Database table literals: `profiles`, `todos`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":[""],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: /dashboard.
- All control IDs: C1368, C1369, C1370. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

### P35 /users

- Main component: `UsersPage`; source: [app/(dashboard)/users/page.tsx](../../app/(dashboard)/users/page.tsx).
- Module: users; intended role: Admin, super admin.
- Review: Create/edit/deactivate users, role selection, direct password reset and recovery-link dispatch.
- API literals: `/api/users/reset-password`, `/api/workflow/notifications`.
- Database table literals: `notifications`, `profiles`. Shared fee workflow uses fee_workflow_state/commit_fee_workflow; table literals alone do not prove persistence.
- Services: `lib/services/data-store.ts`, `lib/services/persistent-storage-adapter.ts`, `lib/services/auth-service.ts`, `lib/services/notification-service.ts`, `lib/services/realtime-service.ts`.
- Loading/empty/error/pagination source-token cues: `{"headings":["NEXT-GEN ERP SOLUTIONS","Access Restricted","Faculty & Staff RBAC Administration"],"loading":false,"empty":true,"error":true,"pagination":false}`.
- Redirect declarations: none literal in page.
- All control IDs: C1209, C1210, C1211, C1212, C1213, C1214, C1215, C1216, C1217, C1218, C1219, C1220, C1221, C1222, C1223, C1224, C1225, C1226, C1227, C1228, C1229, C1230, C1231, C1232, C1233, C1234, C1235, C1236, C1237, C1238, C1239, C1240, C1241, C1242, C1243, C1244, C1245, C1246, C1247, C1248, C1381, C1382, C1383, C1384, C1385, C1386, C1387, C1388, C1389, C1390, C1391, C1392, C1393, C1394, C1395, C1396, C1397, C1398, C1399, C1400, C1401, C1402, C1403, C1404, C1405, C1406, C1407, C1408, C1409, C1410, C1411, C1412, C1413, C1414, C1415, C1416, C1417, C1418, C1419, C1420, C1486, C1510, C1511. Each has an explicit row in ALL_BUTTONS_FORMS_AUDIT.md.
- Runtime: BLOCKED authenticated content, headings, data, errors, loading, table operations, keyboard/modal state, refresh and persistence.

## Role-by-page verification

| Role | P01 | P02 | P03 | P04 | P05 | P06 | P07 | P08 | P09 | P10 | P11 | P12 | P13 | P14 | P15 | P16 | P17 | P18 | P19 | P20 | P21 | P22 | P23 | P24 | P25 | P26 | P27 | P28 | P29 | P30 | P31 | P32 | P33 | P34 | P35 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| super_admin | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| admin | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| accountant | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| counsellor | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| trainer | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| placement_coordinator | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| support | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| onboarding_team | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| student | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |

All 315 cells include allowed-access and denied-access expectations; there were no authorized independent-DB sessions. Public anonymous tests do not count as role authentication.

## All API route files

| Route | Methods | Source | Guard cues | Validation cues | Runtime |
| --- | --- | --- | --- | --- | --- |
| /api/admissions | GET, POST | app/api/admissions/route.ts | authenticatePaymentRequest | 8 cues; not a validation proof | BLOCKED authenticated execution |
| /api/attendance/sync-meeting | POST, GET | app/api/attendance/sync-meeting/route.ts | No named guard detected; inspect inherited/helper path | 2 cues; not a validation proof | BLOCKED authenticated execution |
| /api/audit-logs | GET | app/api/audit-logs/route.ts | authenticateApiRequest | 2 cues; not a validation proof | GET 401 anonymous |
| /api/auth/login | POST | app/api/auth/login/route.ts | No named guard detected; inspect inherited/helper path | 5 cues; not a validation proof | BLOCKED authenticated execution |
| /api/auth/logout | POST, GET | app/api/auth/logout/route.ts | No named guard detected; inspect inherited/helper path | 0 cues; not a validation proof | BLOCKED authenticated execution |
| /api/bulk-import/execute | POST | app/api/bulk-import/execute/route.ts | authenticateApiRequest | 10 cues; not a validation proof | BLOCKED authenticated execution |
| /api/bulk-import/preview | POST | app/api/bulk-import/preview/route.ts | No named guard detected; inspect inherited/helper path | 2 cues; not a validation proof | BLOCKED authenticated execution |
| /api/bulk-import/template | GET | app/api/bulk-import/template/route.ts | No named guard detected; inspect inherited/helper path | 0 cues; not a validation proof | BLOCKED authenticated execution |
| /api/certificates/[id]/pdf | GET | app/api/certificates/[id]/pdf/route.ts | No named guard detected; inspect inherited/helper path | 1 cues; not a validation proof | BLOCKED authenticated execution |
| /api/conference/create-meeting | POST | app/api/conference/create-meeting/route.ts | No named guard detected; inspect inherited/helper path | 1 cues; not a validation proof | BLOCKED authenticated execution |
| /api/database/backup | GET, POST | app/api/database/backup/route.ts | authenticateApiRequest | 2 cues; not a validation proof | GET 401 anonymous |
| /api/database/health | GET | app/api/database/health/route.ts | No named guard detected; inspect inherited/helper path | 0 cues; not a validation proof | BLOCKED authenticated execution |
| /api/database/sync | POST | app/api/database/sync/route.ts | authenticateApiRequest | 1 cues; not a validation proof | BLOCKED authenticated execution |
| /api/fees/payments | GET, POST | app/api/fees/payments/route.ts | authenticatePaymentRequest | 10 cues; not a validation proof | GET 401 anonymous |
| /api/fees/proof | POST, GET | app/api/fees/proof/route.ts | authenticatePaymentRequest | 11 cues; not a validation proof | BLOCKED authenticated execution |
| /api/fees/proposals | POST | app/api/fees/proposals/route.ts | authenticatePaymentRequest | 9 cues; not a validation proof | BLOCKED authenticated execution |
| /api/fees/receipts | GET | app/api/fees/receipts/route.ts | authenticatePaymentRequest | 0 cues; not a validation proof | GET 401 anonymous |
| /api/onboarding/analytics | GET | app/api/onboarding/analytics/route.ts | authenticateApiRequest | 2 cues; not a validation proof | BLOCKED authenticated execution |
| /api/onboarding/backfill | POST | app/api/onboarding/backfill/route.ts | authenticateApiRequest | 3 cues; not a validation proof | BLOCKED authenticated execution |
| /api/onboarding/cases | GET, POST | app/api/onboarding/cases/route.ts | authenticateApiRequest | 6 cues; not a validation proof | GET 401 anonymous |
| /api/onboarding/cases/[id] | GET, PATCH | app/api/onboarding/cases/[id]/route.ts | authenticateApiRequest | 15 cues; not a validation proof | BLOCKED authenticated execution |
| /api/onboarding | GET, POST | app/api/onboarding/route.ts | No named guard detected; inspect inherited/helper path | 0 cues; not a validation proof | BLOCKED authenticated execution |
| /api/onboarding/[id] | GET, PATCH | app/api/onboarding/[id]/route.ts | No named guard detected; inspect inherited/helper path | 0 cues; not a validation proof | BLOCKED authenticated execution |
| /api/payments/create-order | POST | app/api/payments/create-order/route.ts | No named guard detected; inspect inherited/helper path | 3 cues; not a validation proof | BLOCKED authenticated execution |
| /api/payments/verify | POST | app/api/payments/verify/route.ts | verifyRazorpayPaymentSignature, getAuthenticatedUserFromRequest | 9 cues; not a validation proof | BLOCKED authenticated execution |
| /api/quizzes/submit | POST | app/api/quizzes/submit/route.ts | authenticateApiRequest | 3 cues; not a validation proof | BLOCKED authenticated execution |
| /api/realtime/broadcast | POST | app/api/realtime/broadcast/route.ts | authenticateApiRequest | 4 cues; not a validation proof | BLOCKED authenticated execution |
| /api/realtime/stream | GET | app/api/realtime/stream/route.ts | authenticateApiRequest | 2 cues; not a validation proof | GET 401 anonymous |
| /api/receipts/[id]/pdf | GET | app/api/receipts/[id]/pdf/route.ts | authenticatePaymentRequest | 1 cues; not a validation proof | BLOCKED authenticated execution |
| /api/settings | GET, POST | app/api/settings/route.ts | getAuthenticatedUserFromRequest | 4 cues; not a validation proof | GET 200 anonymous |
| /api/storage/signed | GET | app/api/storage/signed/route.ts | No named guard detected; inspect inherited/helper path | 4 cues; not a validation proof | BLOCKED authenticated execution |
| /api/storage/signed-url | POST, GET | app/api/storage/signed-url/route.ts | No named guard detected; inspect inherited/helper path | 3 cues; not a validation proof | BLOCKED authenticated execution |
| /api/upload | POST | app/api/upload/route.ts | No named guard detected; inspect inherited/helper path | 10 cues; not a validation proof | BLOCKED authenticated execution |
| /api/users/reset-password | POST | app/api/users/reset-password/route.ts | authenticateApiRequest | 3 cues; not a validation proof | BLOCKED authenticated execution |
| /api/users | GET, POST, PATCH | app/api/users/route.ts | authenticateApiRequest | 8 cues; not a validation proof | GET 401 anonymous |
| /api/webhooks/google-meet | POST | app/api/webhooks/google-meet/route.ts | verifyGoogleMeetWebhook | 0 cues; not a validation proof | BLOCKED authenticated execution |
| /api/webhooks/razorpay | POST | app/api/webhooks/razorpay/route.ts | verifyRazorpayWebhookSignature | 4 cues; not a validation proof | BLOCKED authenticated execution |
| /api/webhooks/zoom | POST | app/api/webhooks/zoom/route.ts | verifyZoomWebhookSignature | 4 cues; not a validation proof | BLOCKED authenticated execution |
| /api/workflow/notifications | GET, POST | app/api/workflow/notifications/route.ts | authenticatePaymentRequest | 1 cues; not a validation proof | BLOCKED authenticated execution |

## Navigation and hidden routes

| Page | Static navigation linkage | Interpretation |
| --- | --- | --- |
| / | No static header/sidebar/layout literal | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /academics/assessments | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /academics/assignments | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /academics/attendance | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /academics/batches | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /academics/courses | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /academics/sap-servers | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /academics/schedule | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /accounts/approvals | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /accounts/expenses | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /accounts/fees | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /accounts/installments | No static header/sidebar/layout literal | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /accounts/payments | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /accounts/receipts | No static header/sidebar/layout literal | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /accounts/receipts/[id] | No static header/sidebar/layout literal | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /accounts/reports | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /accounts/vendors | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /admissions | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /audit-logs | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /certificate/verify/[id] | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /certificates | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /crm/followups | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /crm/leads | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /dashboard | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /login | No static header/sidebar/layout literal | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /onboarding | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /placement | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /placement/enrollments | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /portal | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /settings | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /students | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /students/[id] | No static header/sidebar/layout literal | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /support | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /todos | No static header/sidebar/layout literal | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |
| /users | Referenced from header/sidebar/layout | Dynamic detail, public, redirect and diagnostic routes may intentionally be unlinked; not an automatic bug |

All discovered literal internal href/router/redirect links resolve to a page pattern; dynamic URLs, query behavior, role menu visibility and external destinations remain unverified. G45 records a mismatched section-expansion prefix. Only app/layout.tsx and app/(dashboard)/layout.tsx are explicit layouts; no custom app error/loading/not-found file was found. Framework 404 exists; missing custom boundary is a recovery risk, not independently a confirmed defect.
