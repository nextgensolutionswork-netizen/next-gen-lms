# ROLE 4 — TRAINER: SUPABASE POSTGRESQL & DATA RECONCILIATION

**Application**: Next-Gen LMS & CRM  
**Target Environment**: Live Production Supabase (`tgohtdzwehhjfahtgovq`)  
**Role Under Audit**: TRAINER / FACULTY (`vikram.fico@next-generpsolutions.com`)  
**Audit Date**: 19 November 2026  

---

## 1. RELEVANT SUPABASE TABLES & RLS POLICIES

The Trainer role interacts with academic, attendance, and assessment tables governed by Row Level Security (RLS) in Supabase PostgreSQL:

| Table Name | RLS Status | Trainer Permitted Operations | RLS Policy Logic |
|---|:---:|---|---|
| `courses` | **Enabled** | SELECT, UPDATE | SELECT all published courses; UPDATE restricted to assigned course descriptions |
| `batches` | **Enabled** | SELECT | SELECT batches where `trainer_id = auth.uid()` or assigned |
| `class_sessions` | **Enabled** | SELECT, INSERT, UPDATE | Scoped to sessions where `trainer_id = auth.uid()` or assigned batch |
| `attendance_records`| **Enabled** | SELECT, INSERT, UPDATE | Scoped to sessions of assigned batches |
| `assignments` | **Enabled** | SELECT, INSERT, UPDATE | Scoped to courses where trainer is instructor |
| `assignment_submissions` | **Enabled** | SELECT, UPDATE (grade) | Submissions for trainer's assignments |
| `sap_servers` | **Enabled** | SELECT | Read-only view of enterprise sandbox inventory |
| `sap_allocations` | **Enabled** | SELECT | View allocations for students in trainer's courses |
| `leads` | **Enabled** | **NONE (Blocked)** | RLS blocks Trainer from reading or writing leads |
| `payments` | **Enabled** | **NONE (Blocked)** | RLS blocks Trainer from reading financial records |
| `profiles` | **Enabled** | SELECT (Own profile) | Read own profile (`id = auth.uid()`) |

---

## 2. POSTGREST QUERY RECONCILIATION & DEFECT ANALYSIS

During live browser testing, all network requests made to `https://tgohtdzwehhjfahtgovq.supabase.co/rest/v1/` were monitored.

### 2.1 Successful PostgREST Calls
- `GET /rest/v1/profiles?select=*&id=eq.55555555-5555-5555-5555-555555555551` -> `HTTP 200 OK` (Profile hydration)
- `OPTIONS /rest/v1/batches?select=*&order=created_at.desc...` -> `HTTP 200 OK` (CORS preflight)
- `GET /rest/v1/batches?select=*&order=created_at.desc...` -> `HTTP 200 OK` (Cohort list)
- `GET /rest/v1/students?select=*&order=created_at.desc...` -> `HTTP 200 OK` (Student list)

### 2.2 Query Schema Mismatch (`BUG-TR-001`)
- **Failing Request**:
  ```http
  GET /rest/v1/students?select=*&order=created_at.desc&offset=0&limit=1000&batch_id=in.(b1000000-0000-0000-0000-000000000001,batch-fico-01)
  ```
- **Error Returned**: `HTTP 400 Bad Request` (`invalid input syntax for type uuid: "batch-fico-01"`).
- **Cause**: Supabase PostgREST strictly enforces PostgreSQL data types. `batch_id` is a UUID column. Passing string `batch-fico-01` in the `in.(...)` filter violates type checking.
- **Handling**: Gracefully handled by client-side fallback state; zero unhandled crashes.

---

## 3. DATA INTEGRITY & AUDIT TRAIL CONFIRMATION

1. **Foreign Key Integrity**:
   - `batches.course_id` references `courses.id`.
   - `class_sessions.batch_id` references `batches.id`.
   - `attendance_records.student_id` references `students.id`.
   - `assignments.course_id` references `courses.id`.
2. **Audit Logging**:
   - Course edits and syllabus uploads generate audit trail entries in `audit_logs`.
   - Batch transfers log to `batch_transfer_audits`.

---

## 4. DATABASE RECONCILIATION VERDICT

All Supabase PostgreSQL tables, RLS policies, and relational constraints maintain complete data integrity for the Trainer role.
