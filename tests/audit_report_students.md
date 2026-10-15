# Exhaustive Code Audit Report: CRM, Admissions & Students

## Executive Summary
This audit inspects the 5 core modules across CRM, Admissions, and Student Management:
1. `app/(dashboard)/crm/leads/page.tsx`
2. `app/(dashboard)/crm/followups/page.tsx`
3. `app/(dashboard)/admissions/page.tsx`
4. `app/(dashboard)/students/page.tsx`
5. `app/(dashboard)/students/[id]/page.tsx`

Major critical issues identified include:
- **Crash Risks**: Null pointer errors when relation arrays (`store.courses`, `store.batches`, `batch.days`) are empty or undefined, and search string crashes if records have undefined optional attributes.
- **Critical UI Rendering Bug**: Duplicate rendering of the entire `onboarding` tab in `app/(dashboard)/students/[id]/page.tsx` (rendered twice, lines 416-747 and lines 1238-1461).
- **Mock/Hardcoded Data**: Hardcoded Activity logs and Document lists on the Student 360 page; hardcoded `45000` course fees and dummy personal details in Quick Convert; hardcoded counselor/admin IDs (`'usr-counsellor'`, `'usr-admin'`).
- **Broken Workflow & Missing Handlers**: "360° Profile" on Admissions page links to the general `/students` table instead of `/students/[id]`; "Record Fee Payment" switches to a read-only tab with no payment form; Follow-up modal has no follow-up date picker; no calendar scheduling on the Followups page.
- **RBAC Gaps**: Complete absence of authentication/permission checks across all 5 pages. Unauthorized roles (e.g., students or trainers) can view student fee balances, leads, and PII, or export confidential databases via CSV.
- **State Synchronization & Persistence**: Browser client modifications mutate in-memory arrays in `data-store.ts`, but client-side `store.persist()` does not write to localStorage or disk (`persistentStorage.isServer === false`), resulting in state loss on page refresh.

---

## 1. `app/(dashboard)/crm/leads/page.tsx`

### A. Crash Risks on Empty Data / Undefined Relations
1. **Uncaught crash on empty `store.courses` in `handleConvertLead` (Lines 120–121, 135, 139)**:
```typescript
120: const course = store.courses.find((c) => c.id === selectedLead.interested_course_id) || store.courses[0];
121: const defaultBatch = store.batches.find((b) => b.course_id === course.id) || store.batches[0];
...
135: course_id: course.id,
139: course_fee: course.price,
```
- **Issue**: If `store.courses` is empty (`[]`), `course` evaluates to `undefined`. Accessing `course.id` or `course.price` throws `TypeError: Cannot read properties of undefined (reading 'id')`, crashing the application during conversion.

2. **Search crash on missing contact fields (Lines 68–75)**:
```typescript
68: const q = search.toLowerCase();
69: list = list.filter(
70:   (l) =>
71:     l.full_name.toLowerCase().includes(q) ||
72:     l.phone.includes(q) ||
73:     l.email.toLowerCase().includes(q) ||
74:     l.lead_code.toLowerCase().includes(q)
75: );
```
- **Issue**: If imported or external leads have missing/null `phone`, `email`, or `lead_code`, calling `.includes(q)` or `.toLowerCase()` throws `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`. Safe navigation (`l.phone?.includes(q)`) is required.

3. **Empty Table State Missing (Lines 253–319)**:
- **Issue**: When `leads.length === 0`, `<tbody>` renders completely empty with no user feedback, guidance, or empty state graphic.

---

### B. Broken, Mock, or Incomplete Event Handlers
1. **Hardcoded User IDs (Lines 97, 112, 143, 146)**:
```typescript
97: counsellor_id: 'usr-counsellor',
112: await updateLeadStage(selectedLead.id, nextStage, updateNotes, 'usr-counsellor');
143: counsellor_id: 'usr-counsellor',
146: 'usr-counsellor'
```
- **Issue**: Bypasses logged-in user credentials (`useAuth().user.id`). All leads, updates, and conversions are attributed to dummy ID `'usr-counsellor'`.

