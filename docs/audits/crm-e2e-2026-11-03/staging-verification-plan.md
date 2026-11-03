# Next-Gen ERP LMS — CRM Remediation: Staging Verification Plan
**Audit:** `crm-e2e-2026-11-03`  
**Branch:** `fix/crm-audit-remediation`  
**Date:** 2026-11-03  
**Target Environment:** Isolated Supabase Staging (NOT Production)

---

## 1. Staging Readiness Checklist

- [ ] **Isolated Staging Database Provisioned:** Dedicated project ID verified (distinct from production `tgohtdzwehhjfahtgovq`).
- [ ] **Zero Production Writes Guaranteed:** Client configurations and service keys point strictly to staging host.
- [ ] **Pre-Migration Schema Baseline Captured:** Table columns, constraints, indexes, and RLS policies dumped to `staging-schema-baseline.json`.
- [ ] **Synthetic Test Identities Provisioned:**
  - `admin-tenant-a@test.lms` (Tenant A, Admin role)
  - `counsellor-1-tenant-a@test.lms` (Tenant A, Counsellor role)
  - `counsellor-2-tenant-a@test.lms` (Tenant A, Counsellor role)
  - `admin-tenant-b@test.lms` (Tenant B, Admin role)
  - `counsellor-tenant-b@test.lms` (Tenant B, Counsellor role)
- [ ] **Pre-Migration Duplicate Group Analysis Executed:** 4 duplicate phone-digit groups identified and mapped.
- [ ] **Rollback Script Pre-Staged & Verified:** Full drop/revert script validated in staging dry-run.

---

## 2. Migration Compatibility & Risks

### A. Schema Differences & Compatibility Matrix

| Target Table | Column Required | Live Production Status | Staging Migration Action |
|---|---|---|---|
| `public.leads` | `tenant_id` | Missing | Add `TEXT DEFAULT 'default'` |
| `public.leads` | `canonical_phone` | Missing | Add `TEXT` + Backfill CASE + Sync Trigger |
| `public.leads` | `idempotency_key` | Missing | Add `TEXT` + Unique Index |
| `public.leads` | `is_repeat_inquiry` | Missing | Add `BOOLEAN DEFAULT FALSE` |
| `public.leads` | `repeat_inquiry_reason` | Missing | Add `TEXT` |
| `public.leads` | `original_lead_id` | Missing | Add `UUID REFERENCES leads(id) ON DELETE SET NULL` |
| `public.lead_followups` | `tenant_id` | Missing | Add `TEXT DEFAULT 'default'` |
| `public.admissions` | `lead_id` | Missing | Add `UUID REFERENCES leads(id) ON DELETE SET NULL` |

### B. Identified Migration Risks

1. **Unique Index Creation Failure on Existing Duplicates:**  
   PostgreSQL `CREATE UNIQUE INDEX` will fail immediately if duplicate `(tenant_id, canonical_phone)` rows exist with `is_repeat_inquiry = FALSE`. The non-destructive linking protocol must run *before* index creation.
2. **Canonical Phone Backfill Collisions:**  
   Naive prefix concatenation can double-prepend `91` if historical strings already contain national dial codes. The revised backfill CASE statement prevents this.
3. **Counsellor Lockout via Restrictive RLS:**  
   Overly strict policies could prevent counsellors from viewing unassigned lead pools or inserting newly converted walk-in leads. Policies must explicitly permit `counsellor_id IS NULL OR counsellor_id = auth.uid()`.

### C. Rollback Plan

If any step in the staging migration fails, execute the rollback script immediately:

```sql
-- ROLLBACK SCRIPT: Revert 20261103_prevent_duplicate_leads.sql
BEGIN;

-- 1. Remove Trigger & Function
DROP TRIGGER IF EXISTS trg_leads_canonical_phone_sync ON public.leads;
DROP FUNCTION IF EXISTS public.trg_compute_lead_canonical_phone();

-- 2. Drop Indexes
DROP INDEX IF EXISTS public.idx_leads_original_lead_id;
DROP INDEX IF EXISTS public.idx_leads_tenant_idempotency_key;
DROP INDEX IF EXISTS public.idx_leads_unique_active_tenant_canonical_phone;
DROP INDEX IF EXISTS public.idx_leads_tenant_canonical_phone;

-- 3. Remove Relationship on Admissions
ALTER TABLE public.admissions DROP COLUMN IF EXISTS lead_id;

-- 4. Remove Tenant Column on Follow-ups
ALTER TABLE public.lead_followups DROP COLUMN IF EXISTS tenant_id;

-- 5. Remove Deduplication Columns on Leads
ALTER TABLE public.leads 
  DROP COLUMN IF EXISTS original_lead_id,
  DROP COLUMN IF EXISTS repeat_inquiry_reason,
  DROP COLUMN IF EXISTS is_repeat_inquiry,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS canonical_phone,
  DROP COLUMN IF EXISTS tenant_id;

COMMIT;
```

