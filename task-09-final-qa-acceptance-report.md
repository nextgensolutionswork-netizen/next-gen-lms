# TASK-09 — Final QA Acceptance Report: Course & Batch Display Formatting & Cross-Module Standardization

**Branch:** `task-09/course-batch-formatting`  
**Baseline Closure Commit:** `a86557f` (`origin/main`)  
**Production URL:** https://next-gen-lms-omega.vercel.app  
**Production Supabase:** `tgohtdzwehhjfahtgovq`  
**Isolated QA Supabase:** `mzkrvvnmmjcjygwllabn`  
**Date:** 2026-11-27  
**Quality Status:** FORMALLY ACCEPTED FOR MERGE (`CBF-001`–`CBF-040` 40/40 Passed, 100% Standard & Sequential Regression)  

---

## 1. Acceptance Scope & Objectives
- **Priority:** P2
- **Module Coverage:** Admissions, Students, Student Details, Academics Batches, CRM Leads & Conversion Modals, plus Onboarding Eligibility preservation (`lib/services/onboarding-service.ts`).
- **Boundary Restriction:** TASK-09 only. TASK-10, TASK-11, TASK-12, and Final Master Audit were not started; migration `20261127070545` was not reapplied.

---

## 2. Dedicated Acceptance Test Matrix (`CBF-001` through `CBF-040` — 40/40 PASS)

| Test ID | Category | Assertion Description | Result |
| :--- | :--- | :--- | :--- |
| **CBF-001** | Mode Normalization | Formats standard training modes (`'Online'`, `'Classroom'`, `'Hybrid'`, `'Offline'`) | **PASS** |
| **CBF-002** | Mode Normalization | Returns `undefined` for missing/invalid modes without fabricating `'Online'` | **PASS** |
| **CBF-003** | Mode Normalization | Batch formatter surfaces `'Mode unavailable'` when training mode is omitted | **PASS** |
| **CBF-004** | Category Detection | Identifies `'Personal Training'` (1:1) from course name or explicit category | **PASS** |
| **CBF-005** | Category Detection | Identifies `'Normal Training'` (cohort) from course name or explicit category | **PASS** |
| **CBF-006** | Base Extraction | Strips redundant trailing category suffixes while preserving authoritative title | **PASS** |
| **CBF-007** | Base Extraction | Returns `'Course unavailable'` for empty or whitespace raw course names | **PASS** |
| **CBF-008** | Course Display | Preserves authoritative master course name and extracts clean base name | **PASS** |
| **CBF-009** | Course Display | Formats Normal Training courses without duplicate badge text | **PASS** |
| **CBF-010** | Course Display | Handles missing course inputs with honest fallbacks | **PASS** |
| **CBF-011** | Course Display | Preserves custom or unclassified course titles gracefully | **PASS** |
| **CBF-012** | Batch Deduplication | Deduplicates redundant course name prefix from batch title | **PASS** |
| **CBF-013** | Batch Deduplication | Preserves standalone batch names without mangling | **PASS** |
| **CBF-014** | Timing Period | Resolves `'Morning'`, `'Afternoon'`, `'Evening'`, `'Weekend'` from time & days | **PASS** |
| **CBF-015** | Timing & Mode | Combines timing period and normalized mode (`'Morning · Online'`) | **PASS** |
| **CBF-016** | Batch Fallback | Returns `'Batch not assigned'` when batch is absent | **PASS** |
| **CBF-017** | Combined Display | Generates compact and short representations for assigned batches | **PASS** |
| **CBF-018** | Combined Display | Generates honest compact/short labels when batch is unassigned | **PASS** |
| **CBF-019** | Combined Display | Handles completely missing course and batch data gracefully | **PASS** |
| **CBF-020** | Option Labels | Formats course select options with code and formatted fee | **PASS** |
| **CBF-021** | Option Labels | Formats batch select options with deduplicated name, timing, mode, seats | **PASS** |
| **CBF-022** | Option Labels | Explicitly marks full cohorts with `'- FULL (No Seats)'` | **PASS** |
| **CBF-023** | Search & Filter | Filters admissions accurately by course name | **PASS** |
| **CBF-024** | Search & Filter | Filters admissions accurately by batch name | **PASS** |
| **CBF-025** | Search & Filter | Returns empty set for non-matching queries without state corruption | **PASS** |
| **CBF-026** | Master Data | Preserves authoritative course ID, code, and fee without mutating source | **PASS** |
| **CBF-027** | Master Data | Preserves authoritative batch ID, code, capacity, and timing without mutating source | **PASS** |
| **CBF-028** | Cross-Module | Produces consistent base course & batch labels across LMS/CRM contexts | **PASS** |
| **CBF-029** | Disambiguation | Disambiguates `1:1` / `1-on-1` cues as Personal Training without duplicate badge | **PASS** |
| **CBF-030** | Disambiguation | Disambiguates Cohort/Normal cues via `training_category` as Normal Training | **PASS** |
| **CBF-031** | Deduplication | Eliminates duplicate course prefixes case-insensitively in batch titles | **PASS** |
| **CBF-032** | Missing Data | Handles missing historical course gracefully (`'Course unavailable'`) | **PASS** |
| **CBF-033** | Missing Data | Handles missing historical batch & schedule (`'Schedule unavailable'`) | **PASS** |
| **CBF-034** | Missing Mode | Handles batch with valid name & missing `training_mode` without synthesizing `'Online'` | **PASS** |
| **CBF-035** | Sorting & Filtering | Sorts & filters admissions deterministically by formatted course & batch labels | **PASS** |
| **CBF-036** | Option Labels | Formats course option label with code and INR price | **PASS** |
| **CBF-037** | Option Labels | Formats batch option label with seat availability when seats remain | **PASS** |
| **CBF-038** | Accessibility | Produces non-duplicated accessible summary text suitable for screen readers | **PASS** |
| **CBF-039** | Responsiveness | Fits compact labels within 7-viewport character budgets (`360px`–`1920px`) | **PASS** |
| **CBF-040** | Onboarding Safety | Additional payments on `Active` admissions succeed without duplicate onboarding cases | **PASS** |

