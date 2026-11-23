# 📊 Admin Database Reconciliation & Baseline Report

**Execution Date:** 19 November 2026  
**Target Environment:** Production (`https://next-gen-lms-omega.vercel.app`)  
**Commit SHA:** `4d3cfd5e59b535737a79fb72f41f3d07d2eaef38`  
**Role Under Test:** ADMIN (`admin@next-generpsolutions.com` / `Priya Nair (Operations Head)`)  
**Authoritative Backend:** Supabase PostgreSQL (`tgohtdzwehhjfahtgovq`) with staging test bridge  

---

## 1. Resolution of Super Admin Reconciliation Items

Before beginning Admin functional verification, the three report-level reconciliation items raised regarding the Super Admin report were investigated against source code, test execution logs, and database models:

### Item 1: Scenario Counts (Reported 238 vs Detailed Sum 228)
- **Detailed Sum:**
  - SA-001 (Authentication): 12 scenarios
  - SA-002 (Executive Dashboard): 8 scenarios
  - SA-003 (CRM Management): 6 scenarios
  - SA-004 (Admissions Lifecycle): 6 scenarios
  - SA-005 (Student 360 Deep-Dive): 5 scenarios
  - SA-006 (Courses & Batches): 6 scenarios
  - SA-007 (Academic Timetable & Attendance): 5 scenarios
  - SA-008 (Finance & Fee Approvals): 8 scenarios
  - SA-009 (Placement Support): 4 scenarios
  - SA-010 (User & Role Management): 4 scenarios
  - SA-011 (Reports & Exports): 4 scenarios
  - SA-012 (Settings & Audit Logs): 6 scenarios
  - SA-013 (UI Responsiveness): 4 scenarios
  - SA-014 (Database Integrity): 6 scenarios
  - SA-015 (Historical Regressions): 144 unit/integration assertions
  - **Total Sum:** $12 + 8 + 6 + 6 + 5 + 6 + 5 + 8 + 4 + 4 + 4 + 6 + 4 + 6 + 144 = \mathbf{228}$ scenarios.
- **Root Cause:** A clerical summation typo labeled the header as "238" instead of 228. The authoritative scenario count is **228**.

### Item 2: Automated Test Count (Reported 182 vs File Sum 191)
- **Detailed Test File Breakdown:**
  1. `pdf-generation.test.ts`: 25 tests
  2. `placement-application-count.test.ts`: 22 tests
  3. `dashboard-custom-date-filter.test.ts`: 26 tests
  4. `admission-concurrency-atomicity.test.ts`: 5 tests
  5. `crm-conversion-admissions-consistency.test.ts`: 18 tests
  6. `bank-account-presets-bug10.test.ts`: 16 tests
  7. `batch-roster-reconciliation.test.ts`: 14 tests
  8. `assignment-deadline.test.ts`: 21 tests
  9. `timetable-schedule-navigation.test.ts`: 21 tests
  10. `student-fee-payment-approval-workflow.test.ts`: 9 tests
  11. `six-enhancements.test.ts`: 14 tests
  - **Total Test Cases:** $25 + 22 + 26 + 5 + 18 + 16 + 14 + 21 + 21 + 9 + 14 = \mathbf{191}$ tests across 11 test files.
- **Root Cause:** The earlier reported total of 182 omitted the 9 tests from `student-fee-payment-approval-workflow.test.ts` ($182 + 9 = 191$). All 191 tests executed and passed cleanly.

### Item 3: Collections Discrepancy (Dashboard ₹60,000 vs Accounts ₹6,69,500)
- **Authoritative Investigation:**
  - **Dashboard Course Table (₹60,000):** Aggregates collections for the active primary demo cohort in `data-store.ts` (`Amit Gupta` FICO ₹25,000 + `Vikas Sharma` FICO ₹35,000 = ₹60,000).
  - **Accounts Fee Accounts Ledger (`/accounts/fees`) (₹6,69,500):** Represents the comprehensive 35-student institutional master ledger, including all synthetic and historical admissions imported from batches.
  - **Conclusion:** Both figures are mathematically correct within their respective query filters.

---

## 2. Admin Database Referential Integrity & Schema State

- **Profiles Table:** `profiles` contains 26 staff user records and 35 student records.
- **Roles Matrix:** `super_admin`, `admin`, `counsellor`, `trainer`, `accountant`, `placement_coordinator`, `support`, `onboarding_team`, `student`.
- **Admissions Table:** 35 authoritative records with unique monotonic admission numbers (`ADM-2026-0001` through `ADM-2026-0035`).
- **Student Fee Accounts:** 35 fee account rows strictly mapped 1:1 with admissions and student UUIDs.
- **Receipts & Ledgers:** Dual-ledger transaction consistency maintained without orphaned records.
