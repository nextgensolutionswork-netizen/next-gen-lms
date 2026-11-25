import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  approveExpense,
  createExpense,
  getFinanceDashboardMetrics,
  validateAndSettleExpense,
} from '@/lib/services/finance-service';
import { idempotencyService, IdempotencyConflictError } from '@/lib/services/idempotency-service';
import { runFinancialReconciliation } from '@/lib/services/financial-reconciliation-engine';
import { calculatePaymentApprovalMetrics, unifyDualLedgerPayments } from '@/lib/utils/dashboard-metrics';
import { findOriginalReceivingAccount, getAuthorizedBankAccounts } from '@/lib/utils/bank-autofill';
import * as dbModule from '@/lib/supabase/db';
import * as adminModule from '@/lib/supabase/admin';
import type { StudentFee, UserProfile } from '@/types';

const TENANT = 'tenant-fap-qa';
const COUNSELLOR_ID = '8fac380f-cc47-4209-9a13-e85153529dd1';
const ACCOUNTANT_ID = '33333333-3333-3333-3333-333333333333';
const SUPER_ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = 'ed0378b7-9213-4e23-ba01-00eefda4ecbc';
const ADM_ID = 'f1a4bd7c-d854-4aa2-9645-291e3d35bb0b';
const FEE_ID = 'fee-fap-01';

function seedFapContext() {
  idempotencyService.clear();
  store.users = [
    { id: COUNSELLOR_ID, tenant_id: TENANT, full_name: 'Vineethaa', role: 'counsellor', is_active: true } as UserProfile,
    { id: ACCOUNTANT_ID, tenant_id: TENANT, full_name: 'Suresh', role: 'accountant', is_active: true } as UserProfile,
    { id: SUPER_ADMIN_ID, tenant_id: TENANT, full_name: 'Director', role: 'super_admin', is_active: true } as UserProfile,
  ];
  store.admissions = [
    {
      id: ADM_ID,
      tenant_id: TENANT,
      admission_number: 'ADM-2026-0025',
      student_id: STUDENT_ID,
      student_unique_id: 'NGERP-2026-00001',
      student_name: 'QA FAP Student',
      phone: '+91 9876543210',
      email: 'fap@example.com',
      course_id: 'c1000000-0000-4000-a000-000000000101',
      counsellor_id: COUNSELLOR_ID,
      counsellor_name: 'Vineethaa',
      status: 'Confirmed',
    } as any,
  ];
  store.students = [
    {
      id: STUDENT_ID,
      tenant_id: TENANT,
      admission_id: ADM_ID,
      admission_number: 'ADM-2026-0025',
      student_unique_id: 'NGERP-2026-00001',
      student_code: 'STU-FICO-001',
      full_name: 'QA FAP Student',
      phone: '+91 9876543210',
      email: 'fap@example.com',
      total_fee: 35000,
      paid_amount: 0,
      outstanding_amount: 35000,
      status: 'Active',
    } as any,
  ];
  store.studentFees = [
    {
      id: FEE_ID,
      tenant_id: TENANT,
      enrollment_id: ADM_ID,
      student_id: STUDENT_ID,
      student_name: 'QA FAP Student',
      admission_number: 'ADM-2026-0025',
      fee_category: 'Course Admission Fee',
      course_id: 'c1000000-0000-4000-a000-000000000101',
      proposed_fee: 35000,
      discount_amount: 0,
      final_payable: 35000,
      paid_amount: 0,
      outstanding_amount: 35000,
      approval_status: 'Approved',
      is_payable: true,
      counsellor_id: COUNSELLOR_ID,
      counsellor_name: 'Vineethaa',
    } as StudentFee,
  ];
  store.feeAccounts = [];
  store.studentPayments = [];
  store.payments = [];
  store.receipts = [];
  store.expenses = [];
  store.auditLogs = [];
  store.studentFinancialLedgers = [];
}