---

## 3. Non-Destructive Duplicate-Phone Remediation Plan

**Core Rule:** Do NOT automatically delete, overwrite, or destructively merge duplicate lead records. All historical communications, notes, and counsellor assignments must remain preserved.

### Step 1: Read-Only Audit & Group Discovery
Run this query to inspect the 4 duplicate phone-digit groups without making any mutations:

```sql
SELECT 
  REGEXP_REPLACE(COALESCE(country_code, '+91'), '\D', '', 'g') AS clean_dial,
  RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10) AS national_10_digits,
  COUNT(*) AS total_records,
  ARRAY_AGG(id ORDER BY created_at ASC) AS lead_ids,
  ARRAY_AGG(lead_code ORDER BY created_at ASC) AS lead_codes,
  ARRAY_AGG(full_name ORDER BY created_at ASC) AS candidate_names,
  ARRAY_AGG(stage ORDER BY created_at ASC) AS stages,
  ARRAY_AGG(counsellor_id ORDER BY created_at ASC) AS counsellor_ids,
  ARRAY_AGG(created_at ORDER BY created_at ASC) AS timestamps
FROM public.leads
WHERE phone IS NOT NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1;
```

### Step 2: Categorization & Operational Review
Operations managers review the output and assign each record into one of three classifications:
- **Class A (Repeated Inquiries):** Same student submitted web inquiries months apart $\to$ Link secondary records as legitimate repeat inquiries.
- **Class B (Shared Family Contact):** Two distinct candidates sharing a household mobile $\to$ Preserve distinct lead identities; if both active, separate canonical suffixes or explicit repeat approval.
- **Class C (Stale / Lost Historical Duplicate):** Old inquiry marked `Lost` or `Not Interested` $\to$ Excluded from active unique index automatically by stage filter.

### Step 3: Non-Destructive Link Execution
For Class A and confirmed historical duplicate records, preserve the primary (earliest) lead and link subsequent records non-destructively:

```sql
BEGIN;

WITH ranked_duplicates AS (
  SELECT 
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY COALESCE(tenant_id, 'default'), 
                   '91' || RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10)
      ORDER BY created_at ASC
    ) AS primary_id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(tenant_id, 'default'), 
                   '91' || RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10)
      ORDER BY created_at ASC
    ) AS rank_order
  FROM public.leads
  WHERE phone IS NOT NULL
    AND stage NOT IN ('Lost', 'Not Interested')
)
UPDATE public.leads l
SET 
  is_repeat_inquiry = TRUE,
  original_lead_id = r.primary_id,
  repeat_inquiry_reason = 'Pre-migration audit non-destructive historical link'
FROM ranked_duplicates r
WHERE l.id = r.id 
  AND r.rank_order > 1;

COMMIT;
```

---

## 4. Tenant-Scoped RLS Policies & Negative Test Plan

### A. RLS Policy Definitions

```sql
BEGIN;

-- 1. Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing unconstrained policies
DROP POLICY IF EXISTS "CRM staff manage leads" ON public.leads;
DROP POLICY IF EXISTS "CRM staff manage followups" ON public.lead_followups;

-- 3. Leads Tenant Boundary (Mandatory RESTRICTIVE Filter)
CREATE POLICY "leads_tenant_boundary" ON public.leads
  AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    COALESCE(tenant_id, 'default') = (
      SELECT COALESCE(p.tenant_id, 'default') 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    COALESCE(tenant_id, 'default') = (
      SELECT COALESCE(p.tenant_id, 'default') 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

-- 4. Leads Role & Ownership Policies (PERMISSIVE)
CREATE POLICY "admin_all_leads" ON public.leads
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK (get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text]));

CREATE POLICY "counsellor_select_leads" ON public.leads
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    get_current_user_role() = 'counsellor'
    AND (counsellor_id = auth.uid() OR counsellor_id IS NULL)
  );

CREATE POLICY "counsellor_insert_leads" ON public.leads
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    get_current_user_role() = 'counsellor'
    AND (counsellor_id IS NULL OR counsellor_id = auth.uid())
  );

CREATE POLICY "counsellor_update_assigned_leads" ON public.leads
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  )
  WITH CHECK (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  );

-- 5. Lead Followups Tenant Boundary (RESTRICTIVE)
CREATE POLICY "lead_followups_tenant_boundary" ON public.lead_followups
  AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    COALESCE(tenant_id, 'default') = (
      SELECT COALESCE(p.tenant_id, 'default') 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    COALESCE(tenant_id, 'default') = (
      SELECT COALESCE(p.tenant_id, 'default') 
      FROM public.profiles p 
      WHERE p.id = auth.uid()
    )
  );

-- 6. Lead Followups Role Policies (PERMISSIVE)
CREATE POLICY "admin_all_followups" ON public.lead_followups
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  WITH CHECK (get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text]));

CREATE POLICY "counsellor_select_followups" ON public.lead_followups
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    get_current_user_role() = 'counsellor'
    AND (
      counsellor_id = auth.uid()
      OR lead_id IN (SELECT id FROM public.leads WHERE counsellor_id = auth.uid() OR counsellor_id IS NULL)
    )
  );

CREATE POLICY "counsellor_insert_followups" ON public.lead_followups
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  );

CREATE POLICY "counsellor_update_own_followups" ON public.lead_followups
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  )
  WITH CHECK (
    get_current_user_role() = 'counsellor'
    AND counsellor_id = auth.uid()
  );

COMMIT;
```

