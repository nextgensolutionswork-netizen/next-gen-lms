# TASK-09 — Course & Batch Display Formatting, Master Data Consistency & Cross-Module UX Standardization Report

**Branch:** `task-09/course-batch-formatting`  
**Production URL:** https://next-gen-lms-omega.vercel.app  
**Production Supabase:** `tgohtdzwehhjfahtgovq`  
**Isolated QA Supabase:** `mzkrvvnmmjcjygwllabn`  
**Date:** 2026-11-27  
**Status:** COMPLETE (`CBF-001`–`CBF-040` Verified, 100% Automated Regression Pass Rate)  

---

## 1. Executive Summary & Problem Diagnosis

### 1.1 Inconsistent, Duplicated & Misleading Course/Batch Display Labels
Prior to TASK-09, the presentation of courses and cohorts across Admissions, Student Details, Batch Management, and CRM Lead Conversion suffered from redundant string concatenation (`"SAP FICO PERSONAL TRAINING - Personal Training - SAP FICO Morning Fast-Track Batch"`), fabricated fallbacks (`'Assigned Batch'`, `'SAP Course'`, `'Online'`), missing course/batch codes in dropdowns, and fragmented inline formatting.

### 1.2 Solution Architecture: Shared Deterministic Formatting (`lib/utils/course-batch-display.ts`)
- **Base Course Name Extraction:** Strips redundant category suffixes while preserving `authoritativeCourseName`.
- **Training Category Disambiguation:** Accurately classifies `'Personal Training'` (1:1) vs. `'Normal Training'` (cohort) without duplicate badge text.
- **Batch Title Deduplication:** Removes redundant course prefixes from batch titles and formats timing/mode labels (`'Morning · Online'`).
- **Honest Fallbacks:** `'Batch not assigned'`, `'Course unavailable'`, `'Mode unavailable'`, `'Schedule unavailable'` — never fabricates defaults.

---

## 2. Complete Course & Batch Display Inventory

| Route | Source File | Course Label (After) | Batch Label (After) | Fallback Policy Applied |
| :--- | :--- | :--- | :--- | :--- |
| `/admissions` | `app/(dashboard)/admissions/page.tsx` | Clean base name + Training Type badge | Deduplicated batch title + `Morning · Online` badge | `'Batch not assigned'`, `'Course unavailable'` |
| `/admissions` (New Modal) | `app/(dashboard)/admissions/page.tsx` | `formatCourseOptionLabel(c)` `[Code] + (₹Fee)` | `formatBatchOptionLabel(b)` `[Code] + Seats + Capacity` | Clear disabled full cohort indication |
| `/students` | `app/(dashboard)/students/page.tsx` | `stu.course_name` | `stu.batch_name \|\| 'Batch not assigned'` | Never fabricate `'Assigned Batch'` |
| `/students/[id]` | `app/(dashboard)/students/[id]/page.tsx` | Raw authoritative string | `student.batch_name \|\| 'Batch not assigned'` | Never fabricate `'Assigned Batch'` |
| `/academics/batches` | `app/(dashboard)/academics/batches/page.tsx` | `formatCourseDisplay(b).baseCourseName` | `formatBatchDisplay(b).displayName` | Deduplicated course prefix |
| `/crm/leads` | `app/(dashboard)/crm/leads/page.tsx` | `lead.course_interested \|\| 'Course unavailable'` | `formatBatchOptionLabel(b)` | Never fabricate `'Online'` or `'SAP Course'` |

---

## 3. Preservation of Master Data, P0 Financial Safeguards & Onboarding Eligibility
- **Zero Production Master Data Mutation (`tgohtdzwehhjfahtgovq`):** `courses` (`SAP FICO PERSONAL TRAINING`, `SAP FICO 101`, `₹35,000`) and `batches` remain untouched.
- **P0 Financial Safeguards Preserved:** `finalizeVerifiedPayment`, `issued_by` UUID persistence, `commit_fee_workflow` (`20261127070545`), `idempotency_key` deduplication, `getAuthCookieSecret()` fail-closed validation, and `tests/p0-payment-approval-conflict.test.ts` + `tests/p0-receipt-issuer-security.test.ts` all pass.
- **Onboarding Eligibility Regression Protection (`lib/services/onboarding-service.ts`):** `resolveAndEnsureOnboardingCase` preserves access to existing onboarding cases for subsequent payments on `Active`/`Approved` admissions and returns `undefined` when no case exists and `admission.status !== 'Confirmed'`, preventing HTTP `400` failures without creating duplicate cases or relaxing `initializeOnboardingCase`'s `Confirmed`-only rule.
- **Actual PostgreSQL Admission Allocation Concurrency (`mzkrvvnmmjcjygwllabn`):** Executed `public.allocate_admission_number` for `5` sequential allocations in an isolated rolled-back transaction (`total_allocated: 5`, `distinct_allocated: 5`).

---

## 4. Viewport Responsiveness & Pending Operational Verification
- **7-Viewport Check (`scripts/verify-task09-viewports.mjs`):** `360×640`, `375×667`, `414×896`, `768×1024`, `1024×768`, `1440×900`, and `1920×1080` all **PASS**.
- **Authenticated Live Business-Route Browser E2E:** `BLOCKED — AUTH_REQUIRED` (no live credentials executed).
- **Pending P0 Operational Verification (`spr-1795735527117-07vj` / `0cc9ab8d-61b9-cf63-3da5-cde93ed2c7c5`):** Read-only check on `tgohtdzwehhjfahtgovq` confirms payment remains `Pending Approval` / `Pending Verification`, `collected_amount: 0`, `outstanding_balance: 33000`, `revision: 54`, awaiting genuine approval by Accountant Padmaja.
- **Deferred Scope:** `TASK-10`, `TASK-11`, `TASK-12`, and Final Master Audit remain deferred and untouched.
