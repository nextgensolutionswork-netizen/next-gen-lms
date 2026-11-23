# 🛡️ Admin Role-Based Access Control (RBAC) & Security Audit

**Target Environment:** Production (`https://next-gen-lms-omega.vercel.app`)  
**Assessed Role:** ADMIN (`admin@next-generpsolutions.com` / `Priya Nair (Operations Head)`)  
**Security Standard:** Principle of Least Privilege & Separation of Duties  
**Execution Timestamp:** 19 November 2026 (Asia/Kolkata)  

---

## 1. Role Permission Matrix (Admin vs Super Admin)

| Capability / Route | Super Admin | Admin | Enforcement Mechanism |
| :--- | :---: | :---: | :--- |
| **Dashboard (`/dashboard`)** | Allowed (Full) | Allowed (Executive Operations) | Middleware RBAC |
| **CRM Leads (`/crm/leads`)** | Allowed | Allowed (Supervised Pipeline) | Middleware RBAC |
| **Admissions (`/admissions`)** | Allowed | Allowed (Admissions Management) | Route Guard |
| **Student Directory (`/students`)** | Allowed | Allowed (Tenant Scoped) | Middleware + Tenant RLS |
| **Courses & Modules (`/academics/courses`)** | Allowed | Allowed | Academics RBAC |
| **Batches & Transfers (`/academics/batches`)** | Allowed | Allowed (With Transfer Audit) | Academics RBAC |
| **Timetable (`/academics/schedule`)** | Allowed | Allowed | Academics RBAC |
| **Attendance Sheet (`/academics/attendance`)** | Allowed | Allowed | Academics RBAC |
| **Assignments Desk (`/academics/assignments`)** | Allowed | Allowed | Academics RBAC |
| **Fee Accounts Ledger (`/accounts/fees`)** | Allowed | Allowed (Read / Non-approval) | Finance Guard |
| **Fee Approvals Desk (`/accounts/approvals`)** | Allowed | Restricted (Separation of Duties) | Finance Invariant |
| **Operating Expenses (`/accounts/expenses`)** | Allowed | Read / Operational View | Finance Guard |
| **Placement Hub (`/placement`)** | Allowed | Allowed (Supervised Hiring) | Placement RBAC |
| **Staff & Roles (`/users`)** | Allowed (All) | Allowed (Non-Super Admin Scope) | User Admin Guard |
| **Create/Promote Super Admin** | **Allowed** | ❌ **DENIED (HTTP 403)** | API & Backend Validation |
| **Modify/Deactivate Super Admin** | **Allowed** | ❌ **DENIED (HTTP 403)** | API & Backend Validation |
| **Self-Demotion / Role Change** | N/A | ❌ **DENIED (HTTP 403)** | BUG-AD-002 Invariant |
| **Diagnostic Console (`/todos`)** | **Allowed** | ❌ **DENIED (Redirect /dashboard)** | Middleware Section 11 |
| **System Settings Modification (`/settings`)** | Allowed | Restricted (Institute Branding Only)| Settings Guard |
| **Direct Production Schema Migration** | Allowed | ❌ **DENIED** | Supabase Service Role Barrier |

---

## 2. Security Test Evidence (Automated & Live UI)

1. **BUG-AD-001 (Privilege Escalation Prevention):**
   - Admin creating a user with `super_admin` role -> **403 Forbidden**.
   - Admin promoting existing user to `super_admin` -> **403 Forbidden**.
   - Admin attempting to modify or deactivate Super Admin accounts (`Rajesh Sharma`) -> **403 Forbidden**.
   - Admin attempting credential reset on Super Admin -> **403 Forbidden**.
2. **BUG-AD-002 (Admin Self-Demotion & Elevation):**
   - Admin attempting to alter their own role or demote themselves -> **403 Forbidden**.
   - Admin attempting to escalate self to `super_admin` -> **403 Forbidden**.
3. **Route Boundary Guard (`/todos`):**
   - Admin accessing `https://next-gen-lms-omega.vercel.app/todos` -> Intercepted by Middleware Section 11 and redirected to `/dashboard`.
4. **Student Ownership & Tenant Isolation:**
   - Admin accessing student within authorized tenant -> **200 OK**.
   - Admin accessing student outside authorized tenant -> **403 Forbidden**.
   - Tampered student UUID -> **404/403** (Strictly blocked).
