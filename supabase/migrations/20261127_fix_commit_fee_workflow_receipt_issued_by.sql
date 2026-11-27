-- P0 Hotfix: Safely resolve receipts.issued_by UUID in commit_fee_workflow
-- Previously, COALESCE(NULLIF(rcpt->>'authorized_by', '')::uuid, NULLIF(rcpt->>'issued_by', '')::uuid)
-- threw SQLSTATE 22P02 when receipt.authorized_by held the verifier's display name (e.g. 'Padmaja').

CREATE OR REPLACE FUNCTION public.commit_fee_workflow(
  p_tenant text,
  p_revision bigint,
  p_snapshot jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  new_revision bigint;
  adm jsonb;
  stu jsonb;
  fa jsonb;
  inst jsonb;
  pay jsonb;
  rcpt jsonb;
  oc jsonb;
  aud jsonb;
  case_record jsonb;
  enabled boolean;
  v_pay_uuid uuid;
  v_rcpt_uuid uuid;
  v_inst_uuid uuid;
  v_oc_uuid uuid;
  v_aud_uuid uuid;
  v_issued_by uuid;
BEGIN
  -- 3A. Optimistic revision check on fee_workflow_state
  IF p_revision = 0 THEN
    INSERT INTO public.fee_workflow_state(tenant_id, revision, snapshot)
      VALUES (p_tenant, 1, p_snapshot)
      ON CONFLICT DO NOTHING
      RETURNING revision INTO new_revision;
  ELSE
    UPDATE public.fee_workflow_state
      SET revision = revision + 1, snapshot = p_snapshot, updated_at = now()
      WHERE tenant_id = p_tenant AND revision = p_revision
      RETURNING revision INTO new_revision;
  END IF;
  IF new_revision IS NULL THEN
    RAISE EXCEPTION 'Conflict: workflow revision changed' USING ERRCODE = '40001';
  END IF;

  -- 3B. Upsert affected normalized admissions
  FOR adm IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'admissions', '[]'::jsonb)) LOOP
    INSERT INTO public.admissions(
      id, admission_number, student_name, phone, email, dob, gender, address, city,
      education, experience_years, current_employment_status, course_id, training_mode,
      admission_date, course_fee, discount, discount_reason, net_payable, payment_plan,
      counsellor_id, status, tenant_id, student_unique_id, our_bank_name,
      our_bank_account_name, our_bank_account_id, our_upi_details, lead_id
    )
    VALUES (
      (adm->>'id')::uuid,
      adm->>'admission_number',
      COALESCE(adm->>'student_name', 'Student'),
      COALESCE(adm->>'phone', ''),
      COALESCE(adm->>'email', ''),
      COALESCE((adm->>'dob')::date, CURRENT_DATE),
      COALESCE(adm->>'gender', 'Other'),
      COALESCE(adm->>'address', ''),
      COALESCE(adm->>'city', ''),
      COALESCE(adm->>'education', ''),
      COALESCE((adm->>'experience_years')::numeric, 0),
      COALESCE(adm->>'current_employment_status', 'Student'),
      (adm->>'course_id')::uuid,
      COALESCE(adm->>'training_mode', 'Online'),
      COALESCE((adm->>'admission_date')::date, CURRENT_DATE),
      COALESCE((adm->>'course_fee')::numeric, 0),
      COALESCE((adm->>'discount')::numeric, 0),
      adm->>'discount_reason',
      COALESCE((adm->>'net_payable')::numeric, 0),
      COALESCE(adm->>'payment_plan', 'Full Payment'),
      NULLIF(adm->>'counsellor_id', '')::uuid,
      COALESCE(adm->>'status', 'Confirmed'),
      p_tenant,
      adm->>'student_unique_id',
      adm->>'our_bank_name',
      adm->>'our_bank_account_name',
      adm->>'our_bank_account_id',
      adm->>'our_upi_details',
      NULLIF(adm->>'lead_id', '')::uuid
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      course_fee = EXCLUDED.course_fee,
      discount = EXCLUDED.discount,
      net_payable = EXCLUDED.net_payable,
      updated_at = now()
    WHERE public.admissions.tenant_id = p_tenant;
  END LOOP;

  -- 3C. Upsert affected normalized students
  FOR stu IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'students', '[]'::jsonb)) LOOP
    INSERT INTO public.students(
      id, admission_id, student_code, admission_number, full_name, email, phone,
      course_id, total_fee, paid_amount, outstanding_amount, status, tenant_id, student_unique_id
    )
    VALUES (
      (stu->>'id')::uuid,
      NULLIF(stu->>'admission_id', '')::uuid,
      stu->>'student_code',
      stu->>'admission_number',
      COALESCE(stu->>'full_name', 'Student'),
      COALESCE(stu->>'email', ''),
      COALESCE(stu->>'phone', ''),
      NULLIF(stu->>'course_id', '')::uuid,
      COALESCE((stu->>'total_fee')::numeric, 0),
      COALESCE((stu->>'paid_amount')::numeric, 0),
      COALESCE((stu->>'outstanding_amount')::numeric, 0),
      COALESCE(stu->>'status', 'Active'),
      p_tenant,
      stu->>'student_unique_id'
    )
    ON CONFLICT (id) DO UPDATE SET
      total_fee = EXCLUDED.total_fee,
      paid_amount = EXCLUDED.paid_amount,
      outstanding_amount = EXCLUDED.outstanding_amount,
      status = EXCLUDED.status,
      updated_at = now()
    WHERE public.students.tenant_id = p_tenant;

    IF stu->>'onboarding_required' = 'true' AND stu->>'user_id' IS NOT NULL THEN
      SELECT value INTO case_record FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb))
        WHERE value->>'admission_id' = stu->>'admission_id' LIMIT 1;
      enabled := COALESCE((case_record->>'lms_account_created')::boolean, false)
        AND COALESCE(case_record->>'status', 'blocked') <> 'blocked'
        AND NOT EXISTS (
          SELECT 1 FROM unnest(ARRAY['admission_confirmation','student_details_verification','document_verification','course_confirmation','batch_allocation','fee_clearance_verification']) AS k
          WHERE COALESCE((case_record->'checklist'->k->>'completed')::boolean, false) = false
        );
      INSERT INTO public.student_lms_access(user_id, tenant_id, enabled)
        VALUES ((stu->>'user_id')::uuid, p_tenant, enabled)
        ON CONFLICT(user_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
          WHERE public.student_lms_access.tenant_id = p_tenant;
    END IF;
  END LOOP;

  -- 3D. Upsert affected normalized student_fee_accounts
  FOR fa IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'feeAccounts', '[]'::jsonb)) LOOP
    INSERT INTO public.student_fee_accounts(
      id, student_id, admission_id, original_fee, discount, net_payable,
      collected_amount, outstanding_balance, status, tenant_id
    )
    VALUES (
      (fa->>'id')::uuid,
      (fa->>'student_id')::uuid,
      (fa->>'admission_id')::uuid,
      COALESCE((fa->>'original_fee')::numeric, 0),
      COALESCE((fa->>'discount')::numeric, 0),
      COALESCE((fa->>'net_payable')::numeric, 0),
      COALESCE((fa->>'paid_amount')::numeric, 0),
      COALESCE((fa->>'outstanding_amount')::numeric, 0),
      CASE WHEN (fa->>'status') IN ('Paid', 'Partial', 'Pending', 'Overdue') THEN fa->>'status' ELSE 'Pending' END,
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      collected_amount = EXCLUDED.collected_amount,
      outstanding_balance = EXCLUDED.outstanding_balance,
      status = EXCLUDED.status,
      updated_at = now()
    WHERE public.student_fee_accounts.tenant_id = p_tenant;
  END LOOP;

  -- 3E. Upsert affected normalized installments
  FOR inst IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'installments', '[]'::jsonb)) LOOP
    v_inst_uuid := CASE
      WHEN (inst->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (inst->>'id')::uuid
      ELSE regexp_replace(md5('inst:' || p_tenant || ':' || (inst->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.installments(
      id, fee_account_id, installment_number, due_date, due_amount, paid_amount, status, paid_at, tenant_id
    )
    VALUES (
      v_inst_uuid,
      (inst->>'fee_account_id')::uuid,
      COALESCE((inst->>'installment_number')::integer, 1),
      COALESCE((inst->>'due_date')::date, CURRENT_DATE),
      COALESCE((inst->>'due_amount')::numeric, (inst->>'amount')::numeric, 0),
      COALESCE((inst->>'paid_amount')::numeric, 0),
      CASE WHEN (inst->>'status') IN ('Paid', 'Partial', 'Upcoming', 'Overdue') THEN inst->>'status' ELSE 'Upcoming' END,
      NULLIF(inst->>'paid_at', '')::timestamptz,
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      paid_amount = EXCLUDED.paid_amount,
      status = EXCLUDED.status,
      paid_at = COALESCE(EXCLUDED.paid_at, public.installments.paid_at)
    WHERE public.installments.tenant_id = p_tenant;
  END LOOP;

  -- 3F. Upsert affected normalized payments
  FOR pay IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'studentPayments', '[]'::jsonb)) LOOP
    IF COALESCE((pay->>'amount_paid')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;
    v_pay_uuid := CASE
      WHEN (pay->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (pay->>'id')::uuid
      ELSE regexp_replace(md5('pay:' || p_tenant || ':' || (pay->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.payments(
      id, external_payment_id, receipt_number, fee_account_id, student_id, amount,
      payment_mode, transaction_reference, payment_date, collected_by, remarks,
      our_bank_profile_id, our_bank_name, our_bank_account_name, our_bank_account_id,
      our_upi_details, status, verification_status, verified_by, verified_at,
      rejection_reason, tenant_id
    )
    VALUES (
      v_pay_uuid,
      pay->>'id',
      COALESCE(NULLIF(pay->>'receipt_number', ''), 'PENDING-' || (pay->>'id')),
      (SELECT sfa.id FROM public.student_fee_accounts sfa WHERE sfa.student_id = (pay->>'student_id')::uuid AND sfa.tenant_id = p_tenant LIMIT 1),
      (pay->>'student_id')::uuid,
      (pay->>'amount_paid')::numeric,
      COALESCE(pay->>'payment_mode', 'UPI'),
      COALESCE(pay->>'transaction_reference', pay->>'bank_upi_reference'),
      COALESCE((pay->>'payment_date')::date, CURRENT_DATE),
      COALESCE(NULLIF(pay->>'recorded_by', '')::uuid, NULLIF(pay->>'verified_by', '')::uuid),
      pay->>'notes',
      pay->>'our_bank_profile_id',
      pay->>'our_bank_name',
      pay->>'our_bank_account_name',
      pay->>'our_bank_account_id',
      pay->>'our_upi_details',
      COALESCE(pay->>'status', 'Pending Approval'),
      COALESCE(pay->>'verification_status', 'Pending Verification'),
      NULLIF(pay->>'verified_by', '')::uuid,
      NULLIF(pay->>'verified_at', '')::timestamptz,
      pay->>'rejection_reason',
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      verification_status = EXCLUDED.verification_status,
      receipt_number = EXCLUDED.receipt_number,
      verified_by = COALESCE(EXCLUDED.verified_by, public.payments.verified_by),
      verified_at = COALESCE(EXCLUDED.verified_at, public.payments.verified_at),
      rejection_reason = COALESCE(EXCLUDED.rejection_reason, public.payments.rejection_reason),
      our_bank_profile_id = COALESCE(EXCLUDED.our_bank_profile_id, public.payments.our_bank_profile_id),
      our_bank_name = COALESCE(EXCLUDED.our_bank_name, public.payments.our_bank_name),
      our_bank_account_name = COALESCE(EXCLUDED.our_bank_account_name, public.payments.our_bank_account_name),
      our_bank_account_id = COALESCE(EXCLUDED.our_bank_account_id, public.payments.our_bank_account_id)
    WHERE public.payments.tenant_id = p_tenant
      AND public.payments.verification_status NOT IN ('Verified', 'Rejected');
  END LOOP;

  -- 3G. Upsert affected normalized receipts (only for verified payments; immutable once issued)
  FOR rcpt IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'receipts', '[]'::jsonb)) LOOP
    -- Preserve existing historical receipts without altering or re-validating legacy issuer rows
    IF EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.receipt_number = rcpt->>'receipt_number'
    ) THEN
      CONTINUE;
    END IF;

    v_rcpt_uuid := CASE
      WHEN (rcpt->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'id')::uuid
      ELSE regexp_replace(md5('rcpt:' || p_tenant || ':' || (rcpt->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    v_pay_uuid := CASE
      WHEN (rcpt->>'payment_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'payment_id')::uuid
      ELSE regexp_replace(md5('pay:' || p_tenant || ':' || regexp_replace(rcpt->>'payment_id', '^pay-', '')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    v_issued_by := CASE
      WHEN (rcpt->>'issued_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'issued_by')::uuid
      WHEN (rcpt->>'authorized_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (rcpt->>'authorized_by')::uuid
      ELSE NULL
    END;

    IF v_issued_by IS NULL THEN
      RAISE EXCEPTION 'Receipt issuer identity is required and must be a valid UUID' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_issued_by
        AND p.tenant_id = p_tenant
        AND p.is_active = true
        AND p.role IN ('accountant', 'admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Unauthorized or inactive receipt issuer for tenant' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.receipts(
      id, receipt_number, payment_id, student_id, student_name, student_code,
      course_name, amount, amount_in_words, payment_mode, transaction_reference,
      receipt_date, issued_by, tenant_id
    )
    VALUES (
      v_rcpt_uuid,
      rcpt->>'receipt_number',
      v_pay_uuid,
      (rcpt->>'student_id')::uuid,
      COALESCE(rcpt->>'student_name', 'Student'),
      COALESCE(rcpt->>'student_code', ''),
      COALESCE(rcpt->>'course_name', 'Course'),
      COALESCE((rcpt->>'payment_amount')::numeric, (rcpt->>'amount')::numeric, 0),
      COALESCE(rcpt->>'amount_in_words', ''),
      COALESCE(rcpt->>'payment_mode', 'UPI'),
      rcpt->>'transaction_reference',
      COALESCE((rcpt->>'payment_date')::date, CURRENT_DATE),
      v_issued_by,
      p_tenant
    )
    ON CONFLICT (receipt_number) DO NOTHING;
  END LOOP;

  -- 3H. Upsert affected normalized onboarding_cases
  FOR oc IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'onboardingCases', '[]'::jsonb)) LOOP
    v_oc_uuid := CASE
      WHEN (oc->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (oc->>'id')::uuid
      WHEN (oc->>'id') ~* '^onb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN regexp_replace(oc->>'id', '^onb-', '')::uuid
      ELSE regexp_replace(md5('onb:' || p_tenant || ':' || (oc->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.onboarding_cases(
      id, case_number, admission_id, admission_number, student_id, student_name,
      student_email, student_phone, course_id, course_name, status, checklist, documents, tenant_id
    )
    VALUES (
      v_oc_uuid,
      COALESCE(oc->>'case_number', 'ONB-' || (oc->>'admission_number')),
      (oc->>'admission_id')::uuid,
      oc->>'admission_number',
      (oc->>'student_id')::uuid,
      COALESCE(oc->>'student_name', 'Student'),
      COALESCE(oc->>'student_email', ''),
      COALESCE(oc->>'student_phone', ''),
      NULLIF(oc->>'course_id', '')::uuid,
      COALESCE(oc->>'course_name', 'Course'),
      CASE
        WHEN lower(replace(COALESCE(oc->>'status', ''), ' ', '_')) IN ('pending', 'in_progress', 'blocked', 'completed')
          THEN lower(replace(oc->>'status', ' ', '_'))
        ELSE 'in_progress'
      END,
      COALESCE(oc->'checklist', '{}'::jsonb),
      COALESCE(oc->'documents', '[]'::jsonb),
      p_tenant
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      checklist = EXCLUDED.checklist,
      updated_at = now()
    WHERE public.onboarding_cases.tenant_id = p_tenant;
  END LOOP;

  -- 3I. Persist audit_logs for financial workflow mutations
  FOR aud IN SELECT value FROM jsonb_array_elements(COALESCE(p_snapshot->'auditLogs', '[]'::jsonb)) LOOP
    v_aud_uuid := CASE
      WHEN (aud->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (aud->>'id')::uuid
      ELSE regexp_replace(md5('aud:' || p_tenant || ':' || (aud->>'id')), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')::uuid
    END;
    INSERT INTO public.audit_logs(id, user_id, user_email, module, action, record_id, payload)
    VALUES (
      v_aud_uuid,
      NULLIF(aud->>'user_id', '')::uuid,
      COALESCE(aud->>'user_name', 'system@next-generpsolutions.com'),
      COALESCE(aud->>'module', 'FINANCE'),
      COALESCE(aud->>'action', 'WORKFLOW_EVENT'),
      aud->>'record_id',
      COALESCE(aud->'new_value', '{}'::jsonb)
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  RETURN new_revision;
END $function$;

REVOKE ALL ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fee_workflow(text, bigint, jsonb) TO service_role;
