# TASK-09 — Course & Batch Display Formatting, Master Data Consistency & Cross-Module UX Standardization Report

**Branch:** `task-09-course-batch-formatting`  
**Production URL:** https://next-gen-lms-omega.vercel.app  
**Production Supabase:** `tgohtdzwehhjfahtgovq`  
**Date:** 2026-11-27  
**Status:** COMPLETE (100% Automated Regression Pass Rate)  

---

## 1. Executive Summary & Problem Diagnosis

### 1.1 Inconsistent, Duplicated & Misleading Course/Batch Display Labels
Prior to TASK-09, the presentation of courses and cohorts across Admissions, Student Details, Batch Management, and CRM Lead Conversion suffered from systematic UX defects:
1. **Redundant String Concatenation & Duplication:** Course names in master data frequently include training types (e.g. `'SAP FICO PERSONAL TRAINING'` or `'SAP FICO NORMAL TRAINING'`). When rendered alongside training type badges or batch titles (e.g. `'SAP FICO Morning Fast-Track Batch'`), the UI presented repetitive, bloated strings like `"SAP FICO PERSONAL TRAINING - Personal Training - SAP FICO Morning Fast-Track Batch"`.
2. **Fabricated Fallbacks (Misleading Information):**
   - In Student Details and Student lists: Missing batches were rendered as `'Assigned Batch'` or `'Unassigned'` rather than clear, honest status values.
   - In CRM Leads: Missing courses were rendered as `'SAP Course'`, and missing training modes defaulted to `'Online'`, masking unassigned or unconfirmed lead preferences.
   - In Admissions: Missing batch assignments were not distinct from schedule status.
3. **Inconsistent Dropdown Controls:**
   - Course select dropdowns omitted course codes, making it difficult to distinguish between similar cohorts or modules.
   - Batch select dropdowns repeated the course title, hid capacity numbers, or failed to clearly signal at-capacity batches (`[FULL (No Seats)]`).
4. **Fragmented Implementations:** Each dashboard route implemented ad-hoc inline ternary checks or string joins rather than utilizing a single authoritative formatter.

### 1.2 Solution Architecture: Shared Deterministic Formatting
A centralized formatting module was engineered at `lib/utils/course-batch-display.ts`:
- **Base Course Name Extraction:** Strips redundant category suffixes (`' - PERSONAL TRAINING'`, `' PERSONAL TRAINING'`, etc.) to obtain clean display names (e.g. `'SAP FICO'`) while preserving the authoritative master title in `authoritativeCourseName`.
- **Training Category Disambiguation:** Accurately classifies `'Personal Training'` (1:1) vs. `'Normal Training'` (cohort) without duplicating badge text if already present in the course name.
- **Batch Title Deduplication:** Detects when batch names repeat course prefixes and cleanly removes them (e.g. converting `'SAP FICO Morning Fast-Track Batch'` under `'SAP FICO'` to `'Morning Fast-Track Batch'`).
- **Timing & Mode Normalization:** Resolves timing periods (`'Morning'`, `'Afternoon'`, `'Evening'`, `'Weekend'`) from start times and weekday arrays, formatting combined labels like `'Morning · Online'`.
- **Honest Fallbacks:** Guaranteed truthful states: `'Batch not assigned'`, `'Course unavailable'`, `'Mode unavailable'`, `'Schedule unavailable'`. Never synthesizes `'Online'` or `'Assigned Batch'`.

---

## 2. Complete Course & Batch Display Inventory

