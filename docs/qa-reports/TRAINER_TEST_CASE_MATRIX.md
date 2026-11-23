# ROLE 4 — TRAINER: TEST CASE MATRIX & EXECUTION EVIDENCE

**Application**: Next-Gen LMS & CRM  
**Target URL**: `https://next-gen-lms-omega.vercel.app`  
**Test Account**: `vikram.fico@next-generpsolutions.com` / `[REDACTED]`  
**Execution Environment**: Live Production  
**Execution Date**: 19 November 2026  

---

## 1. TEST SUITE TR-001: AUTHENTICATION & SESSION GOVERNANCE

| Test ID | Scenario | Precondition | Input / Action | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|:---:|---|
| TC-TR-001 | Login Page Load | Network online | Navigate to `/login` | Page renders login options & presets | Rendered with 9 role presets | **PASS** | HTTP 200, Title verified |
| TC-TR-002 | Preset Quick-Login | On `/login` | Click `Trainer / Faculty` preset | Credentials pre-filled for Vikram Rao | Pre-filled `vikram.fico@...` | **PASS** | Form inputs populated |
| TC-TR-003 | Empty Password Validation | Email filled | Leave password blank, click Sign in | HTML5 client validation prevents submit | Required field validation triggered | **PASS** | Form submission prevented |
| TC-TR-004 | Invalid Password Rejection | Valid email | Submit `[REDACTED]` | Supabase 400, UI error banner | Error banner rendered | **PASS** | HTTP 400, "Unable to sign in" |
| TC-TR-005 | Valid Authentication | Credentials ready | Click Sign in | Redirect to `/academics/courses` | Landed on `/academics/courses` | **PASS** | URL matched, token stored |
| TC-TR-006 | Header Identity Verification | Authenticated | Inspect banner & header | User name & Trainer badge rendered | `Vikram Rao (SAP FICO Lead)` | **PASS** | Badge `Trainer` visible |
| TC-TR-007 | Session Persistence | On dashboard | Hard refresh browser | User stays authenticated on page | Hydrated without redirect | **PASS** | Reload completed, persistent |
| TC-TR-008 | Sign Out Termination | Authenticated | Click `Sign out of account` | Session cleared, redirect to `/login` | Redirected to `/login` | **PASS** | Cookies cleared |
| TC-TR-009 | Unauthenticated Barrier | Signed out | Direct navigate `/academics/courses` | Redirect to `/login?redirectTo=...` | Redirected to login with query | **PASS** | Intercepted by middleware |
| TC-TR-010 | History Back Protection | Signed out | Click browser Back button | Retain login view, no data leaked | Redirected back to `/login` | **PASS** | Auth guard re-enforced |

---

## 2. TEST SUITE TR-002: COURSES & MODULES MANAGEMENT

| Test ID | Scenario | Precondition | Input / Action | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|:---:|---|
| TC-TR-011 | Course Scope Banner | Logged in as Trainer | Navigate `/academics/courses` | Header states assigned courses view | *"Displaying courses assigned..."* | **PASS** | Subtitle rendered |
| TC-TR-012 | Assigned Course Listing | Course page loaded | Count courses | Exactly 2 assigned courses displayed | 2 Courses (FICO & SD) | **PASS** | FICO (12w) & SD (10w) |
| TC-TR-013 | Course Details Inspection | Course page loaded | Click FICO course card | Details, fee (₹45k), description shown | Description and fee rendered | **PASS** | Description text verified |
| TC-TR-014 | Attach Syllabus Action | Course card visible | Click `Attach Syllabus` | Edit Course modal opens | Modal opened with syllabus tab | **PASS** | Dialog rendered |
| TC-TR-015 | Course Status Restriction | In Edit Course modal | Inspect Status dropdown | Status is disabled with review notice | Status disabled for Trainer | **PASS** | *"Reviewer sign-off required"* |
| TC-TR-016 | Add Course Admin Barrier | On courses page | Inspect action buttons | `New SAP Course` button is hidden | Button completely absent | **PASS** | Admin-only button omitted |
| TC-TR-017 | Course Module View | Course card visible | Inspect module list | Module accordion / empty state renders | *"No modules added yet"* | **PASS** | Empty state button visible |
| TC-TR-018 | Course Switcher | Course page loaded | Click SD course card | View toggles to SAP SD course | SAP SD details displayed | **PASS** | ₹40,000, 10 Weeks |

---

## 3. TEST SUITE TR-003: BATCHES & COHORTS

