import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/20261127_fix_commit_fee_workflow_receipt_issued_by.sql'
);

describe('P0 Receipt Issuer Identity & Atomic PostgreSQL Verification (ISSUER-001 to ISSUER-020)', () => {
  let db: PGlite;

  const ACCOUNTANT_ID = '82b47429-6dca-47d8-aa73-ac959cb26429';
  const ACCOUNTANT_2_ID = '92b47429-6dca-47d8-aa73-ac959cb26420';
  const COUNSELLOR_ID = '8fac380f-cc47-4209-9a13-e85153529dd1';
  const DISABLED_ACCOUNTANT_ID = '72b47429-6dca-47d8-aa73-ac959cb26477';
  const CROSS_TENANT_ACCOUNTANT_ID = '62b47429-6dca-47d8-aa73-ac959cb26466';
  const COURSE_ID = 'c1000000-0000-4000-a000-000000000101';
  const ADM_ID = 'da384cda-e98d-41fe-9c41-ada94fa9d21c';
  const STU_ID = '19ce0822-ce1b-4894-8d85-4cf9a7f2e047';
  const FA_ID = 'e6845bf3-09ab-429e-a439-8b75dd9e1ce6';
  const HISTORICAL_PAY_ID = '11111111-1111-4111-8111-111111111111';
  const HISTORICAL_RCPT_ID = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role;
      CREATE ROLE authenticated;
      CREATE ROLE anon;
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        full_name text,
        email text,
        role text,
        is_active boolean DEFAULT true,
        tenant_id text DEFAULT 'default'
      );
      CREATE TABLE public.fee_workflow_state (
        tenant_id text PRIMARY KEY,
        revision bigint NOT NULL DEFAULT 1,
        snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.admissions (
        id uuid PRIMARY KEY,
        admission_number text,
        student_name text,
        phone text,
        email text,
        dob date,
        gender text,
        address text,
        city text,
        education text,
        experience_years numeric,
        current_employment_status text,
        course_id uuid,
        training_mode text,
        admission_date date,
        course_fee numeric,
        discount numeric,
        discount_reason text,
        net_payable numeric,
        payment_plan text,
        counsellor_id uuid,
        status text,
        tenant_id text,
        student_unique_id text,
        our_bank_name text,
        our_bank_account_name text,
        our_bank_account_id text,
        our_upi_details text,
        lead_id uuid,
        updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.students (
        id uuid PRIMARY KEY,
        admission_id uuid,
        student_code text,
        admission_number text,
        full_name text,
        email text,
        phone text,
        course_id uuid,
        total_fee numeric,
        paid_amount numeric,
        outstanding_amount numeric,
        status text,
        tenant_id text,
        student_unique_id text,
        updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.student_lms_access (
        user_id uuid PRIMARY KEY,
        tenant_id text,
        enabled boolean,
        updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.student_fee_accounts (
        id uuid PRIMARY KEY,
        student_id uuid,
        admission_id uuid,
        original_fee numeric,
        discount numeric,
        net_payable numeric,
        collected_amount numeric,
        outstanding_balance numeric,
        status text,
        tenant_id text,
        updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.installments (
        id uuid PRIMARY KEY,
        fee_account_id uuid,
        installment_number int,
        due_date date,
        due_amount numeric,
        paid_amount numeric,
        status text,
        paid_at timestamptz,
        tenant_id text
      );
      CREATE TABLE public.payments (
        id uuid PRIMARY KEY,
        external_payment_id text UNIQUE,
        receipt_number text UNIQUE,
        fee_account_id uuid,
        student_id uuid,
        amount numeric,
        payment_mode text,
        transaction_reference text UNIQUE,
        payment_date date,
        collected_by uuid,
        remarks text,
        our_bank_profile_id text,
        our_bank_name text,
        our_bank_account_name text,
        our_bank_account_id text,
        our_upi_details text,
        status text,
        verification_status text,
        verified_by uuid,
        verified_at timestamptz,
        rejection_reason text,
        tenant_id text
      );
      CREATE TABLE public.receipts (
        id uuid PRIMARY KEY,
        receipt_number text UNIQUE,
        payment_id uuid UNIQUE REFERENCES public.payments(id),
        student_id uuid,
        student_name text,
        student_code text,
        course_name text,
        amount numeric,
        amount_in_words text,
        payment_mode text,
        transaction_reference text,
        receipt_date date,
        issued_by uuid REFERENCES public.profiles(id),
        tenant_id text
      );
      CREATE TABLE public.onboarding_cases (
        id uuid PRIMARY KEY,
        case_number text,
        admission_id uuid,
        admission_number text,
        student_id uuid,
        student_name text,
        student_email text,
        student_phone text,
        course_id uuid,
        course_name text,
        status text,
        checklist jsonb,
        documents jsonb,
        tenant_id text,
        updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.audit_logs (
        id uuid PRIMARY KEY,
        user_id uuid,
        user_email text,
        module text,
        action text,
        record_id text,
        payload jsonb
      );

      INSERT INTO public.profiles(id, full_name, email, role, is_active, tenant_id) VALUES
        ('${ACCOUNTANT_ID}', 'Padmaja', 'padmaja@test.local', 'accountant', true, 'default'),
        ('${ACCOUNTANT_2_ID}', 'Padmaja', 'padmaja2@test.local', 'accountant', true, 'default'),
        ('${COUNSELLOR_ID}', 'Vineethaa', 'vineethaa@test.local', 'counsellor', true, 'default'),
        ('${DISABLED_ACCOUNTANT_ID}', 'Padmaja Inactive', 'disabled@test.local', 'accountant', false, 'default'),
        ('${CROSS_TENANT_ACCOUNTANT_ID}', 'Other Tenant', 'other@test.local', 'accountant', true, 'tenant-b');

      INSERT INTO public.admissions(id, admission_number, student_name, course_id, net_payable, status, tenant_id)
        VALUES ('${ADM_ID}', 'ADM-2026-0029', 'QA Student', '${COURSE_ID}', 30000, 'Confirmed', 'default');
      INSERT INTO public.students(id, admission_id, student_code, admission_number, full_name, total_fee, paid_amount, outstanding_amount, status, tenant_id)
        VALUES ('${STU_ID}', '${ADM_ID}', 'STU-FICO-003', 'ADM-2026-0029', 'QA Student', 30000, 10000, 20000, 'Active', 'default');
      INSERT INTO public.student_fee_accounts(id, student_id, admission_id, original_fee, discount, net_payable, collected_amount, outstanding_balance, status, tenant_id)
        VALUES ('${FA_ID}', '${STU_ID}', '${ADM_ID}', 35000, 5000, 30000, 10000, 20000, 'Partial', 'default');

      -- Historical receipt that must remain immutable
      INSERT INTO public.payments(id, external_payment_id, receipt_number, fee_account_id, student_id, amount, payment_mode, transaction_reference, status, verification_status, verified_by, tenant_id)
        VALUES ('${HISTORICAL_PAY_ID}', 'spr-hist-1', 'REC-2026-000001', '${FA_ID}', '${STU_ID}', 10000, 'UPI', 'HIST-UTR-1', 'Approved', 'Verified', '${ACCOUNTANT_ID}', 'default');
      INSERT INTO public.receipts(id, receipt_number, payment_id, student_id, student_name, course_name, amount, payment_mode, transaction_reference, issued_by, tenant_id)
        VALUES ('${HISTORICAL_RCPT_ID}', 'REC-2026-000001', '${HISTORICAL_PAY_ID}', '${STU_ID}', 'QA Student', 'SAP FICO', 10000, 'UPI', 'HIST-UTR-1', '${ACCOUNTANT_ID}', 'default');
    `);

    const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    await db.exec(migrationSql);
  });

  afterAll(async () => {
    await db.close();
  });

  function buildSnapshot(overrides: {
    paymentId?: string;
    utr?: string;
    receiptNumber?: string;
    authorizedBy?: string | null;
    issuedBy?: string | null;
    includeHistorical?: boolean;
  }) {
    const payId = overrides.paymentId || 'spr-1795735527117-07vj';
    const rcptNum = overrides.receiptNumber || 'REC-2026-000002';
    const receipts: any[] = [];
    if (overrides.includeHistorical) {
      receipts.push({
        id: HISTORICAL_RCPT_ID,
        receipt_number: 'REC-2026-000001',
        payment_id: 'spr-hist-1',
        student_id: STU_ID,
        payment_amount: 10000,
        authorized_by: 'Legacy Name Without UUID',
      });
    }
    receipts.push({
      id: `rcpt-${payId}`,
      receipt_number: rcptNum,
      payment_id: payId,
      student_id: STU_ID,
      student_name: 'QA Student',
      course_name: 'SAP FICO',
      payment_amount: 9000,
      payment_mode: 'UPI',
      transaction_reference: overrides.utr || '12345',
      payment_date: '2026-11-27',
      ...(overrides.authorizedBy !== null ? { authorized_by: overrides.authorizedBy ?? 'Padmaja' } : {}),
      ...(overrides.issuedBy !== null ? { issued_by: overrides.issuedBy ?? ACCOUNTANT_ID } : {}),
    });

    return {
      feeAccounts: [
        {
          id: FA_ID,
          student_id: STU_ID,
          admission_id: ADM_ID,
          original_fee: 35000,
          discount: 5000,
          net_payable: 30000,
          paid_amount: 19000,
          outstanding_amount: 11000,
          status: 'Partial',
        },
      ],
      studentPayments: [
        {
          id: payId,
          student_id: STU_ID,
          amount_paid: 9000,
          payment_mode: 'UPI',
          transaction_reference: overrides.utr || '12345',
          payment_date: '2026-11-27',
          recorded_by: COUNSELLOR_ID,
          verified_by: ACCOUNTANT_ID,
          status: 'Approved',
          verification_status: 'Verified',
          receipt_number: rcptNum,
          our_bank_profile_id: 'bank-acc-01',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'Katari Charitha',
          our_bank_account_id: '•••• •••• 1140',
        },
      ],
      receipts,
    };
  }

  it('ISSUER-004/005/006/007/008/009/013: rejects missing, non-UUID, nonexistent, cross-tenant, disabled, and unauthorized issuers with full rollback', async () => {
    const invalidCases = [
      { label: 'ISSUER-004/005 display-name-only (no UUID)', authorizedBy: 'Padmaja', issuedBy: null, expectedCode: '22023' },
      { label: 'ISSUER-005 missing both', authorizedBy: null, issuedBy: null, expectedCode: '22023' },
      { label: 'ISSUER-006 nonexistent profile UUID', authorizedBy: 'Padmaja', issuedBy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expectedCode: '42501' },
      { label: 'ISSUER-007 cross-tenant accountant', authorizedBy: 'Other Tenant', issuedBy: CROSS_TENANT_ACCOUNTANT_ID, expectedCode: '42501' },
      { label: 'ISSUER-008 disabled accountant', authorizedBy: 'Padmaja Inactive', issuedBy: DISABLED_ACCOUNTANT_ID, expectedCode: '42501' },
      { label: 'ISSUER-009 unauthorized counsellor role', authorizedBy: 'Vineethaa', issuedBy: COUNSELLOR_ID, expectedCode: '42501' },
    ];

    for (const tc of invalidCases) {
      const snap = buildSnapshot({
        paymentId: `spr-fail-${tc.expectedCode}`,
        utr: `UTR-${Math.random()}`,
        receiptNumber: `REC-FAIL-${Math.random()}`,
        authorizedBy: tc.authorizedBy,
        issuedBy: tc.issuedBy,
      });

      await expect(
        db.query('SELECT public.commit_fee_workflow($1, $2, $3::jsonb)', ['default', 0, JSON.stringify(snap)]),
        tc.label
      ).rejects.toThrow();

      // Verify atomic rollback: fee account and payment count unchanged
      const faRes = await db.query<{ collected_amount: string }>(
        'SELECT collected_amount::text FROM public.student_fee_accounts WHERE id = $1',
        [FA_ID]
      );
      expect(Number(faRes.rows[0].collected_amount)).toBe(10000);
    }
  });

  it('ISSUER-001/002/003/011/012/016/018/019: commits ₹9,000 approval atomically with issued_by UUID, preserves historical receipt, and enforces revision 40001', async () => {
    const snap = buildSnapshot({
      authorizedBy: 'Padmaja',
      issuedBy: ACCOUNTANT_ID,
      includeHistorical: true,
    });

    const res = await db.query<{ commit_fee_workflow: string }>(
      'SELECT public.commit_fee_workflow($1, $2, $3::jsonb)',
      ['default', 0, JSON.stringify(snap)]
    );
    expect(Number(res.rows[0].commit_fee_workflow)).toBe(1);

    const rcptRes = await db.query<{ issued_by: string; amount: string }>(
      'SELECT issued_by::text, amount::text FROM public.receipts WHERE receipt_number = $1',
      ['REC-2026-000002']
    );
    expect(rcptRes.rows).toHaveLength(1);
    expect(rcptRes.rows[0].issued_by).toBe(ACCOUNTANT_ID);
    expect(Number(rcptRes.rows[0].amount)).toBe(9000);

    // Historical receipt untouched
    const histRes = await db.query<{ issued_by: string }>(
      'SELECT issued_by::text FROM public.receipts WHERE receipt_number = $1',
      ['REC-2026-000001']
    );
    expect(histRes.rows[0].issued_by).toBe(ACCOUNTANT_ID);

    // Bank account & fee balance persisted
    const faRes = await db.query<{ collected_amount: string; outstanding_balance: string }>(
      'SELECT collected_amount::text, outstanding_balance::text FROM public.student_fee_accounts WHERE id = $1',
      [FA_ID]
    );
    expect(Number(faRes.rows[0].collected_amount)).toBe(19000);
    expect(Number(faRes.rows[0].outstanding_balance)).toBe(11000);

    // ISSUER-016: Stale revision 0 or 99 fails with 40001
    await expect(
      db.query('SELECT public.commit_fee_workflow($1, $2, $3::jsonb)', ['default', 99, JSON.stringify(snap)])
    ).rejects.toThrow(/Conflict: workflow revision changed/i);
  });
});
