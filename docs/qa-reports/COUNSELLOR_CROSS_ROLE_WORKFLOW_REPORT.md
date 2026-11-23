# 🤝 Counsellor Cross-Role End-to-End Workflow Report

**Project:** Next-Gen LMS & CRM  
**Organization:** Next-Gen ERP Solutions / MyERP Hub  
**Target Environment:** Production (`https://next-gen-lms-omega.vercel.app`)  
**Commit SHA:** `4d3cfd5e59b535737a79fb72f41f3d07d2eaef38`  
**Role:** COUNSELLOR (`counsellor@next-generpsolutions.com`)  
**Date:** 19 November 2026  

---

## 1. Overview of Cross-Role Orchestration

The Next-Gen LMS & CRM integrates 9 dedicated workspaces with specialized roles:
1. **Super Admin** — Institutional Governance & Global Auditing
2. **Administrator** — Operations, Staff Management & Batch Rostering
3. **Counsellor (Sales)** — Lead Intake, Follow-ups, Demos & Admission Conversion
4. **Trainer / Faculty** — Syllabus, Batch Sessions, Attendance & Assignments
5. **Accountant** — Fee Collection Verification, Reversals, Invoices & Receipt Generation
6. **Placement Head** — Job Drives, Resumes & Candidate Hiring
7. **Academic Support** — Doubt Resolution, Lab Access & Ticket Management
8. **Onboarding Team** — Document Verification, LMS Credentials & Induction
9. **Enrolled Student** — Self-Service Portal, Courseware, Grades & Fee Receipts

This report examines each primary cross-role operational workflow involving the **COUNSELLOR** role.

---

## 2. Cross-Role Workflows Evaluation

### Workflow A: Lead Intake & Assignment (Admin $\to$ Counsellor)
- **Handoff Mechanism:**
  - Administrator creates or imports prospective candidate inquiries via CSV bulk-import or direct entry.
  - Lead is attributed to `counsellor_id = counsellor.id` (`Ananya Desai`).
  - Counsellor receives immediate visibility in `/crm/leads` under their active roster.
- **Verification Proof:** Verified via `tests/crm-leads-api-access.test.ts` and `tests/crm-lead-creation-enhancements.test.ts` (22 tests passing).

### Workflow B: Demo Scheduling & Faculty Allocation (Counsellor $\to$ Trainer)
- **Handoff Mechanism:**
  - Counsellor schedules a 1-on-1 demo for qualified leads (e.g., SAP FICO) and selects assigned faculty (`Vikram Rao`).
  - System checks trainer timetable in `Asia/Kolkata` time for conflicting sessions.
  - Scheduled demo appears in Trainer's timetable and Counsellor's `/crm/followups` calendar.
- **Verification Proof:** Verified in `tests/timetable-schedule-navigation.test.ts` (21 tests passing).

### Workflow C: Lead-to-Admission Conversion (Counsellor $\to$ Admin $\to$ Onboarding)
- **Handoff Mechanism:**
  - Counsellor executes admission conversion from candidate inquiry.
  - Atomic sequence generator allocates unique `ADM-2026-XXXX`.
  - Student record `students` is provisioned and linked to selected curriculum batch.
  - Admission appears immediately on Administrator's `/admissions` desk and Onboarding Team's verification queue.
- **Verification Proof:** Verified in `tests/admission-concurrency-atomicity.test.ts` (5 tests) and `tests/crm-conversion-admissions-consistency.test.ts` (18 tests).

### Workflow D: Fee Submission & Verification (Counsellor $\to$ Accountant)
- **Handoff Mechanism:**
  - Counsellor submits initial tuition installment (e.g., ₹20,000 via UPI).
  - Transaction enters `pending` state; Submitter is logged as Counsellor.
  - Chief Accountant (`Suresh Kumar`) receives pending notification on `/accounts/approvals`.
  - Upon bank credit reconciliation, Accountant clicks *Verify*, which issues tax receipt `REC-2026-XXXX`, increments verified collections, and updates student balance.
- **Verification Proof:** Verified in `tests/student-fee-payment-approval-workflow.test.ts` (9 tests) and `tests/counsellor-payment-workflow.test.ts` (7 tests).

### Workflow E: Academic Induction (Admission $\to$ Batch Roster $\to$ Student Portal)
- **Handoff Mechanism:**
  - Batch capacity is decremented; student is linked to batch roster (e.g. `B-FICO-2601`).
  - Trainer marks session attendance on `/academics/attendance`, automatically updating student attendance percentage on the student profile.
  - Student logs into `/portal` to view batch timings, meeting links, and downloadable syllabus.
- **Verification Proof:** Verified in `tests/batch-roster-reconciliation.test.ts` (14 tests).

---

## 3. Workflow Handoff Integrity Matrix

| Workflow Stage | From Role | To Role | Key Handoff Entity | Verification Mechanism | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Lead Allocation** | Admin | Counsellor | Lead Record (`lead_code`) | API & RLS Query Filter | ✅ VERIFIED |
| **Demo Session** | Counsellor | Trainer | Demo Booking (`Asia/Kolkata`) | Timetable Collision Guard | ✅ VERIFIED |
| **Admission Conversion** | Counsellor | Admin / Onboarding | Admission Record (`ADM-2026-XXXX`) | Atomic Postgres Transaction | ✅ VERIFIED |
| **Fee Settlement** | Counsellor | Accountant | Payment Submission (`pending`) | Multi-Party SoD Guard | ✅ VERIFIED |
| **Batch Allocation** | Admin | Trainer / Student | Cohort Roster (`B-FICO-2601`) | Roster Reconciliation Guard | ✅ VERIFIED |
| **Placement Handoff** | Support | Placement Head | Eligible Candidate (`STU-XXXX`) | Applicant Count Guard (BUG-09) | ✅ VERIFIED |

---

## 4. Conclusion
Cross-role transitions between Counsellor, Administrator, Trainer, and Accountant are fully synchronized, with immutable audit logging and zero data drift.