---

## 3. PostgreSQL, Regression, Static Analysis & Build Verification
- **Isolated PostgreSQL Admission Allocation (`mzkrvvnmmjcjygwllabn`):** `public.allocate_admission_number` returned `5` distinct sequential numbers (`total_allocated: 5`, `distinct_allocated: 5`), cleanly rolled back.
- **TypeScript (`npx tsc --noEmit`):** `0` errors.
- **ESLint (`npm run lint`):** `0` errors, `0` warnings.
- **Production Build (`npm run build`):** `52/52` static pages + all dynamic/API routes compiled cleanly.
- **Standard Parallel Regression (`npx vitest run --reporter=verbose`):** Verified 100% pass rate across all test files.
- **Sequential Regression (`npx vitest run --no-file-parallelism`):** Verified 100% pass rate across all test files.

---

## 4. Cross-Device Responsiveness (7 Viewports) & Outstanding Limitations
- **7 Viewports (`scripts/verify-task09-viewports.mjs`):** `360×640`, `375×667`, `414×896`, `768×1024`, `1024×768`, `1440×900`, `1920×1080` all **PASS**.
- **Authenticated Live Business-Route Browser E2E:** `BLOCKED — AUTH_REQUIRED` (retained for TASK-11).
- **Pending P0 Operational Verification:** Production payment `spr-1795735527117-07vj` (`0cc9ab8d-61b9-cf63-3da5-cde93ed2c7c5`) remains `Pending Approval` (`revision: 54`, `collected_amount: 0`, `outstanding_balance: 33000`) awaiting genuine Accountant approval by Padmaja.
- **Deferred Risks:** All `TASK-11` and `TASK-12` deferred items remain preserved.