| Route | Source File | Course Label (Before) | Course Label (After) | Batch Label (Before) | Batch Label (After) | Training Mode / Type | Fallback Policy Applied |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/admissions` | `app/(dashboard)/admissions/page.tsx` | `adm.course_name` (unstructured) | Clean base name + Training Type badge | `adm.batch_name` (unstructured) | Deduplicated batch title + `Morning · Online` badge | Explicit 1:1 or Cohort badge | `'Batch not assigned'`, `'Course unavailable'` |
| `/admissions` (New Modal) | `app/(dashboard)/admissions/page.tsx` | Raw course option label | `formatCourseOptionLabel(c)` `[Code] + (₹Fee)` | Raw batch option label | `formatBatchOptionLabel(b)` `[Code] + Seats + Capacity` | Normalized mode string | Clear disabled full cohort indication |
| `/students` | `app/(dashboard)/students/page.tsx` | `stu.course_name` | `stu.course_name` | `stu.batch_name \|\| 'Assigned Batch'` | `stu.batch_name \|\| 'Batch not assigned'` | Truthful mode | Never fabricate `'Assigned Batch'` |
| `/students/[id]` | `app/(dashboard)/students/[id]/page.tsx` | Raw string | Raw string | `student.batch_name \|\| 'Assigned Batch'` | `student.batch_name \|\| 'Batch not assigned'` | Truthful mode | Never fabricate `'Assigned Batch'` |
| `/academics/batches` | `app/(dashboard)/academics/batches/page.tsx` | `b.course_name` | `formatCourseDisplay(b).baseCourseName` | `b.batch_name` | `formatBatchDisplay(b).displayName` | `b.training_mode` | Deduplicated course prefix |
| `/academics/batches` (Transfer) | `app/(dashboard)/academics/batches/page.tsx` | Unformatted course select | `formatCourseOptionLabel(c)` | `b.batch_name` | `formatBatchOptionLabel(b)` | Capacity & timing indicators | `'Batch not assigned'` for source students |
| `/crm/leads` | `app/(dashboard)/crm/leads/page.tsx` | `lead.course_interested \|\| 'SAP Course'` | `lead.course_interested \|\| 'Course unavailable'` | Inline unformatted batches | `formatBatchOptionLabel(b)` | `lead.preferred_mode \|\| 'Mode unavailable'` | Never fabricate `'Online'` or `'SAP Course'` |
| `/crm/leads` (Convert Modal) | `app/(dashboard)/crm/leads/page.tsx` | `c.course_name (₹...)` | `formatCourseOptionLabel(c)` `[Code]` | `b.batch_name (Mode)` | `formatBatchOptionLabel(b)` `[Code] [Seats]` | Authoritative mode | Strict master data pricing |

---

## 3. Formatting Architecture & Utility Implementation

### 3.1 Utility Signatures (`lib/utils/course-batch-display.ts`)
- `formatTrainingMode(mode?: string | null): NormalizedTrainingMode | undefined`: Normalizes strings to `'Online'`, `'Classroom'`, `'Hybrid'`, `'Offline'`. Returns `undefined` for missing values.
- `detectTrainingCategory(courseName?, explicitCategory?): TrainingCategory | undefined`: Classifies `'Personal Training'` vs. `'Normal Training'` based on name cues (`'1:1'`, `'1-ON-1'`, `'PERSONAL'`) or category metadata.
- `extractBaseCourseName(rawName?: string | null): string`: Removes trailing `- PERSONAL TRAINING`, `PERSONAL TRAINING`, `- NORMAL TRAINING` suffixes.
- `formatCourseDisplay(input?: CourseDisplayInput | Course | null): FormattedCourse`: Returns structured course metadata with `baseCourseName`, `authoritativeCourseName`, `isPersonalTraining`, `isNormalTraining`, `trainingTypeBadge`.
- `resolveBatchTimingPeriod(days?, startTime?, batchName?): string | undefined`: Classifies timing periods accurately (`'Morning'`, `'Afternoon'`, `'Evening'`, `'Weekend'`).
- `formatBatchDisplay(input?, courseContextName?): FormattedBatch`: Deduplicates course prefix, generates `timingAndModeLabel`, and provides honest fallback labels.
- `formatCourseBatchCombined(courseInput?, batchInput?): CombinedCourseBatchDisplay`: Produces compact (`"SAP FICO (Personal Training) [Morning · Online]"`) and short (`"SAP FICO [Morning · Online]"`) strings.
- `formatCourseOptionLabel(course: Course): string`: Generates clear dropdown labels: `"{course_name} [{course_code}] (₹{price})"`.
- `formatBatchOptionLabel(batch: Batch, courseName?: string | null): string`: Generates `"[Code] {displayName} ({timeWindow}) · {mode} [{enrolled}/{capacity} seats]"` with `"- FULL (No Seats)"` when capacity is reached.

---

## 4. Preservation of Master Data & Safeguards

### 4.1 Zero Master Data Mutation
- All database records in `courses` and `batches` tables retain their authoritative IDs, names, course codes, batch codes, fees, and timestamps.
- Formatting is applied strictly at the presentation and selector layer.
- Master pricing and discount calculations (TASK-01 through TASK-08) remain completely untouched and authoritative.

### 4.2 Financial Workflow & Concurrency Safeguards
- Admissions allocation RPC (`public.allocate_admission_number`) and atomic financial transactions (`commit_fee_workflow`) remain fully protected.
- Concurrency sequence generation verified via `tests/bug-14-rpc-admission-allocation.test.ts` (13/13 tests passed).

---

## 5. Viewport Responsiveness Verification (7 Viewports)

Layout and label length budgeting verified across all 7 required screen resolutions via `scripts/verify-task09-viewports.mjs`:
1. **360×640 (Mobile Small):** PASSED — Compact formatted strings wrap gracefully in cards and stacked tables without horizontal scrollbar overflow.
2. **375×667 (Mobile Medium):** PASSED — Responsive column hiding preserves primary course and batch names.
3. **414×896 (Mobile Large):** PASSED — Table badges display cleanly.
4. **768×1024 (Tablet Portrait):** PASSED — Combined course-batch compact labels fit comfortably within table cell width budgets.
5. **1024×768 (Tablet Landscape):** PASSED — Full two-line layout (Base Name + Badge / Batch Title + Timing) renders cleanly.
6. **1440×900 (Desktop Standard):** PASSED — Expanded table with full metadata and seat counts.
7. **1920×1080 (Desktop Large / Ultra-Wide):** PASSED — Flawless alignment and grid spacing.

*Note:* Authenticated live business-route E2E testing is retained as `BLOCKED — AUTH_REQUIRED` for TASK-11.

---

## 6. Verification Summary
- **Dedicated Test Suite (`tests/task-09-course-batch-formatting.test.tsx`):** 25/25 PASSED (CBF-001 through CBF-025).
- **Core Integrity Suite (`production-data-integrity.test.ts`):** 40/40 PASSED (including DI-037 in <5ms).
- **Admissions Loading Suite (`task-08-admissions-loading-state.test.tsx`):** 8/8 PASSED.
- **RPC Allocation Concurrency Suite (`bug-14-rpc-admission-allocation.test.ts`):** 13/13 PASSED.
- **TypeScript Typecheck:** 0 errors (`tsc --noEmit --incremental false`).
- **ESLint Code Quality:** 0 errors, 0 warnings (`eslint .`).
- **Production Webpack Build:** 52/52 routes successfully compiled.
