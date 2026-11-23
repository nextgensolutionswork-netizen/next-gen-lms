# ROLE 4 — TRAINER: PRODUCTION BUG REGISTER & DEFECT TRIAGE

**Application**: Next-Gen LMS & CRM  
**Target URL**: `https://next-gen-lms-omega.vercel.app`  
**Test Account**: `vikram.fico@next-generpsolutions.com` (Vikram Rao — SAP FICO Lead)  
**Report Date**: 19 November 2026  

---

## 1. DEFECT CLASSIFICATION SUMMARY

| Severity Level | Open | In Progress | Resolved / Verified | Total |
|---|:---:|:---:|:---:|:---:|
| **P0 — Blocker** | 0 | 0 | 0 | 0 |
| **P1 — Critical** | 0 | 0 | 0 | 0 |
| **P2 — Moderate** | 1 | 0 | 0 | 1 |
| **P3 — Minor / Cosmetic** | 0 | 0 | 0 | 0 |
| **TOTAL** | **1** | **0** | **0** | **1** |

---

## 2. ACTIVE DEFECT INVENTORY

### BUG-TR-001: Non-UUID Batch Identifier in PostgREST Query Causes HTTP 400 in Batch Roster Dialog

- **Defect ID**: `BUG-TR-001`
- **Severity**: P2 (Moderate — Non-blocking, gracefully handled in UI)
- **Module**: Academics / Batches (`/academics/batches`)
- **Component**: `BatchStudentRosterModal` / `getStudentsForBatch`
- **Discovered In**: SUITE TR-003, Browser Step 22
- **Network Request**:
  ```http
  GET https://tgohtdzwehhjfahtgovq.supabase.co/rest/v1/students?select=*&order=created_at.desc&offset=0&limit=1000&batch_id=in.(b1000000-0000-0000-0000-000000000001,batch-fico-01)
  ```
- **HTTP Response**:
  ```http
  HTTP/1.1 400 Bad Request
  {"code":"22P02","details":null,"hint":null,"message":"invalid input syntax for type uuid: \"batch-fico-01\""}
  ```
- **Root Cause Analysis**:
  In PostgreSQL Supabase schema, the `students.batch_id` column is typed as `uuid`. The frontend query constructor in `academics-service.ts` or `data-store.ts` includes both legacy test fixture string IDs (`batch-fico-01`) and standard Supabase UUIDs (`b1000000-0000-0000-0000-000000000001`) in an `in.(...)` PostgREST filter. Because `batch-fico-01` is not a valid 36-character UUID format, PostgreSQL rejects the entire query with code `22P02`.
- **User Impact**:
  The UI catches the query rejection gracefully and falls back to displaying: *"No students currently enrolled"*. The page does not crash, freeze, or display a blank screen.
- **Recommended Remediation**:
  In `lib/services/academics-service.ts`, sanitize `batch_id` values before constructing the PostgREST query:
  ```typescript
  const isValidUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const sanitizedBatchIds = batchIds.filter(isValidUuid);
  ```
- **Workaround**: None needed; non-blocking for live academic operations.

---

## 3. CLOSED & VERIFIED TRAINER DEFECTS

| Bug ID | Title | Verified Resolution | Status |
|---|---|---|:---:|
| `BUG-TR-HIST-01` | Trainer can access global course creator (`New SAP Course`) | Verified: `New SAP Course` button is completely hidden from Trainer DOM | **CLOSED / RESOLVED** |
| `BUG-TR-HIST-02` | Trainer can publish course modifications without director approval | Verified: Status dropdown is disabled with *"Reviewer sign-off required from Academic Director"* | **CLOSED / RESOLVED** |
| `BUG-TR-HIST-03` | Trainer can delete assigned batches | Verified: Batch delete action buttons are completely omitted for Trainer | **CLOSED / RESOLVED** |
| `BUG-TR-HIST-04` | Trainer can access fee approvals desk via URL | Verified: Middleware intercepts `/accounts/approvals` and redirects to `/academics/courses` | **CLOSED / RESOLVED** |
| `BUG-TR-HIST-05` | Hardcoded preview domain in legacy test suite | Verified: Automated test suites utilize relative Next.js testing and environment URLs | **CLOSED / RESOLVED** |

---

## 4. RELEASE BLOCKER ASSESSMENT

- **Open Blocker (P0) Count**: **0**
- **Open Critical (P1) Count**: **0**
- **Conclusion**: None of the observed issues impede live production deployment or academic faculty duties. Role 4 is cleared for production release.
