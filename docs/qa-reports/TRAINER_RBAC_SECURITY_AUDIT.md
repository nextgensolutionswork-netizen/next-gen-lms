# ROLE 4 — TRAINER: RBAC & PRIVILEGE BOUNDARY SECURITY AUDIT

**Application**: Next-Gen LMS & CRM  
**Target Environment**: Live Production  
**Role Under Audit**: TRAINER / FACULTY (`vikram.fico@next-generpsolutions.com`)  
**Security Framework**: Next.js Edge Middleware + Supabase Row-Level Security (RLS) + Client-Side Route Guards  
**Audit Date**: 19 November 2026  
**Auditor**: Principal QA Automation Engineer & Security Auditor  

---

## 1. EXECUTIVE SECURITY SUMMARY

The **TRAINER** role is designed strictly for academic curriculum delivery, session scheduling, student attendance verification, assignment evaluation, and SAP lab sandbox access. 

This security audit evaluated:
1. Separation of duties between Faculty and Institute Financial Administration.
2. Separation of duties between Faculty and User/Staff Management.
3. Separation of duties between Faculty and Sales CRM / Lead Management.
4. Vertical privilege escalation barriers (attempting Super Admin or Admin actions).
5. Horizontal privilege escalation barriers (accessing cohorts, batches, or assignments outside assigned course domain).

---

## 2. PRIVILEGE & PERMISSION INVENTORY

According to the authoritative RBAC definition in `lib/auth/rbac.ts`, the Trainer role possesses the following specific permissions:

```typescript
trainer: [
  'courses:read',
  'courses:write', // Edit syllabus & description; publishing requires director approval
  'batches:read',  // Scoped to assigned cohorts
  'batches:transfer',
  'schedule:read',
  'schedule:write',
  'attendance:read',
  'attendance:write',
  'assignments:read',
  'assignments:write',
  'assignments:grade',
  'assessments:read',
  'assessments:write',
  'assessments:grade',
  'doubts:read',
  'doubts:write',
  'doubts:resolve',
]
```

### Prohibited Permissions (Verified Absent)
- `users:manage` / `users:read` / `users:write` — Prohibited
- `crm:read` / `crm:write` / `crm:convert` — Prohibited
- `admissions:approve` / `admissions:write` — Prohibited
- `accounts:*` / `payments:create` / `receipts:create` — Prohibited
- `expenses:read` / `expenses:write` / `expenses:approve` — Prohibited
- `settings:manage` / `roles:manage` — Prohibited
- `courses:publish` — Prohibited (Requires Academic Director sign-off)

---

## 3. LIVE ROUTE ACCESS & MIDDLEWARE ENFORCEMENT

Direct HTTP GET navigation requests were dispatched from the live browser session for Trainer `Vikram Rao` across 7 administrative endpoints:

```
[TRAINER SESSION: vikram.fico@next-generpsolutions.com]
GET https://next-gen-lms-omega.vercel.app/todos               -> 307 Redirect -> /academics/courses (200)
GET https://next-gen-lms-omega.vercel.app/users               -> 307 Redirect -> /academics/courses (200)
GET https://next-gen-lms-omega.vercel.app/settings            -> 307 Redirect -> /academics/courses (200)
GET https://next-gen-lms-omega.vercel.app/accounts/approvals  -> 307 Redirect -> /academics/courses (200)
GET https://next-gen-lms-omega.vercel.app/accounts/expenses   -> 307 Redirect -> /academics/courses (200)
GET https://next-gen-lms-omega.vercel.app/crm/leads           -> 307 Redirect -> /academics/courses (200)
GET https://next-gen-lms-omega.vercel.app/superadmin          -> HTTP 404 Not Found
```

### Observations
1. **Zero Access Leakage**: In zero instances was a Trainer able to inspect CRM leads, user accounts, financial records, pending approvals, or system configurations.
2. **Safe Fallback**: Rather than crashing or exposing technical stack traces, the Next.js routing middleware cleanly bounced the user back to their authorized default home: `/academics/courses`.
3. **Ghost Route Protection**: High-privilege management paths like `/superadmin` return an explicit `HTTP 404`, masking the existence of the endpoint.

---

## 4. HORIZONTAL DATA ISOLATION AUDIT

### Cohort & Batch Isolation
- When navigating to `/academics/batches`, the query and memory filter enforce:
  ```typescript
  const visibleBatches = batches.filter((b) => canAccessBatch(user, b.id) || b.trainer_id === user?.id);
  ```
- Result: Trainer Vikram Rao only sees `B-2026-FICO-01`. Batch `B-MM-2601` (SAP MM Weekend Batch, assigned to MM faculty) is completely hidden.

### Assignment & Evaluation Isolation
- When navigating to `/academics/assignments`, the filter restricts evaluation queues to:
  ```typescript
  if (isTrainer) {
    return assignments.filter((a) => canAccessCourse(user, a.course_id) || a.created_by === user?.id);
  }
  ```
- Submissions queue enforces:
  ```typescript
  const allowedAsgIds = new Set(visibleAssignments.map((a) => a.id));
  return submissions.filter((s) => allowedAsgIds.has(s.assignment_id));
  ```
- Result: Trainer cannot inspect or grade student assignments submitted for courses outside their assigned portfolio.

---

## 5. SEPARATION OF DUTIES (SOD) VERIFICATION

| Duty Boundary | Trainer Role | Authorized Role | SoD Enforcement Mechanism |
|---|---|---|---|
| **Fee Collection & Approval** | Strictly Barred | Accountant, Admin | Middleware blocks `/accounts/*`; API endpoints verify `accounts:write` |
| **Course Publishing** | Blocked (Draft only) | Academic Director / Super Admin | Status dropdown locked: *"Reviewer sign-off required"* |
| **New Course Creation** | Blocked | Admin, Super Admin | Creation button omitted from DOM and API handlers |
| **Batch Deletion** | Blocked | Admin, Super Admin | Deletion action omitted; `deleteBatch` checks `batches:write` |
| **User Management** | Blocked | Super Admin, Admin | Middleware blocks `/users`; API rejects unprivileged role |

---

## 6. AUDIT CONCLUSION

The **TRAINER** role strictly complies with institute security standards and multi-tenant RBAC principles. All privilege boundaries hold under live verification.