| Test ID | Scenario | Precondition | Input / Action | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|:---:|---|
| TC-TR-019 | Batch Scope Banner | Logged in as Trainer | Navigate `/academics/batches` | Banner confirms assigned cohort scope | *"Trainer Scope Active (1 batch)"* | **PASS** | Filter banner rendered |
| TC-TR-020 | Assigned Cohort Card | Batch page loaded | Inspect cohort cards | Display `B-2026-FICO-01` | `B-2026-FICO-01` rendered | **PASS** | Mon, Wed, Fri schedule |
| TC-TR-021 | Cross-Batch Isolation | Batch page loaded | Search for `B-MM-2601` | Non-assigned batch is hidden | `B-MM-2601` strictly omitted | **PASS** | Cross-cohort leakage = 0 |
| TC-TR-022 | Roster Modal Opening | Cohort card visible | Click `Roster (1)` | Dialog opens showing roster details | Dialog opened: *"Batch Student Roster"* | **PASS** | Dialog rendered |
| TC-TR-023 | Roster Trainer Scope | In Roster modal | Inspect header & permissions | Restricted scope badge visible | *"Restricted Scope: Assigned Trainer"*| **PASS** | Badge confirmed |
| TC-TR-024 | Batch Deletion Barrier | Batch card visible | Inspect batch actions | Delete batch button is absent | Delete button hidden | **PASS** | Admin-only deletion barred |
| TC-TR-025 | Audit Trail Visibility | Batch page loaded | Inspect bottom panel | Transfer audit trail component renders | 0 records empty state shown | **PASS** | Audit trail panel active |

---

## 4. TEST SUITE TR-004: TIMETABLE & SCHEDULING

| Test ID | Scenario | Precondition | Input / Action | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|:---:|---|
| TC-TR-026 | Timetable Route Load | Authenticated | Navigate `/academics/schedule` | Calendar timetable renders | Title and calendar rendered | **PASS** | HTTP 200, Title verified |
| TC-TR-027 | Month View Switcher | On schedule page | Click `Month` view button | Full month grid rendered | Month view active | **PASS** | November 2026 grid |
| TC-TR-028 | Week View Switcher | On schedule page | Click `Week` view button | Current week (16-22 Nov) rendered | Week view active | **PASS** | 16 Nov – 22 Nov 2026 |
| TC-TR-029 | Day View Switcher | On schedule page | Click `Day` view button | Hourly day schedule rendered | Day view active | **PASS** | Hourly slot layout |
| TC-TR-030 | All View Switcher | On schedule page | Click `All` view button | List view of all sessions rendered | List view rendered | **PASS** | All sessions filter active |
| TC-TR-031 | Jump to Date Picker | On schedule page | Inspect date picker | Defaults to today in Asia/Kolkata | `2026-11-19` pre-filled | **PASS** | Date input verified |
| TC-TR-032 | Schedule Session Modal | On schedule page | Click `Schedule Session` | Modal opens with scheduling form | Modal opened | **PASS** | `Schedule Class Session` |
| TC-TR-033 | Meeting Provider Integration | In schedule modal | Inspect integration options | Zoom, Google Meet, Manual URL | 3 conference options rendered | **PASS** | Webhook Auto-Sync visible |

---

## 5. TEST SUITE TR-005: ATTENDANCE REGISTER

| Test ID | Scenario | Precondition | Input / Action | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|:---:|---|
| TC-TR-034 | Attendance Route Load | Authenticated | Navigate `/academics/attendance` | Register and action buttons render | Page loaded cleanly | **PASS** | HTTP 200 |
| TC-TR-035 | Table Column Verification | Attendance loaded | Inspect table headers | Code, Name, Attendance, Webhook, Status | 6 Standard columns verified | **PASS** | Table headers verified |
| TC-TR-036 | Quick Mark Controls | Attendance loaded | Inspect quick buttons | `Mark All Present`, `Mark All Absent` | Both buttons visible & enabled | **PASS** | Buttons verified |
| TC-TR-037 | Webhook Log Viewer | Attendance loaded | Click `View Webhook Logs` | Drawer opens showing stream | Drawer opened: 0 event segments | **PASS** | Webhook panel verified |
| TC-TR-038 | Sync Live Meeting Modal | Attendance loaded | Click `Sync Live Meeting` | Sync modal opens with Zoom/Meet | Modal opened with Zoom/Meet | **PASS** | Modal options verified |
| TC-TR-039 | Export Options | Attendance loaded | Inspect export buttons | `Export CSV`, `Export to Excel` | Both export buttons visible | **PASS** | Buttons rendered |

---

## 6. TEST SUITE TR-006: ASSIGNMENTS & EVALUATION DESK

