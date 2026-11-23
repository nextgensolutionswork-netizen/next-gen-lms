# ROLE 4 — TRAINER: ACADEMIC OPERATIONS & CURRICULUM DELIVERY REPORT

**Application**: Next-Gen LMS & CRM  
**Target Environment**: Live Production (`https://next-gen-lms-omega.vercel.app`)  
**Target Identity**: Vikram Rao (SAP FICO Lead)  
**Modules Audited**: Courses & Modules, Batches & Transfers, Timetable & Scheduling, SAP Lab Servers  
**Audit Date**: 19 November 2026  

---

## 1. ACADEMIC DOMAIN OVERVIEW

As the SAP FICO Lead Trainer, `Vikram Rao` manages curriculum design, cohort delivery, lecture scheduling, and SAP hands-on sandbox allocation for enterprise learners.

```
                    ┌───────────────────────────────┐
                    │     ACADEMIC OPERATIONS       │
                    └──────────────┬────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Course LMS Desk │      │ Cohort Lifecycle │      │ Timetable Engine │
│  - SAP FICO      │      │  - B-2026-FICO-01│      │  - Day/Week/Month│
│  - SAP SD        │      │  - Roster View   │      │  - Zoom/Meet sync│
│  - Syllabus Sync │      │  - Capacity Check│      │  - Room 2 (Lab)  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

---

## 2. COURSE & CURRICULUM DELIVERY AUDIT

### 2.1 Course Portfolio
On `/academics/courses`, exactly 2 enterprise courses are assigned to Vikram Rao:

1. **SAP S/4HANA Finance (FICO)**:
   - **Course Code**: `SAP-FICO-2026`
   - **Duration**: `12 Weeks`
   - **Tuition Fee**: `₹45,000`
   - **Publication Status**: `Published`
   - **Category**: `SAP Functional`
   - **Scope**: General Ledger (FI-GL), Accounts Payable (FI-AP), Accounts Receivable (FI-AR), Asset Accounting (FI-AA), Cost Center Accounting (CO-CCA), Profit Center Accounting (CO-PCA), and S/4HANA Greenfield/Brownfield Migration.
2. **SAP Sales & Distribution (SD)**:
   - **Course Code**: `SAP-SD-2026`
   - **Duration**: `10 Weeks`
   - **Tuition Fee**: `₹40,000`
   - **Publication Status**: `Published`
   - **Category**: `SAP Functional`
   - **Scope**: Enterprise Structure, Order-to-Cash (O2C) cycle, Pricing Procedures, Shipping, Credit Management, and S/4HANA Sales integration.

### 2.2 Syllabus Attachment & Course Editing Workflow
- Trainers can attach official syllabus PDFs and update course description text.
- Form inputs support:
  - Official curriculum guide URL or PDF upload.
  - Duration in weeks (numeric spinbutton).
  - Price in INR (numeric spinbutton).
- Academic Director Review Gate: Any changes to course publication status require signed review from the Academic Director before going live to students.

---

## 3. BATCH & COHORT MANAGEMENT

### 3.1 Cohort Architecture
- Assigned Cohort: `B-2026-FICO-01` (`SAP FICO Morning Cohort (Weekday)`).
- Schedule: Monday, Wednesday, Friday (07:30 - 09:00 IST).
- Duration: 01 September 2026 – 25 November 2026.
- Delivery Mode: `Online Live`.
- Capacity: 1 / 25 Trainees enrolled.
- Scope Isolation: Batches for non-assigned courses (e.g. `B-MM-2601` for Materials Management) are hidden from Vikram Rao's batch list.

### 3.2 Student Transfers & Capacity
- Batch roster inspection confirms restricted trainer view with 25 maximum seats.
- Batch transfer audit trail panel is initialized and tracks student movements across cohorts with timestamp, reason, and admin actor.

---

## 4. TIMETABLE & LECTURE SCHEDULING ENGINE

### 4.1 Multi-View Calendar Navigation
- Verified interactive calendar switchers:
  - `Day View`: Hourly time slots with real-time cursor indicator.
  - `Week View`: Weekly schedule spanning Monday to Sunday (verified current window: 16 Nov – 22 Nov 2026).
  - `Month View`: Full month calendar with session pill badges.
  - `All View`: Paginated chronological list of all assigned sessions.

### 4.2 Conference & Lab Workshop Scheduling
- Session creation modal includes:
  - Batch target selector.
  - Topic / Agenda input (e.g. `Asset Accounting & Depreciation Run Configuration`).
  - Class Mode: `Hybrid`, `Online Live`, `Classroom Lab`.
  - Lab / Room allocation: `Lab 2 (SAP Enterprise Server Lab)`.
  - Automated Conference Integration with Webhook Auto-Sync:
    - `Zoom Video`
    - `Google Meet`
    - `Manual Join URL`

---

## 5. SAP LAB SERVERS & ENTERPRISE SANDBOXES

### 5.1 Infrastructure Health
On `/academics/sap-servers`, 2 dedicated SAP environments are monitored:

| System Name | SID | Instance # | Host / Port | Status | Protocol | Ping Response |
|---|:---:|:---:|---|:---:|:---:|:---:|
| **SAP S/4HANA 2022 FPS02** | `S4H` | `00` | `s4h.lab.next-generpsolutions.com:3200` | **Online** | RFC / CPIC | **29 ms** |
| **SAP ECC 6.0 EHP8** | `DEV` | `01` | `ecc.lab.next-generpsolutions.com:3201` | **Online** | RFC / CPIC | **Active** |

### 5.2 Trainee Credentials & SAP GUI Integration
- Real trainee sandbox allocation for `Amit Gupta` (`ADM-2026-0001`):
  - System: `S4H (00)`
  - Client: `800`
  - User ID: `SAP_AMITG` (with one-click clipboard copy)
  - Password Masking: Default `••••••••` masked; one-click reveal displays `[REDACTED]`
  - Status: `Expired` (Window: 15 Jan 2026 → 15 May 2026)
- **Automated SAP GUI Shortcut Generator**:
  - Clicking `Shortcut` generates a live `.sap` file: `S4H_SAP_AMITG.sap`.
  - Content specifies system connection string, client 800, user ID `SAP_AMITG`, and autologon parameters.

---

## 6. ACADEMIC OPERATIONS VERDICT

All academic modules, course management tools, session scheduling features, and SAP lab sandboxes are fully operational, compliant with institute standards, and ready for production use.
