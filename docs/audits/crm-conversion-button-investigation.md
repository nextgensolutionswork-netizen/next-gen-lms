# CRM "Convert to Admission" Button Investigation & Remediation Report

**Date:** 2026-11-02  
**Target Application:** Next Gen LMS (ERP Hub)  
**Production Page:** `/crm/leads` and `/admissions`  
**Status:** Completed & Verified  

---

## 1. Executive Summary & Observed Issue

### Observed Behavior
On `/crm/leads`, a lead that had already been successfully converted to an admission could continue to display the **"Convert to Admission"** and **"Quick Convert"** action buttons. Furthermore, navigating to `/admissions?convertLeadId=<leadId>` for an already converted lead allowed the admission modal to reopen with prefilled data, permitting duplicate admission submissions and duplicate student registrations.

### Root Cause
1. **Asynchronous Snapshot vs. Relational Leads Disconnect:**
   When admissions are created via `POST /api/admissions`, the server invokes `createAdmissionWorkflow(..., transactional = true)` wrapped in `paymentTransaction`. The transaction engine persists state snapshots to `fee_workflow_state` via Postgres RPC `commit_fee_workflow()`, but the PostgreSQL `leads` table is an independent table not stored within the fee workflow state snapshot. Direct Supabase writes inside `admission-service.ts` were guarded by `if (isLiveSupabaseEnabled() && !transactional)`, which meant that when `transactional === true`, no database update was committed to the PostgreSQL `leads` table.
2. **Snapshot Lead Stripping on Client:**
   In `lib/services/payment-workflow-state.ts`, the client-facing projection `visibleWorkflowSnapshot(actor)` explicitly strips `leads` from the returned snapshot (`const { users, batches, leads, ...result } = snapshot;`), preventing client-side cache reconciliation of leads.
3. **UI Evaluation Relied Solely on Mutable Lead Stage:**
   On `/crm/leads`, the table row actions evaluated eligibility solely on `lead.stage !== 'Converted' && lead.stage !== 'Enrolled'`. It did not authoritatively consult the relational link to admissions. If `lead.stage` was stale or out-of-sync, the action buttons remained active.
4. **Lack of Idempotency & In-Flight Guards:**
   Neither `handleConvertLead` (CRM Quick Convert) nor `handleCreateAdmission` (Admissions modal) had an `isSubmitting`/`isConverting` in-flight guard, allowing rapid double-clicks to fire concurrent admission creation requests.

---

## 2. Investigation Findings (Detailed Answers)

### 1. Complete Lead-to-Admission Conversion Workflow
The system provides two conversion paths:
- **Direct Link (`/admissions?convertLeadId=${lead.id}`):** The CRM redirects the counsellor to the Admissions page with the query parameter `convertLeadId`. The admissions modal prefills lead details (name, email, phone, course, batch, education, experience, counsellor attribution). Upon submission, `POST /api/admissions` invokes `createAdmissionWorkflow` in transactional mode.
- **Quick Convert Modal (`handleConvertLead` on `/crm/leads`):** Opens an inline modal capturing student details and executes `createAdmissionWorkflow(..., transactional = false)` directly against the client services / payment client.

### 2. Lead Status Update After Admission Creation
In `admission-service.ts`, step 6 (`if (input.lead_id)`) was updating `store.leads` in-memory and appending notes (`Converted to Admission: ${admission_number}`). However, because transactional mode bypassed direct Supabase updates, the PostgreSQL `leads` record retained its prior stage (e.g., `'Interested'`, `'New'`). On page refresh, `getLeads()` queried Supabase and fetched the old unconverted stage.

### 3. Relationship Between CRM Leads and Admissions
The PostgreSQL `admissions` table does not contain a foreign key `lead_id`. In-memory and application models lacked an explicit `lead_id` property on the `Admission` interface. The link was loosely inferred through lead notes text or student contact match.
**Fix Applied:**
- Added `lead_id?: string;` to `Admission` in `types/index.ts`.
- Recorded `lead_id: input.lead_id` on all created admissions.
- Established authoritative lookup `getLeadAdmission(lead, admissions)` resolving by `admission.lead_id`, `lead.notes` matching `admission_number`, and matching `(email, course_id)`.

### 4. Can a Converted Lead Retain a Stale Status?
Yes. Prior to this fix, if the database write did not commit to the independent `leads` table or if a network race occurred, `lead.stage` remained `'Interested'`. Because the UI previously checked only `lead.stage`, the buttons remained visible indefinitely.

### 5. Does the Leads Page Refresh After Conversion?
In `handleConvertLead`, `refreshLeads()` was invoked, but because the local lead object wasn't immediately reconciled and Supabase `leads` was not updated transactionally, the re-fetched data would overwrite the in-memory state back to the unconverted state.
**Fix Applied:**
- `reconcileLeadsWithAdmissions` runs automatically inside `getLeads()` and on every render pass.
- `onTransactionCommit` hooks registered in `admission-service.ts` reliably update Supabase `leads.stage = 'Converted'` post-commit.

### 6. API Errors, Supabase Authentication Failures, and RLS Restrictions
In live Supabase environments, counsellors without direct PostgreSQL UPDATE permissions on `leads` could experience silent failures if using standard client keys.
**Fix Applied:**
- The transactional post-commit update utilizes `createAdminClient()`, which operates with appropriate service credentials on the server side to update `leads` stage and notes.

### 7. Can the Same Lead Create Duplicate Admissions?
Previously yes, due to:
- Missing double-click protection (`isSubmitting` / `isConverting`).
- No pre-check in `createAdmissionWorkflow` checking if an admission already exists for `input.lead_id`.
**Fix Applied:**
- Implemented **B09b: Lead Conversion Idempotency Guard** in `createAdmissionWorkflow`. If an admission already exists for `input.lead_id`, it returns the existing admission, student, and fee account without duplicating records.
- Added UI-level double-click submission locks and disabled button states.