2. **Missing Follow-Up Date & Demo Scheduling in Stage Update (Lines 110–116, 447–496)**:
```typescript
110: const handleUpdateStage = async () => {
111:   if (!selectedLead) return;
112:   await updateLeadStage(selectedLead.id, nextStage, updateNotes, 'usr-counsellor');
```
- **Issue**: When the user selects `nextStage = 'Follow-up'` or `'Demo Scheduled'`, the modal only accepts `updateNotes`. There is no date/time picker for `follow_up_date` or `demo_date`. Consequently, follow-ups can never have a scheduled target date.

3. **Hardcoded Net Payable Fee & Dummy Student Profile Data in Quick Convert (Lines 128–134, 549)**:
```typescript
128: dob: '2000-01-01',
129: gender: 'Male',
130: address: 'Hitec City, Madhapur',
131: city: 'Hyderabad',
132: education: 'Graduate / B.Tech / MBA',
134: current_employment_status: 'Employed',
...
549: ₹{Math.max(0, 45000 - discount).toLocaleString('en-IN')}
```
- **Issue**: Hardcodes `45000` regardless of the actual course fee (e.g. ₹35,000 or ₹75,000), causing discrepancies. Also inserts dummy data (`20000-01-01`, `Male`, `Hitec City`) directly into the official student admission record.

---

### C. Broken Links or Route Redirects
1. **Unsynchronized query param navigation (Line 297)**:
```typescript
297: router.push(`/admissions?convertLeadId=${lead.id}`);
```
- **Issue**: The target page reads `window.location.search` instead of `useSearchParams()`. In Next.js client-side router navigation, `useEffect` on the Admissions page will not re-trigger if already mounted.

---

### D. RBAC Gaps
- **Missing Permission Enforcements**: No checks for `crm:read`, `crm:write`, or `crm:convert`. Any role (students, trainers, accountants) can access `/crm/leads`, view prospective candidate phone numbers, create leads, and trigger conversions.
- **No Counselor Row-Level Filtering**: A counselor should only see their assigned leads unless granted supervisor privileges (`admin` / `super_admin`).

---

### E. Workflow Gaps Compared to SOP
- **No Lead Assignment/Reassignment**: Cannot assign a lead to a specific counselor; no counselor selector in the form.
- **Inconsistent Conversion Stage**: In `crm/leads/page.tsx`, line 123 calls `createAdmissionWorkflow` which sets stage to `'Converted'`. However, `crm-service.ts` line 209 sets stage to `'Enrolled'`.

---

### F. State Synchronization
- `handleCreateLead` and `handleUpdateStage` call `refreshLeads()` which reads `store.leads`.
- **Client Persistence Gap**: `store.persist()` does not save to local storage or disk in browser runtime. A page refresh loses in-memory additions.

---

## 2. `app/(dashboard)/crm/followups/page.tsx`

### A. Crash Risks on Empty Data / Undefined Params
1. **Empty Follow-ups Result in Blank Page (Lines 13–15, 33–75)**:
```typescript
13: const followups = store.leads.filter(
14:   (l) => l.stage === 'Follow-up' || l.stage === 'Demo Scheduled' || l.demo_preference
15: );
```
- **Issue**: If there are no leads matching these stages, `followups` is `[]`, rendering an empty grid without any "No follow-ups pending" state or placeholder.

2. **Misleading Date Fallback (Line 54)**:
```tsx
54: <span>Next: {formatDate(lead.follow_up_date || lead.created_at)}</span>
```
- **Issue**: If `follow_up_date` is not set (which happens regularly due to the bug in the Lead modal), it falls back to `created_at`, displaying an old creation date as the prospective student's "Next" follow-up date.

---

