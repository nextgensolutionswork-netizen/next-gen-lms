# TASK-06 — Mock Data Count Mismatches & Remaining Regression Resolution Report

## 1. Executive Summary
- **Task ID:** TASK-06
- **Branch / Base:** `task-06-regression-stabilization` (from `079e00e`)
- **Outcome:** Resolved all **6** remaining automated regression failures (`MDC-01`–`MDC-05`), achieving a **100.00% automated regression pass rate** (**136/136 test files, 2,218/2,218 tests passing**), **0 TypeScript errors**, **0 ESLint errors/warnings**, and **52/52 Next.js routes compiled**.

## 2. Root Causes & Classifications of All 6 Remaining Failures
| ID | Suite & Failing Test | Classification | Root Cause | Resolution |
|---|---|---|---|---|
| **MDC-01 (1 & 2)** | `tests/admin-bug-fixes.test.ts` (Scenarios 3 & 6) | Test Hydration Isolation | `GET /api/students/[id]` calls `store.hydrateFromDisk()`, overwriting the in-memory `stu-external-01` fixture pushed in `beforeEach` | Mocked `store.hydrateFromDisk()` -> `false` in `beforeEach` (`afterEach(() => vi.restoreAllMocks())`); real cross-tenant `403 Forbidden` preserved (`18/18` pass) |
| **MDC-02** | `tests/course-management.test.ts` | Duplicate Seed Fixture | `store.courses` already seeds `SAP-ABAP-2026` / `SAP ABAP on Cloud`, causing `createCourse` uniqueness check to reject | Updated test fixture to distinct `SAP-BTP-2026` / `SAP BTP Extension Suite`, preserving course uniqueness validation (`13/13` pass) |
| **MDC-03** | `tests/excel-export-and-ads-import.test.ts` | Validation Contract + Duplicate Phone Seed | (1) `leadFields.lead_source` rejected dynamic campaign-tagged Ads import strings (`Ads (Q1_Admissions_Drive)`); (2) phone `+91 99887 76655` collided with seeded lead | (1) Updated `leadFields.lead_source` in `lib/services/lead-input.ts` to `z.string().trim().min(1).max(200).transform(v => v as LeadSource).optional()`; (2) used unique synthetic phone `+91 99887 76691` (`10/10` pass) |
| **MDC-04** | `tests/onboarding.test.ts` (`backfillLegacyAdmissions`) | Actual Application Defect | `getUnbackfilledAdmissionsCount()` counted only `!c.admission_id`, whereas `backfillLegacyAdmissions()` also deduplicates by `c.student_id` (`5` vs `1`) | Aligned `getUnbackfilledAdmissionsCount()` in `lib/services/onboarding-service.ts` to check both `admission_id` and `student_id` (`22/22` pass) |
| **MDC-05** | `tests/platform-admin-operations.test.ts` (Module 32 Audit Logs) | Mismatched Count Baseline | Test compared `getAuditLogs().length` (which excludes `CRM` logs) against raw `store.auditLogs.length` (`1155` vs `1089`) | Aligned `initialCount` to `(await getAuditLogs()).length` (`26/26` pass) |

## 3. Mandatory Experience & Controlled QA Counts (`Phase K & M`)
- Added [tests/task-06-data-consistency-and-counts.test.ts](tests/task-06-data-consistency-and-counts.test.ts) (`2/2` pass):
  - Verified `POST /api/crm/leads` (`app/api/crm/leads/route.ts`) rejects omitted, `null`, empty `""`, and whitespace `"   "` `experience` with HTTP `400`, while accepting `'Fresher'` and numeric `experience_years: 0`.
  - Verified controlled 10-lead / 4-admission / 4-student / 2-course / 3-batch / 4-onboarding / 6-payment dataset reconciles `monthlyCollections = 30000` (verified only) and `pendingCollections = 10000`.