---

## 3. Implemented Fixes & Architecture

### A. Data Contract & Schema (`types/index.ts`)
- Added `lead_id?: string;` to `Admission` interface.
- Added `tenant_id?: string;` to `Lead` and `LeadFollowup` interfaces.

### B. Core Services (`lib/services/crm-service.ts` & `lib/services/admission-service.ts`)
1. **`getLeadAdmission(lead, admissions?)`:**
   Authoritative finder that resolves matching admissions across `lead_id`, notes containing `admission_number`, or `(email, course_id)`.
2. **`isLeadConverted(lead, admissions?)`:**
   Authoritative predicate returning `true` if `lead.stage === 'Converted' || lead.stage === 'Enrolled' || Boolean(getLeadAdmission(lead, admissions))`.
3. **`reconcileLeadsWithAdmissions(leads, admissions?)`:**
   Iterates through leads, automatically reconciling any lead that has a linked admission to `stage = 'Converted'` and ensuring admission number attribution in notes. Integrated into all `getLeads()` return paths.
4. **`createAdmissionWorkflow` Enhancements:**
   - **Cross-Tenant Conversion Guard:** Rejects conversion attempts where `tenantId(lead) !== admissionTenant`.
   - **Idempotency Guard:** Detects existing admissions for `input.lead_id` and safely returns existing records without re-inserting students or ledger entries.
   - **Post-Commit Supabase Hook:** Registers `onTransactionCommit` callback updating `leads` table in Supabase when running transactionally.
   - Returns `lead?: Lead;` in the workflow result object.
5. **`convertLeadToAdmission(leadId)` Guard:**
   Throws an error if `isLeadConverted(lead)` is already true.

### C. UI Hardening (`app/(dashboard)/crm/leads/page.tsx`)
- Imported `getLeadAdmission` and `isLeadConverted`.
- Added `isConverting` state for in-flight double-click protection.
- In table rendering:
  - If `isConverted === true`: renders `<Badge variant="success">Converted</Badge>`.
  - Hides "Convert to Admission" and "Quick Convert".
  - Renders "View Admission" button that navigates directly to `/admissions?search=${admission_number}`.
  - Quick Convert modal button shows `Converting...` and is disabled while processing.

### D. UI Hardening (`app/(dashboard)/admissions/page.tsx`)
- Imported `useRouter` and `isLeadConverted`.
- In `useEffect` on `convertLeadId`: checks if `isLeadConverted(lead)`. If so, displays an informative alert and cleanly replaces URL to `/admissions` without opening the prefilled registration modal.
- In `handleCreateAdmission`:
  - Added `isSubmitting` state.
  - Checks if `convertedLeadId` is already converted before submission.
  - Sets submit button to `Registering Admission...` and disables button while submitting.

---

## 4. Verification & Testing

### Regression Suite (`tests/crm-conversion-button.test.ts`)
An 8-case comprehensive automated test suite was constructed and executed via Vitest:
1. `New lead has isLeadConverted === false and is eligible for conversion` -> **PASSED**
2. `Successful conversion creates admission with lead_id, marks lead Converted, and records note` -> **PASSED**
3. `Converted lead blocks re-conversion via convertLeadToAdmission helper` -> **PASSED**
4. `Stale lead stage is authoritatively reconciled to Converted when an admission exists` -> **PASSED**
5. `Failed conversion validation does not falsely mark lead as converted` -> **PASSED**
6. `Double-click / retry idempotency: creating admission twice with same lead_id returns existing admission without duplicates` -> **PASSED**
7. `Cross-tenant conversion is rejected` -> **PASSED**
8. `Super Admin and Counsellor can convert leads; unauthorized roles are rejected` -> **PASSED**

### Related Test Suites
- `tests/crm-leads-api-access.test.ts`: **4 passed (4)**
- `tests/crm-admissions-operations.test.ts`: **17 passed (17)**

### Compiler & Linter Verification
- `npm run typecheck`: **Clean pass (0 errors)**
- `npm run lint`: **Clean pass (No ESLint warnings or errors)**

---

## 5. Summary of Files Changed

| File Path | Nature of Change |
|---|---|
| `types/index.ts` | Added `lead_id?: string;` to `Admission`, added `tenant_id?: string;` to `Lead` & `LeadFollowup`. |
| `lib/services/crm-service.ts` | Added `getLeadAdmission`, `isLeadConverted`, `reconcileLeadsWithAdmissions`, updated `convertLeadToAdmission` guard, and wired reconciliation into `getLeads()`. |
| `lib/services/admission-service.ts` | Added cross-tenant guard, lead conversion idempotency check, `lead_id` assignment on admission, transactional post-commit Supabase update via `onTransactionCommit`, and returned `lead`. |
| `app/(dashboard)/crm/leads/page.tsx` | Added authoritative conversion check, replaced stage badge with `Converted`, hid conversion buttons, added "View Admission" link, added `isConverting` double-click guard. |
| `app/(dashboard)/admissions/page.tsx` | Added stale `convertLeadId` URL guard, redirecting already converted leads away from modal, added `isSubmitting` double-click guard. |
| `tests/crm-conversion-button.test.ts` | Created 8-case automated regression test suite. |
| `docs/audits/crm-conversion-button-investigation.md` | Complete investigation and resolution audit documentation. |

---

## 6. Safety & Rollout Note
- **No Production Mutation:** No live production records were modified or deleted during investigation and testing.
- **Zero Schema Breaking Changes:** All additions are backward-compatible and optional on existing types.
- **RLS & Security Unbroken:** Multi-tenant boundaries and role authorizations are strictly enforced.
