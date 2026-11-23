# ROLE 4 — TRAINER: ATTENDANCE TRACKING & ASSIGNMENTS EVALUATION AUDIT

**Application**: Next-Gen LMS & CRM  
**Target Environment**: Live Production  
**Target Identity**: Vikram Rao (SAP FICO Lead)  
**Modules Audited**: Attendance Registers & Webhooks, Assignments & Assessment Desk  
**Audit Date**: 19 November 2026  

---

## 1. ATTENDANCE REGISTRATION ARCHITECTURE

The attendance engine at `/academics/attendance` combines manual faculty marking with automated video meeting webhook synchronization.

```
┌────────────────────────────────────────────────────────┐
│               ATTENDANCE ENGINE ARCHITECTURE           │
└───────────────────────────┬────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         ▼                                     ▼
┌───────────────────────────────┐   ┌──────────────────────────────┐
│     Manual Faculty Marking    │   │  Automated Webhook Sync      │
│  - Quick Mark (Present/Absent)│   │  - Zoom Video Webhook        │
│  - Individual Status Toggles  │   │  - Google Meet Webhook       │
│  - Excel & CSV Exports        │   │  - Duration Threshold Rules  │
└───────────────────────────────┘   └──────────────────────────────┘
```

### 1.1 Automated Duration Threshold Rules
The system enforces automated attendance calculation based on meeting duration logs:
- **Present (≥ 70%)**: Trainee attended 70% or more of scheduled session duration.
- **Late (40% - 69%)**: Trainee attended between 40% and 69% of scheduled session duration.
- **Absent (< 40%)**: Trainee attended less than 40% of scheduled session duration.

### 1.2 Live Webhook Stream & Sync Features
- **Webhook Stream Panel**: Displays real-time event segments captured from Zoom and Google Meet webhooks.
- **Sync Live Meeting Modal**: Allows faculty to trigger manual or scheduled synchronization by entering Meeting ID / Room Code and target session duration.
- **Export Formats**:
  - `Export CSV`: Standard comma-delimited export for faculty records.
  - `Export to Excel`: Formatted spreadsheet with date headers, student roll numbers, and percentage summaries.

---

## 2. ASSIGNMENTS & ASSESSMENT EVALUATION DESK

### 2.1 Faculty Evaluation Queue
The evaluation desk at `/academics/assignments` operates in `Faculty Evaluation Mode`:
- Displays assignments and student submissions across assigned courses (`SAP S/4HANA Finance (FICO)` and `SAP Sales & Distribution (SD)`).
- Submissions from students outside assigned courses are strictly isolated and hidden from view.

### 2.2 Assignment Creation & Blueprint Delivery
The `New Assignment` modal enables faculty to publish hands-on problem statements:
- **Title**: Descriptive name of assignment (e.g. `FICO Configuration - Enterprise Structure & General Ledger Setup`).
- **Target Course & Cohort**: Dropdown filtered to assigned courses and batches.
- **Submission Due Date**: Features explicit `Asia/Kolkata` institute timezone handling.
- **Maximum Marks**: Numeric evaluation ceiling.
- **Problem Description & Deliverables**: Rich text instructions for student configuration.
- **Blueprint Attachment**: Drag-and-drop file upload supporting `.PDF, .ZIP, .DOCX, .XLSX, .RAR` up to 25MB.

### 2.3 Grading & Assessment Verification
- Faculty can review student blueprint submissions, award scores out of maximum marks, and provide structured qualitative feedback.
- Bulk download: Supports `Export Assignment Submissions ZIP` for offline evaluation of student configuration files.

---

## 3. AUDIT CONCLUSION

The attendance register and assignments evaluation desk provide complete academic tracking, robust webhook integration, and verified data isolation for faculty operations.
