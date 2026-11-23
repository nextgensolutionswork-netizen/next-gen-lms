# ROLE 5 — STUDENT / LEARNER: SUPABASE DATABASE RECONCILIATION

**Application**: Next-Gen LMS & CRM  
**Target Environment**: Live Production (`https://next-gen-lms-omega.vercel.app`)  
**Supabase Project ID**: `tgohtdzwehhjfahtgovq`  
**Production Commit SHA**: `4d3cfd5e59b535737a79fb72f41f3d07d2eaef38`  
**Execution Date**: 21 November 2026  

---

## 1. AUTH & STUDENT IDENTITY RECONCILIATION

### `auth.users` Table
```sql
SELECT id, email, role, confirmed_at, raw_user_meta_data
FROM auth.users
WHERE email = 'amit.gupta@student.next-gen.com';
```
- **UUID**: `77777777-7777-7777-7777-777777777771`
- **Role**: `authenticated`
- **Metadata**:
  - `full_name`: `Amit Gupta (SAP FICO Student)`
  - `role`: `student`
  - `phone`: `+91 98111 22233`
  - `is_active`: `true`

---

## 2. LMS & ACADEMIC TABLE RECONCILIATION

### `public.students` Table
```sql
SELECT id, user_id, admission_number, course_id, batch_id, status, created_at
FROM public.students
WHERE user_id = '77777777-7777-7777-7777-777777777771';
```
- **Student ID**: `51000000-0000-0000-0000-000000000001`
- **Admission Number**: `ADM-2026-001` (Legacy ref: `ADM-2026-0001`)
- **Course ID**: `c1000000-0000-0000-0000-000000000001` (SAP S/4HANA Finance)
- **Batch ID**: `b1000000-0000-0000-0000-000000000001` (`B-2026-FICO-01`)
- **Status**: `Active`

### `public.student_lms_access` Table
```sql
SELECT user_id, enabled, onboarding_step, updated_at
FROM public.student_lms_access
WHERE user_id = '77777777-7777-7777-7777-777777777771';
```
- **Record**: No active row found with `enabled = true`.
- **Impact**: Explains the edge middleware redirect to `/login?error=access_unavailable` under Rule G03.

### `public.certificates` Table
```sql
SELECT certificate_number, student_name, course_name, grade, attendance_percentage, issue_date
FROM public.certificates
WHERE certificate_number = 'CERT-2026-FICO-0091';
```
- **Certificate Number**: `CERT-2026-FICO-0091`
- **Student Name**: `Amit Gupta`
- **Course Name**: `SAP S/4HANA Finance (FICO)`
- **Grade**: `A+`
- **Attendance**: `92.5%`
- **Issue Date**: `2026-04-20`
- **Status**: `VALID`

---

## 3. ROW LEVEL SECURITY (RLS) AUDIT

- **Table `student_lms_access`**: Governed by policy `own_lms_access` where `user_id = (SELECT auth.uid())::text`.
- **Table `students`**: Students cannot modify their admission details, enrolled course, or batch assignment.
- **Table `certificates`**: Read-only access via public verification endpoints with zero mutation allowed from the client.