| Test ID | Scenario | Precondition | Input / Action | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|:---:|---|
| TC-TR-040 | Assignments Route Load | Authenticated | Navigate `/academics/assignments` | Evaluation desk renders | Desk loaded cleanly | **PASS** | HTTP 200 |
| TC-TR-041 | Faculty Mode Banner | Assignments loaded | Inspect desk subtitle | Faculty Evaluation Mode displayed | *"Faculty Evaluation Mode"* | **PASS** | Subtitle verified |
| TC-TR-042 | Evaluation Queue State | Assignments loaded | Inspect submission queue | Clean empty queue state | *"Evaluation Queue Empty"* | **PASS** | Empty state rendered |
| TC-TR-043 | New Assignment Modal | Assignments loaded | Click `New Assignment` | Create assignment dialog opens | Dialog rendered | **PASS** | Title, Course, Batch fields |
| TC-TR-044 | Timezone Specification | In assignment modal | Inspect Due Date field | Due date indicates `Asia/Kolkata` | `Asia/Kolkata` badge shown | **PASS** | Timezone badge confirmed |
| TC-TR-045 | Blueprint Document Upload | In assignment modal | Inspect attachment area | Drag & drop for .PDF/.ZIP/.DOCX/25MB | Uploader specs verified | **PASS** | Max 25MB uploader |
| TC-TR-046 | Clean Modal Dismissal | In assignment modal | Click `Cancel` | Modal closes without submitting | Modal closed cleanly | **PASS** | DOM restored |

---

## 7. TEST SUITE TR-007: SAP LAB SERVERS & SYSTEMS

| Test ID | Scenario | Precondition | Input / Action | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|:---:|---|
| TC-TR-047 | SAP Servers Route Load | Authenticated | Navigate `/academics/sap-servers` | Server cards and sandbox table render | Page loaded cleanly | **PASS** | HTTP 200 |
| TC-TR-048 | S4H Sandbox Card | Servers loaded | Inspect S4H card | SID: S4H (00), Online, 0/50 trainees | `s4h.lab.next-generp...:3200` | **PASS** | Card details verified |
| TC-TR-049 | DEV Sandbox Card | Servers loaded | Inspect DEV card | SID: DEV (01), Online, 0/50 trainees | `ecc.lab.next-generp...` | **PASS** | Card details verified |
| TC-TR-050 | Live RFC Ping Test | S4H card visible | Click `Ping` button | Ping toast returned with latency | *"Ping responded in 29ms"* | **PASS** | Instant CPIC toast |
| TC-TR-051 | Trainee Allocations Table | Servers loaded | Inspect allocations table | Amit Gupta (ADM-2026-0001) row | Amit Gupta row rendered | **PASS** | System S4H, Client 800 |
| TC-TR-052 | User ID Copy Action | Allocations table | Inspect Copy User ID | Button copies `SAP_AMITG` | Button verified & clickable | **PASS** | Action available |
| TC-TR-053 | Password Reveal Action | Allocations table | Click `Click to Reveal Password` | Masked `••••••••` reveals password | Revealed `[REDACTED]` | **PASS** | Button toggled to Hide |
| TC-TR-054 | Shortcut File Download | Allocations table | Click `Shortcut` action button | Browser triggers download of .sap file | Downloaded `S4H_SAP_AMITG.sap` | **PASS** | .sap file generated |

---

## 8. TEST SUITE TR-008: RBAC & ROUTE ISOLATION

| Test ID | Scenario | Target URL | Expected Action | Actual Behavior | Result | Status |
|---|---|---|---|---|:---:|:---:|
| TC-TR-055 | Super Admin Todos | `/todos` | Intercept & redirect | Redirected to `/academics/courses` | HTTP 200 | **PASS** |
| TC-TR-056 | User Directory | `/users` | Intercept & redirect | Redirected to `/academics/courses` | HTTP 200 | **PASS** |
| TC-TR-057 | System Settings | `/settings` | Intercept & redirect | Redirected to `/academics/courses` | HTTP 200 | **PASS** |
| TC-TR-058 | Fee Approvals Desk | `/accounts/approvals` | Block & redirect | Redirected to `/academics/courses` | HTTP 200 | **PASS** |
| TC-TR-059 | Expense Vouchers | `/accounts/expenses` | Block & redirect | Redirected to `/academics/courses` | HTTP 200 | **PASS** |
| TC-TR-060 | CRM Sales Leads | `/crm/leads` | Block & redirect | Redirected to `/academics/courses` | HTTP 200 | **PASS** |
| TC-TR-061 | Super Admin Route | `/superadmin` | Return 404 | Rendered 404 Not Found page | HTTP 404 | **PASS** |

---

## 9. TEST SUITE TR-009: UI RESPONSIVENESS & CONSOLE AUDIT

| Test ID | Scenario | Viewport | Action | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|:---:|
| TC-TR-062 | Mobile Drawer Open | 651x609 | Click hamburger | Drawer slides over viewport | Main navigation dialog visible | **PASS** |
| TC-TR-063 | Mobile Drawer Close | 651x609 | Click close button | Drawer closes smoothly | Dialog dismissed cleanly | **PASS** |
| TC-TR-064 | Desktop Sidebar Dock | 1280x800 | Resize to desktop | Dual-level docked sidebar renders | Docked navigation active | **PASS** |
| TC-TR-065 | Network Error Audit | All views | Network requests | Zero HTTP 5xx responses | 0 server errors detected | **PASS** |