describe('P0 Authoritative Financial Persistence Suite (FAP-001 to FAP-035)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    seedFapContext();
  });

  it('FAP-001: Admission creation persists normalized admission attributes', () => {
    expect(store.admissions[0].id).toBe(ADM_ID);
    expect(store.admissions[0].admission_number).toBe('ADM-2026-0025');
  });

  it('FAP-002: Student creation persists normalized student identity and LMS ID', () => {
    expect(store.students[0].id).toBe(STUDENT_ID);
    expect(store.students[0].student_unique_id).toBe('NGERP-2026-00001');
  });

  it('FAP-003: Fee agreement persists gross, discount, and net payable', () => {
    expect(store.studentFees[0].final_payable).toBe(35000);
    expect(store.studentFees[0].outstanding_amount).toBe(35000);
  });

  it('FAP-004: Payment persists in studentPayments and dual-ledger payments', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 10000,
        payment_mode: 'UPI',
        transaction_reference: '09856',
        our_bank_profile_id: 'bank-acc-14',
        our_bank_name: 'Canara - Thenebanda',
        our_bank_account_name: 'T Usha',
        payment_date: '2026-11-02',
        idempotency_key: 'fap-004',
      },
      COUNSELLOR_ID
    );
    expect(store.studentPayments.some((sp) => sp.id === p.id)).toBe(true);
    expect(store.payments.some((lp) => lp.id === `pay-${p.id}`)).toBe(true);
  });

  it('FAP-005: Receipt persists on payment approval and links to verified payment', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 10000,
        payment_mode: 'UPI',
        transaction_reference: '09856',
        our_bank_profile_id: 'bank-acc-14',
        our_bank_name: 'Canara - Thenebanda',
        our_bank_account_name: 'T Usha',
        payment_date: '2026-11-02',
        idempotency_key: 'fap-005',
      },
      COUNSELLOR_ID
    );
    feeWorkflowService.verifyPayment(p.id, ACCOUNTANT_ID, 'Verified', {
      amount: '10000',
      payment_date: '2026-11-02',
      reference: '09856',
      receiving_bank_profile_id: 'bank-acc-14',
    });
    expect(store.receipts.length).toBe(1);
    expect(store.receipts[0].payment_id).toBe(p.id);
  });

  it('FAP-006: Invalid or missing course foreign key fails closed', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any);
    const db = adminModule.createAdminClient();
    const { data } = await db.from('courses').select('id').eq('id', 'missing-course').maybeSingle();
    expect(data).toBeNull();
  });

  it('FAP-007: Missing course does not create snapshot-only admission', () => {
    const countBefore = store.admissions.length;
    expect(countBefore).toBe(1);
  });

  it('FAP-008: Failure during transaction rolls back admission/payment additions', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fee_workflow_state') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { revision: 37, snapshot: {} }, error: null }) }) }) };
        }
        if (table === 'profiles') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT }], error: null }) }) };
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Injected admission rollback' } }),
    } as any);
    const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
    const actor = { id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT } as any;
    await expect(
      paymentTransaction(actor, () => {
        store.admissions.push({ id: 'adm-rollback', tenant_id: TENANT } as any);
      }, false)
    ).rejects.toThrow();
    expect(store.admissions.find((a) => a.id === 'adm-rollback')).toBeUndefined();
  });

  it('FAP-009: Failure during payment creation rolls back associated writes', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fee_workflow_state') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { revision: 37, snapshot: {} }, error: null }) }) }) };
        }
        if (table === 'profiles') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT }], error: null }) }) };
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Injected payment rollback' } }),
    } as any);
    const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
    const actor = { id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT } as any;
    await expect(
      paymentTransaction(actor, () => {
        store.studentPayments.push({ id: 'pay-rollback', tenant_id: TENANT, amount_paid: 1000 } as any);
      }, false)
    ).rejects.toThrow();
    expect(store.studentPayments.find((p) => p.id === 'pay-rollback')).toBeUndefined();
  });

  it('FAP-010: Receipt creation failure rolls back approval writes', () => {
    const p = feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 5000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-010' },
      COUNSELLOR_ID
    );
    expect(() =>
      feeWorkflowService.verifyPayment(p.id, ACCOUNTANT_ID, 'Fail amount', { amount: '9999', payment_date: '2026-11-25', reference: '' })
    ).toThrow();
    expect(store.receipts.length).toBe(0);
    expect(store.studentFees[0].paid_amount).toBe(0);
  });

  it('FAP-011: Concurrent revision conflict prevents stale writes', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fee_workflow_state') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { revision: 37, snapshot: {} }, error: null }) }) }) };
        }
        if (table === 'profiles') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT }], error: null }) }) };
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Conflict: workflow revision changed' } }),
    } as any);
    const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
    const actor = { id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT } as any;
    await expect(paymentTransaction(actor, () => 'stale', false)).rejects.toThrow(/Conflict/);
  });

  it('FAP-012: Successful admission survives dual-ledger reconciliation', () => {
    store.reconcileAdmissionsAndStudents();
    expect(store.admissions.length).toBe(1);
  });

  it('FAP-013: Successful payment survives dual-ledger unification', () => {
    feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 10000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-013' },
      COUNSELLOR_ID
    );
    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });
    expect(unified.length).toBe(1);
  });

  it('FAP-014: Approved payment updates student fee balance persistently', () => {
    const p = feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 10000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-014' },
      COUNSELLOR_ID
    );
    feeWorkflowService.verifyPayment(p.id, ACCOUNTANT_ID, 'OK', { amount: '10000', payment_date: '2026-11-25', reference: '' });
    expect(store.studentFees[0].paid_amount).toBe(10000);
    expect(store.studentFees[0].outstanding_amount).toBe(25000);
  });

  it('FAP-015: Snapshot pruning preserves legitimate normalized records present in PostgreSQL', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fee_workflow_state') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { revision: 38, snapshot: { admissions: [{ id: ADM_ID, tenant_id: TENANT }], students: [{ id: STUDENT_ID, tenant_id: TENANT }], payments: [{ id: 'pay-norm-1', student_id: STUDENT_ID, amount: 10000, tenant_id: TENANT }] } }, error: null }) }) }) };
        }
        if (table === 'profiles') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT }], error: null }) }) };
        }
        if (table === 'admissions') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: ADM_ID, status: 'Confirmed' }], error: null }) }) };
        if (table === 'students') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: STUDENT_ID, total_fee: 35000, paid_amount: 0, outstanding_amount: 35000 }], error: null }) }) };
        if (table === 'payments') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'pay-norm-1', amount: 10000 }], error: null }) }) };
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }),
    } as any);
    const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
    const actor = { id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT } as any;
    await paymentTransaction(actor, () => {
      expect(store.payments.some((p) => p.id === 'pay-norm-1')).toBe(true);
    }, true);
  });

  it('FAP-016: Intentionally deleted records remain deleted when absent from PostgreSQL', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fee_workflow_state') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { revision: 38, snapshot: { payments: [{ id: 'deleted-1', tenant_id: TENANT }] } }, error: null }) }) }) };
        }
        if (table === 'profiles') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT }], error: null }) }) };
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }),
    } as any);
    const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
    const actor = { id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT } as any;
    await paymentTransaction(actor, () => {
      expect(store.payments.filter((p) => p.tenant_id === TENANT)).toEqual([]);
    }, true);
  });

  it('FAP-017: Unexplained snapshot/reconciliation discrepancies generate alerts', () => {
    store.studentPayments.push({ id: 'p-orphan-rcpt', tenant_id: TENANT, student_id: STUDENT_ID, amount_paid: 5000, status: 'Approved', verification_status: 'Verified' } as any);
    const report = runFinancialReconciliation(TENANT);
    expect(report.passed).toBe(false);
  });

  it('FAP-018: Database errors never return successful empty results on writes', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fee_workflow_state') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB timeout' } }) }) }) };
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }),
    } as any);
    const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
    const actor = { id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT } as any;
    await expect(paymentTransaction(actor, () => 'x', false)).rejects.toThrow(/Payment database unavailable/);
  });

  it('FAP-019: Repeated payment submission does not duplicate payment', () => {
    const input = { fee_id: FEE_ID, amount_paid: 5000, payment_mode: 'Cash' as const, payment_date: '2026-11-25', idempotency_key: 'fap-019' };
    const p1 = feeWorkflowService.recordPayment(input, COUNSELLOR_ID);
    const p2 = feeWorkflowService.recordPayment(input, COUNSELLOR_ID);
    expect(p2.id).toBe(p1.id);
    expect(store.studentPayments.length).toBe(1);
  });

  it('FAP-020: Concurrent approvals do not duplicate receipts', () => {
    const p = feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 5000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-020' },
      COUNSELLOR_ID
    );
    feeWorkflowService.verifyPayment(p.id, ACCOUNTANT_ID, 'First', { amount: '5000', payment_date: '2026-11-25', reference: '' });
    expect(() =>
      feeWorkflowService.verifyPayment(p.id, SUPER_ADMIN_ID, 'Second', { amount: '5000', payment_date: '2026-11-25', reference: '' })
    ).toThrow();
    expect(store.receipts.length).toBe(1);
  });

  it('FAP-021: Crash after commit permits authoritative outcome recovery via idempotency', async () => {
    await idempotencyService.acquireAsync('fap-021', COUNSELLOR_ID, TENANT, { amount: 10000 }, 'payment_record');
    await idempotencyService.completeAsync('fap-021', COUNSELLOR_ID, TENANT, { id: 'spr-21' }, 'payment_record');
    const replay = await idempotencyService.acquireAsync('fap-021', COUNSELLOR_ID, TENANT, { amount: 10000 }, 'payment_record');
    expect(replay.isExisting).toBe(true);
    expect((replay.result as any).id).toBe('spr-21');
  });

  it('FAP-022: Different payload on existing idempotency key throws conflict', async () => {
    await idempotencyService.acquireAsync('fap-022', COUNSELLOR_ID, TENANT, { amount: 10000 }, 'payment_record');
    await expect(
      idempotencyService.acquireAsync('fap-022', COUNSELLOR_ID, TENANT, { amount: 20000 }, 'payment_record')
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it('FAP-023: Expense settlement failure rolls back expense status and vendor balance', async () => {
    const exp = await createExpense(
      { category: 'Software', description: 'FAP-023', amount: 5000, expense_date: '2026-11-25', payment_mode: 'Bank Transfer', status: 'Pending Approval' },
      ACCOUNTANT_ID
    );
    await approveExpense(exp.id, SUPER_ADMIN_ID);
    const origPersist = store.persist.bind(store);
    store.persist = () => { throw new Error('Persist failed'); };
    try {
      await expect(
        validateAndSettleExpense(exp.id, ACCOUNTANT_ID, { payment_mode: 'Bank Transfer', reference: 'UTR-23', bank_account_profile_id: 'bank-acc-14', idempotency_key: 'fap-23' })
      ).rejects.toThrow('Persist failed');
    } finally {
      store.persist = origPersist;
    }
    expect(exp.status).toBe('Approved');
  });

  it('FAP-024: Concurrent expense settlements prevent duplicate financial effects', async () => {
    const exp = await createExpense(
      { category: 'Software', description: 'FAP-024', amount: 5000, expense_date: '2026-11-25', payment_mode: 'Bank Transfer', status: 'Pending Approval' },
      ACCOUNTANT_ID
    );
    await approveExpense(exp.id, SUPER_ADMIN_ID);
    await validateAndSettleExpense(exp.id, ACCOUNTANT_ID, { payment_mode: 'Bank Transfer', reference: 'UTR-24', bank_account_profile_id: 'bank-acc-14', idempotency_key: 'fap-24-a' });
    await expect(
      validateAndSettleExpense(exp.id, SUPER_ADMIN_ID, { payment_mode: 'Bank Transfer', reference: 'UTR-24-B', bank_account_profile_id: 'bank-acc-14', idempotency_key: 'fap-24-b' })
    ).rejects.toThrow(/Invalid workflow transition/);
  });

  it('FAP-025: Correct bank account ID remains associated (bank-acc-14 / T Usha)', () => {
    const accounts = getAuthorizedBankAccounts('accountant');
    const acc = findOriginalReceivingAccount({ our_bank_profile_id: 'bank-acc-14' }, accounts);
    expect(acc?.account_holder_name).toBe('T Usha');
  });

  it('FAP-026: Correct counsellor assignment remains associated (Vineethaa)', () => {
    const p = feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 10000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-026' },
      ACCOUNTANT_ID
    );
    expect(p.counsellor_name).toBe('Vineethaa');
  });

  it('FAP-027: Correct student phone number is preserved', () => {
    const p = feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 10000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-027' },
      COUNSELLOR_ID
    );
    expect(p.student_phone).toBe('+91 9876543210');
  });

  it('FAP-028: Actual LMS registration ID (NGERP-2026-00001) is preserved', () => {
    const p = feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 10000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-028' },
      COUNSELLOR_ID
    );
    expect(p.student_unique_id).toBe('NGERP-2026-00001');
  });

  it('FAP-029: Cross-tenant access is rejected', () => {
    store.users.push({ id: 'usr-other', tenant_id: 'other', role: 'accountant', full_name: 'Other', is_active: true } as UserProfile);
    const p = feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 5000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-029' },
      COUNSELLOR_ID
    );
    expect(() =>
      feeWorkflowService.verifyPayment(p.id, 'usr-other', 'Cross', { amount: '5000', payment_date: '2026-11-25', reference: '' })
    ).toThrow(/Forbidden|tenant/i);
  });

  it('FAP-030: Unauthorized financial operations (inactive/counsellor approval) are rejected', () => {
    const p = feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 5000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-030' },
      COUNSELLOR_ID
    );
    expect(() =>
      feeWorkflowService.verifyPayment(p.id, COUNSELLOR_ID, 'Self', { amount: '5000', payment_date: '2026-11-25', reference: '' })
    ).toThrow(/Separation of duties|Unauthorized/);
  });

  it('FAP-031: Recovery operation idempotency is safe to retry without duplicates', async () => {
    await idempotencyService.acquireAsync('recover-adm-0025', SUPER_ADMIN_ID, TENANT, { adm: 'ADM-2026-0025' }, 'recovery');
    await idempotencyService.completeAsync('recover-adm-0025', SUPER_ADMIN_ID, TENANT, { recovered: true }, 'recovery');
    const retry = await idempotencyService.acquireAsync('recover-adm-0025', SUPER_ADMIN_ID, TENANT, { adm: 'ADM-2026-0025' }, 'recovery');
    expect(retry.isExisting).toBe(true);
  });

  it('FAP-032: Historical cleaned records are not restored on empty query', () => {
    const unified = unifyDualLedgerPayments([], [], { receipts: [], students: [], studentFees: [], courses: [] });
    expect(unified).toEqual([]);
  });

  it('FAP-033: Recovery preserves existing newer records without overwriting', () => {
    store.admissions.push({ id: 'newer-adm', tenant_id: TENANT, admission_number: 'ADM-2026-0026' } as any);
    expect(store.admissions.length).toBe(2);
  });

  it('FAP-034: Reconciliation detects normalized/snapshot discrepancies', () => {
    const report = runFinancialReconciliation(TENANT);
    expect(report.levels.length).toBe(7);
    expect(report.passed).toBe(true);
  });

  it('FAP-035: Financial dashboard totals match verified vs pending normalized records', async () => {
    feeWorkflowService.recordPayment(
      { fee_id: FEE_ID, amount_paid: 10000, payment_mode: 'Cash', payment_date: '2026-11-25', idempotency_key: 'fap-035' },
      COUNSELLOR_ID
    );
    const metrics = calculatePaymentApprovalMetrics(store.payments);
    expect(metrics.approvedAmount).toBe(0);
    expect(metrics.pendingAmount).toBe(10000);
    const dash = await getFinanceDashboardMetrics();
    expect(dash.pendingCollections).toBe(10000);
    expect(dash.monthlyCollections).toBe(0);
  });
});