### B. Broken, Mock, or Incomplete Event Handlers
1. **Non-Functional "Manage Lead" Navigation (Lines 66–70)**:
```tsx
66: <Link href="/crm/leads">
67:   <Button variant="sap" size="sm" className="text-xs px-2.5 py-1">
68:     Manage Lead
69:   </Button>
70: </Link>
```
- **Issue**: Does not pass `?leadId=${lead.id}`. The counselor is navigated to the general `/crm/leads` list and must manually search for the lead.
2. **Missing Actions**:
- Cannot mark follow-up as completed.
- Cannot log call outcome / notes.
- Cannot reschedule next follow-up date.
- No calendar or time-slot scheduling view despite being titled *"Follow-ups & Demo Calendar"*.

---

### C. Broken Links or Route Redirects
- Both header link (line 26) and card action (line 66) navigate to `/crm/leads` without preserving filter or context.

---

### D. RBAC Gaps
- Anyone with page URL access can view prospect personal information.
- No counselor filter (`lead.counsellor_id === user.id`).

---

### E. Workflow Gaps Compared to SOP
- Follow-ups are not categorized by urgency: **Overdue**, **Due Today**, **Upcoming**.
- No demo trainer assignment workflow.

---

### F. State Synchronization
- `followups` is evaluated once outside React state. If background data changes, this page will not reactively update unless remounted.

---

## 3. `app/(dashboard)/admissions/page.tsx`

### A. Crash Risks on Empty Data / Undefined Params
1. **Missing store entity crash risk (Lines 48, 50, 85)**:
```typescript
48: const [courseId, setCourseId] = React.useState(store.courses[0]?.id || '');
50: const [batchId, setBatchId] = React.useState(store.batches[0]?.id || '');
85: const selectedCourse = store.courses.find((c) => c.id === courseId) || store.courses[0];
```
- **Issue**: If `store.courses` or `store.batches` is empty on load, fallback chains produce empty string IDs, resulting in unlinked foreign keys.

---

### B. Broken, Mock, or Incomplete Event Handlers
1. **"360° Profile" Links to Generic List Instead of Student Profile (Lines 322–326)**:
```tsx
322: <Link href="/students">
323:   <Button variant="outline" size="sm" className="text-[10px] px-2 py-1">
324:     360° Profile
325:   </Button>
326: </Link>
```
- **CRITICAL WORKFLOW BUG**: Clicking "360° Profile" next to an admission record drops the student context completely and opens the general `/students` directory instead of `/students/[id]`.

2. **Course-Batch Disconnection (Lines 496–538)**:
- **Issue**: When `courseId` changes in the dropdown, `batchId` is NOT updated to match batches belonging to that course (`b.course_id === courseId`). A student can be enrolled in an SAP FICO course while assigned to an SAP ABAP batch.

3. **Hardcoded User IDs (Lines 142, 145)**:
```typescript
142: counsellor_id: 'usr-counsellor',
145: 'usr-admin'
```
- **Issue**: Admissions record creation uses hardcoded actor `'usr-admin'` and counselor `'usr-counsellor'`.

---

### C. Broken Links or Route Redirects
1. **Query Param Reading via `window.location.search` (Lines 57–82)**:
```typescript
57: if (typeof window !== 'undefined') {
58:   const params = new URLSearchParams(window.location.search);
59:   const leadId = params.get('convertLeadId');
```
- **Issue**: Should use Next.js `useSearchParams()` from `next/navigation` to guarantee reactivity during client-side transitions.

---

### D. RBAC Gaps
- Missing `admissions:read` and `admissions:write` role guards.
- No discount approval gate: counselors can enter arbitrary discounts without triggering an approval request to Admin/Accountant (`admissions:approve`).

---

### E. Workflow Gaps Compared to SOP
- Lead conversion does not auto-populate previously approved discount amount or notes from the CRM lead.
- No actions in the table to cancel, put on hold, or print the Admission Form / Welcome Letter.

---

### F. State Synchronization
- State is loaded via `useState<Admission[]>(store.admissions)` and updated via `refreshList()`.
- Browser reload resets in-memory mutations due to lack of client-side disk persistence.

---

## 4. `app/(dashboard)/students/page.tsx`