### B. Negative Authorization Test Suite

| Test ID | Actor Identity | Target Row | Attempted Operation | Expected Result |
|---|---|---|---|---|
| **RLS-NEG-01** | `counsellor-1-tenant-a` | Tenant B Lead | `SELECT * FROM leads WHERE id = 'lead-tenant-b'` | `0 rows returned` |
| **RLS-NEG-02** | `admin-tenant-a` | Tenant B Lead | `UPDATE leads SET notes = 'tamper' WHERE id = 'lead-tenant-b'` | `0 rows affected` |
| **RLS-NEG-03** | `counsellor-1-tenant-a` | Tenant A Lead (owned by `counsellor-2`) | `UPDATE leads SET stage = 'Lost' WHERE id = 'lead-c2'` | `0 rows affected` |
| **RLS-NEG-04** | `counsellor-1-tenant-a` | Tenant A Lead (owned by `counsellor-1`) | `DELETE FROM leads WHERE id = 'lead-c1'` | `0 rows affected (No DELETE policy)` |
| **RLS-NEG-05** | `counsellor-1-tenant-a` | Tenant A Lead (owned by `counsellor-2`) | `INSERT INTO lead_followups (lead_id, counsellor_id, ...)` | `Policy check violation` |

---

## 5. Execution Protocol for Staging Scenarios CRM-098 – CRM-101

1. **CRM-098 (Schema Metadata Verification):**  
   Query `information_schema.columns` on staging PostgreSQL. Assert columns `tenant_id`, `canonical_phone`, `idempotency_key`, `is_repeat_inquiry`, `repeat_inquiry_reason`, and `original_lead_id` exist on `leads`, and `lead_id` exists on `admissions`.
2. **CRM-099 (Constraints & Index Guarantees):**  
   Attempt duplicate insert with identical canonical phone under the same tenant. Verify database raises unique violation `23505` (`idx_leads_unique_active_tenant_canonical_phone`).  
   Attempt duplicate insert with identical `idempotency_key`. Verify database raises unique violation.
3. **CRM-100 (Live Staging RLS Read Restrictions):**  
   Connect via Supabase client using authenticated JWT of `counsellor-tenant-b`. Query `leads`. Verify zero leads from Tenant A appear in results.
4. **CRM-101 (Live Staging RLS Write Restrictions):**  
   Connect via Supabase client using authenticated JWT of `counsellor-1-tenant-a`. Execute direct UPDATE on lead assigned to `counsellor-2-tenant-a`. Verify zero rows affected.

---

## 6. Blocked Scenarios & Prerequisite Matrix

| Scenario ID | Name | Prerequisite to Unblock | Action Required |
|---|---|---|---|
| **CRM-036** | Retain source attribution through committed admission reload | Staging migration adding `admissions.lead_id` + isolated transactional commit reload test | Run staging test asserting `admissions.lead_id` matches source lead after commit |
| **CRM-041** | Enforce approved required-field policy for current status | Formal business decision: Is empty string rejected (400) or defaulted to 'Fresher'? | Obtain product sign-off and finalize validation schema |
| **CRM-085** | Preserve distinct WhatsApp contact in admission storage | Product decision: Should admissions table store distinct WhatsApp contact? | If yes, stage migration adding `whatsapp_number` to `admissions` |
| **CRM-114** | Reconcile canonical, unknown, and verified legacy course assignments | Canonical course directory mapping legacy IDs (`crs-001`, `sap-fico-01`) to UUIDs | Deploy shared course catalog resolver in staging |
