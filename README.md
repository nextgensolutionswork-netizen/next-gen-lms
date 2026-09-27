# Next-Gen ERP Solutions — Enterprise LMS & Institute Management System

A production-ready full-stack Enterprise Learning Management System (LMS) and Institute Resource Planning (ERP) platform purpose-built for an SAP Professional Training Institute.

Hosted Architecture:
- Frontend & Backend: Next.js (App Router, Server Actions, TypeScript, Tailwind CSS)
- Database: PostgreSQL & Supabase (Normalized 28+ tables, RLS Policies, Database Functions)
- Storage: Supabase Storage for receipts, certificates, resumes, blueprints, video LMS streams
- Production Deployment Target: Render (`lms.next-generpsolutions.com`)

---

## 🌟 Modules & Features Overview

### 1. Role-Based Access Control (RBAC) & Default-Deny Authorization
7 Specialized User Roles with strict default-deny authorization:
- **Super Admin**: Full institutional control, admin management, role delegation, audit log review, system settings.
- **Admin**: Student lifecycle, trainers, courses, batches, admissions, attendance registers, operational reports.
- **Accountant**: Student fee ledgers, payment collection, receipts, refund reversal entries, expense approvals, vendor ledgers, financial reports. Strict default-deny: Accountants cannot view confidential academic course contents.
- **Counsellor**: CRM prospective leads, follow-ups, faculty demo bookings, direct lead-to-admission conversion.
- **Trainer**: Assigned courses only, assigned batch cohorts only, attendance registers, assignments & evaluation, exams & student academic progress. Strict default-deny: Trainers with zero assigned courses see zero courses; trainers cannot access accounts.
- **Placement Coordinator**: Student placement profiles, resume approvals, mock interview scorecards, job openings, corporate hiring applications.
- **Student**: Dedicated Student LMS Portal with secure video streaming, progress calculation, live lecture timetable, attendance records, assignments, exams, fee ledger & receipts, and certificates.

---

### 2. Comprehensive System Architecture

| Module | Route | Capabilities |
| :--- | :--- | :--- |
| **Executive Dashboard** | `/dashboard` | Real-time KPI summary (Collections, Outstanding, Net Cash Flow, Active Batches, Conversion Rate, Recent Admissions, Payments) |
| **CRM & Leads** | `/crm/leads` | Capture prospective leads, track stages (New, Contacted, Demo Scheduled, Demo Attended, Interested, Converted), 1-click conversion to admission without duplicate entry |
| **Follow-ups & Demos** | `/crm/followups` | Counselor calling queue and demo session schedules |
| **Admissions** | `/admissions` | Complete enrollment workflow: student account creation, course & batch enrollment, fee account setup, installment schedule generation |
| **Student 360° Management** | `/students` & `/students/[id]` | Full **12-Tab** profile: Overview, Courses, Batch, Attendance, Assignments, Assessments, Payments, Receipts, Certificates, Placement, Documents, Activity |
| **Courses & Curriculum LMS** | `/academics/courses` | Courses (SAP FICO, MM, SD, ABAP), Modules, Lessons (Video, PDF, Reading, Quiz, Assignment), published/draft status |
| **Batches & Transfers** | `/academics/batches` | Cohort schedules, maximum capacities, student transfers between batches with reason audit logs |
| **Class Schedule & Timetable**| `/academics/schedule` | Day/Week/Month calendar views, live Google Meet/Zoom links, lab room allocation |
| **Attendance Register** | `/academics/attendance` | Faculty attendance grid (Present, Absent, Late, Excused), auto percentage recalculation, CSV export |
| **Assignments & Grading** | `/academics/assignments`| Problem statement publishing, student submissions review, marks & feedback evaluation |
| **Quizzes & Assessments** | `/academics/assessments`| Objective assessments (MCQ, True/False) with automated instant grading and pass/fail thresholds |
| **Student Fee Accounts** | `/accounts/fees` | Original fee, approved discounts, net payables, collected amount, outstanding balance |
| **Payments Desk** | `/accounts/payments` | Atomic transaction fee processing (ACID guarantees, duplicate transaction reference prevention, receipt generation) |
| **Official Receipts** | `/accounts/receipts` & `/[id]` | Professional printable / PDF receipts with institute branding, GST number, transaction references, authorized signature |
| **Installment Schedules** | `/accounts/installments` | Upcoming, due, paid, partial, and overdue installment radar |
| **Expenses & Outflows** | `/accounts/expenses` | Facility rent, trainer honorariums, cloud servers, marketing expenses with approval workflows |
| **Vendor Management** | `/accounts/vendors` | Corporate suppliers, GST numbers, bank details, transaction history |
| **Financial Intelligence** | `/accounts/reports` | Cash flow, revenue vs expenses, course-wise revenue share, payment mode distribution, CSV exports |
| **Placement Support** | `/placement` | Resume vetting, mock technical & HR interview scores, corporate job openings, candidate tracking |
| **Certificates** | `/certificates` | Criteria validation (Attendance ≥ 80%, Course completion ≥ 80%, Zero fee balance), unique certificate ID generation |
| **Public Verification** | `/certificate/verify/[id]` | Public verification page validating authentic credentials |
| **Dedicated Student Portal** | `/portal` | Student experience with video LMS player, progress scrubber (+25% simulation), assignments, classes, fee balances |
| **Staff & Roles** | `/users` | Staff directory, role matrix, and course-scoping for faculty |
| **Audit Logs** | `/audit-logs` | Tamper-evident immutable changelogs capturing user, module, action, and JSON payload diffs |
| **System Settings** | `/settings` | Institute profile, GST number, Currency default (INR ₹), Timezone default (Asia/Kolkata), Notification toggles |

---

## 🗄️ Database Migrations (PostgreSQL / Supabase)

All SQL migrations are organized in `supabase/migrations/`:
1. `001_initial_schema.sql`: 28+ normalized tables, UUID primary keys, check constraints, foreign keys, timestamps, indexes.
2. `002_rls_policies.sql`: Row-Level Security policies enforcing default deny, course-level scoping for trainers, accountant restrictions, and student access to their own data.
3. `003_seed_data.sql`: Seed data for Next-Gen ERP Solutions with SAP FICO, MM, SD, ABAP, trainers, students, batches, leads, admissions, payments, receipts, and job openings.

### Running Migrations against Supabase:
```bash
# Push migrations directly to your Supabase project
npx supabase db push
```

---

## 🚀 Local Development & Testing

```bash
# 1. Install dependencies
npm install

# 2. Run automated tests (11 critical test suites)
npm test

# 3. Type check
npx tsc --noEmit

# 4. Production build
npm run build

# 5. Start production server
npm start
```

---

## 🌐 Production Deployment on Render

This repository includes:
- `render.yaml`: Blueprint definition configured for `lms.next-generpsolutions.com` with environment variables.
- `Dockerfile`: Multi-stage Docker container utilizing Next.js standalone server mode.

Environment Variables configured in `.env.example`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_DEFAULT_CURRENCY=INR`
- `NEXT_PUBLIC_DEFAULT_TIMEZONE=Asia/Kolkata`