### A. Crash Risks on Empty Data / Undefined Params
1. **Search Crash on Undefined Fields (Lines 43–50)**:
```typescript
43: list = list.filter(
44:   (s) =>
45:     s.full_name.toLowerCase().includes(q) ||
46:     s.student_code.toLowerCase().includes(q) ||
47:     s.admission_number.toLowerCase().includes(q) ||
48:     s.phone.includes(q) ||
49:     s.email.toLowerCase().includes(q)
50: );
```
- **Issue**: If any student has an undefined `phone`, `student_code`, or `admission_number`, `s.phone.includes(q)` throws an uncaught `TypeError: Cannot read properties of undefined (reading 'includes')`.

2. **Missing Empty Table Row (Lines 156–213)**:
- **Issue**: If no students match filters, the table body is blank with no message or icon.

---

### B. Broken, Mock, or Incomplete Event Handlers
1. **Raw CSV Export Leaking Internal DB Fields (Lines 59–61)**:
```typescript
59: const handleExportCSV = () => {
60:   exportToCSV('sap_enrolled_students', students);
61: };
```
- **Issue**: Dumps raw internal database model attributes (`user_id`, `admission_id`, unformatted dates) without cleaning columns.
2. **Missing Direct Row Actions**:
- No ability to change batch, edit contact info, or toggle status (Active, On Hold, Suspended).

---

### C. Broken Links or Route Redirects
- If `stu.id` is missing/empty, line 204 links to `/students/undefined`.

---

### D. RBAC Gaps
- **Critical Data Leak**: `students:export` is defined in `rbac.ts` for Admin/Super-Admin only, but any user can trigger the CSV export.
- Students or unauthorized roles can see all peers' fee arrears, payment details, and personal phone numbers.

---

### E. Workflow Gaps Compared to SOP
- No batch-transfer initiation workflow from the directory.
- No filter by assigned trainer or counselor.

---

### F. State Synchronization
- Does not subscribe to store events. If an admission is registered on `/admissions`, navigating to `/students` without a full page reload will not display the newly created student.

---

## 5. `app/(dashboard)/students/[id]/page.tsx`

### A. Crash Risks on Empty Data / Undefined Params
1. **Runtime Crash on `batch.days` (Line 793)**:
```tsx
793: <p className="font-bold text-slate-800 text-sm mt-0.5">{batch?.days.join(', ')}</p>
```
- **CRASH RISK**: If `batch` exists in store but `batch.days` is undefined or null, `batch?.days.join(', ')` evaluates `undefined.join(', ')` and throws:
  `TypeError: Cannot read properties of undefined (reading 'join')`.
  Safe code: `{batch?.days?.join(', ') || 'Flexible'}`.

2. **ID vs Code Lookup Failure in `getStudentProfileFullDetails` (Lines 35, 57, 63–72)**:
- Line 83 in `lib/services/student-service.ts`:
```typescript
const student = store.students.find((s) => s.id === studentId);
if (!student) return null;
```
- **Issue**: If navigation occurs via student code (e.g. `/students/STU-2026-0001`), this returns `null`, causing the page to show "Student profile not found", despite `getStudentById` supporting both.

3. **Avatar Crash Risk (Line 135)**:
```tsx
135: {student.full_name.charAt(0)}
```
- **Issue**: Throws if `student.full_name` is undefined.

4. **Fee Ledger Calculation with Undefined Payable (Lines 973, 983, 993)**:
```tsx
973: {formatINR(studentFees.filter((f: any) => f.approval_status === 'Approved').reduce((acc: number, f: any) => acc + f.final_payable, 0))}
```
- **Issue**: If `f.final_payable` is undefined, `acc + undefined` results in `NaN`.

---

### B. Broken, Mock, or Incomplete Event Handlers
1. **CRITICAL UI RENDERING BUG: Duplicate "Onboarding & Induction" Tab**:
- **Lines 416–747**: Full `activeTab === 'onboarding'` block (Snapshot, 10-point checklist, documents, induction status).
- **Lines 1238–1461**: A SECOND `activeTab === 'onboarding'` block (Status header, 11-step audit table, documents, no-case card).
- **Impact**: When the user clicks the "Onboarding & Induction" tab, BOTH implementations render stacked sequentially on top of each other!

2. **100% Mock / Static Activity Log (Lines 1216–1236)**:
```tsx
1222: <div className="border-l-2 border-[#0A6ED1] pl-3 py-1">
1223:   <p className="font-bold text-slate-800">Fee Payment Completed (REC-2026-0002)</p>
1224:   <p className="text-slate-500 text-[10px]">24 Feb 2026</p>
1225: </div>
1226: <div className="border-l-2 border-emerald-500 pl-3 py-1">
1227:   <p className="font-bold text-slate-800">Assignment 1 Graded (Score 95/100)</p>
1228:   <p className="text-slate-500 text-[10px]">27 Feb 2026</p>
1229: </div>
```
- **Issue**: The entire Activity tab is hardcoded static mock text displayed identically for every single student profile.

3. **100% Mock / Static Documents Tab (Lines 1191–1214)**:
```tsx
1199: <FileText className="h-4 w-4 text-blue-600" />
1200: <span>Identity Proof (Aadhaar / Passport)</span>
...
1206: <FileText className="h-4 w-4 text-purple-600" />
1207: <span>Graduation Degree Certificate</span>
```
- **Issue**: Renders two static mockup rows with no actual file links, no upload action, and zero integration with student documents.

4. **"Record Fee Payment" Tab Action Dead-End (Lines 401–409, 908–938)**:
```tsx
405: onClick={() => setActiveTab('payments')}
```
- **Issue**: Clicking "Record Fee Payment" merely sets `activeTab = 'payments'`. The Payments tab contains only a read-only table of previous payments with NO form or dialog to record a new payment.

---

### C. Broken Links or Route Redirects
- Line 953: `<Link href={`/accounts/receipts/${r.id}`}>` - Points to receipt view page.
- Line 1020: `<Link href="/accounts/approvals">` - Points to fee approvals desk.
- Line 1148: `<Link href={`/certificate/verify/${certificate.certificate_id}`} target="_blank">` - Public verify route.

---

### D. RBAC Gaps
- **IDOR Vulnerability**: No check against `useAuth()`. A logged-in student can modify the URL to `/students/stu-01`, `/students/stu-02` and view other students' full financial ledgers, fee accounts, personal contact details, exam scores, and certificates.
- Counselors or trainers have full visibility into confidential accounts and audit logs.

---

### E. Workflow Gaps Compared to SOP
- Attendance, Assignments, and Assessments tabs are completely read-only; trainers cannot grade or mark attendance from the student 360 view.
- No button to issue a certificate when eligibility criteria (completion >= 80% and fees settled) are satisfied.

---

### F. State Synchronization
- Component loads data once in `useEffect` on mount. Any changes to fees, payments, or attendance in background stores will not reflect until manually refreshed.

---

## Summary Matrix of Audited Files

| Page | Crash Risk | Broken / Mock Handlers | Broken Links | RBAC Enforcement | State Persistence |
|---|---|---|---|---|---|
| `crm/leads/page.tsx` | High (Empty courses, missing lead strings) | High (Hardcoded user, missing followup date, hardcoded fee) | Medium (`router.push` query params) | None | In-memory only |
| `crm/followups/page.tsx` | Low (Empty list rendering) | High (No manage/complete/reschedule handlers, no calendar) | Medium (Generic `/crm/leads` redirect) | None | Non-reactive |
| `admissions/page.tsx` | Medium (Batch/course mismatch) | High ("360° Profile" points to `/students` list; hardcoded user) | High (Context loss on Profile link) | None | In-memory only |
| `students/page.tsx` | High (Search on undefined phone/code) | Medium (Unsanitized CSV dump, no row mutations) | Low | None (Export open to all) | Non-reactive |
| `students/[id]/page.tsx` | High (`batch?.days.join`, ID vs Code mismatch) | Critical (Duplicate Onboarding tab, mock Activity & Docs, dead-end payment) | Low | Critical (IDOR on student PII & Ledger) | Mount-only |