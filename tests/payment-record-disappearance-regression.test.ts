import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import * as dbModule from '@/lib/supabase/db';
import * as adminModule from '@/lib/supabase/admin';
import {
  calculatePaymentApprovalMetrics,
  isPaymentApproved,
  isPaymentPending,
  unifyDualLedgerPayments,
} from '@/lib/utils/dashboard-metrics';
import {
  findOriginalReceivingAccount,
  getAuthorizedBankAccounts,
} from '@/lib/utils/bank-autofill';
import { runFinancialReconciliation } from '@/lib/services/financial-reconciliation-engine';
import { idempotencyService } from '@/lib/services/idempotency-service';
import type { StudentFee, UserProfile } from '@/types';

const TENANT = 'tenant-prdr-qa';
const COUNSELLOR_ID = '8fac380f-cc47-4209-9a13-e85153529dd1';
const ACCOUNTANT_ID = '33333333-3333-3333-3333-333333333333';
const STUDENT_ID = 'ed0378b7-9213-4e23-ba01-00eefda4ecbc';
const ADM_ID = 'f1a4bd7c-d854-4aa2-9645-291e3d35bb0b';
const FEE_ID = 'fee-prdr-01';

function seedQaContext() {
  idempotencyService.clear();
  store.users = [
    {
      id: COUNSELLOR_ID,
      tenant_id: TENANT,
      full_name: 'Vineethaa',
      email: 'vineethaa@example.com',
      role: 'counsellor',
      is_active: true,
    } as UserProfile,
    {
      id: ACCOUNTANT_ID,
      tenant_id: TENANT,
      full_name: 'Suresh Accountant',
      email: 'accounts@example.com',
      role: 'accountant',
      is_active: true,
    } as UserProfile,
  ];
  store.admissions = [
    {
      id: ADM_ID,
      tenant_id: TENANT,
      admission_number: 'ADM-2026-0025',
      student_id: STUDENT_ID,
      student_unique_id: 'NGERP-2026-00001',
      student_name: 'QA Normalized Student',
      phone: '+91 9876543210',
      email: 'qa.norm@example.com',
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
      full_name: 'QA Normalized Student',
      phone: '+91 9876543210',
      email: 'qa.norm@example.com',
      total_fee: 30000,
      paid_amount: 0,
      outstanding_amount: 30000,
      status: 'Active',
    } as any,
  ];
  store.studentFees = [
    {
      id: FEE_ID,
      tenant_id: TENANT,
      enrollment_id: ADM_ID,
      student_id: STUDENT_ID,
      student_name: 'QA Normalized Student',
      admission_number: 'ADM-2026-0025',
      fee_category: 'Course Admission Fee',
      course_id: 'c1000000-0000-4000-a000-000000000101',
      course_name: 'SAP FICO PERSONAL TRAINING',
      proposed_fee: 35000,
      discount_amount: 5000,
      final_payable: 30000,
      paid_amount: 0,
      outstanding_amount: 30000,
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
  store.auditLogs = [];
  store.studentFinancialLedgers = [];
}

describe('P0 Regression — Authoritative Payment Record Visibility & Disappearance Prevention', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    seedQaContext();
  });

  it('1. Genuine normalized payment records remain visible across dual-ledger unification', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 14000,
        payment_mode: 'UPI',
        transaction_reference: 'UTR-NORM-01',
        our_bank_profile_id: 'bank-acc-14',
        our_bank_name: 'Canara - Thenebanda',
        our_bank_account_name: 'T Usha',
        payment_date: '2026-11-25',
        idempotency_key: 'prdr-1',
      },
      COUNSELLOR_ID
    );
    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });
    expect(unified.length).toBe(1);
    expect(unified[0].id).toContain(p.id);
    expect(unified[0].amount).toBe(14000);
  });

  it('2. Successful empty database results remain empty (no mock fallback)', () => {
    const unified = unifyDualLedgerPayments([], [], {
      receipts: [],
      students: [],
      studentFees: [],
      courses: [],
    });
    expect(unified).toEqual([]);
    const metrics = calculatePaymentApprovalMetrics([]);
    expect(metrics.approvedAmount).toBe(0);
    expect(metrics.pendingAmount).toBe(0);
  });

  it('3. Deleted payments in stale fee_workflow_state are pruned when normalized PostgreSQL tables are empty', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fee_workflow_state') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    revision: 35,
                    snapshot: {
                      admissions: [],
                      students: [],
                      payments: [{ id: 'deleted-pay-1', amount: 10000, tenant_id: TENANT }],
                      studentPayments: [{ id: 'deleted-sp-1', student_id: 'deleted-stu', amount_paid: 10000, tenant_id: TENANT }],
                      receipts: [],
                    },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT, is_active: true }],
                error: null,
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
    } as any);

    const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
    const actor = { id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT } as any;
    await paymentTransaction(actor, () => {
      expect(store.payments.filter((p) => p.tenant_id === TENANT)).toEqual([]);
      expect(store.studentPayments.filter((sp) => sp.tenant_id === TENANT)).toEqual([]);
    }, true);
  });

  it('4. Database errors are NOT silently displayed as an empty dataset in write transactions', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fee_workflow_state') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'PostgreSQL connection refused' },
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
    } as any);

    const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
    const actor = { id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT } as any;
    await expect(paymentTransaction(actor, () => 'ok', false)).rejects.toThrow(/Payment database unavailable/);
  });

  it('5. Stale snapshot values cannot overwrite authoritative normalized payment amount and status', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fee_workflow_state') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    revision: 40,
                    snapshot: {
                      admissions: [{ id: ADM_ID, tenant_id: TENANT, course_id: 'c1000000-0000-4000-a000-000000000101', status: 'Confirmed' }],
                      students: [{ id: STUDENT_ID, tenant_id: TENANT, total_fee: 30000, paid_amount: 0, outstanding_amount: 30000 }],
                      payments: [{ id: 'pay-auth-1', student_id: STUDENT_ID, amount: 5000, receipt_number: 'REC-OLD', tenant_id: TENANT }],
                      receipts: [{ id: 'rcpt-auth-1', payment_id: 'pay-auth-1', receipt_number: 'REC-OLD', payment_amount: 5000, tenant_id: TENANT }],
                    },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT, is_active: true }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'admissions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: ADM_ID, course_id: 'c1000000-0000-4000-a000-000000000101', status: 'Confirmed' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'students') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: STUDENT_ID, total_fee: 30000, paid_amount: 14000, outstanding_amount: 16000 }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'payments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'pay-auth-1', amount: 14000, receipt_number: 'REC-2026-0001' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'receipts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'rcpt-auth-1', payment_id: 'pay-auth-1', receipt_number: 'REC-2026-0001', amount: 14000 }],
                error: null,
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
    } as any);

    const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
    const actor = { id: ACCOUNTANT_ID, role: 'accountant', tenant_id: TENANT } as any;
    await paymentTransaction(actor, () => {
      const p = store.payments.find((x) => x.id === 'pay-auth-1');
      const r = store.receipts.find((x) => x.id === 'rcpt-auth-1');
      const s = store.students.find((x) => x.id === STUDENT_ID);
      expect(p?.amount).toBe(14000);
      expect(p?.receipt_number).toBe('REC-2026-0001');
      expect(r?.payment_amount).toBe(14000);
      expect(s?.paid_amount).toBe(14000);
      expect(s?.outstanding_amount).toBe(16000);
    }, true);
  });

  it('6. Pending & approved counts and verified collection totals remain accurate', () => {
    const p1 = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 14000,
        payment_mode: 'UPI',
        transaction_reference: 'UTR-C1',
        our_bank_profile_id: 'bank-acc-14',
        our_bank_name: 'Canara - Thenebanda',
        our_bank_account_name: 'T Usha',
        payment_date: '2026-11-25',
        idempotency_key: 'prdr-c1',
      },
      COUNSELLOR_ID
    );
    feeWorkflowService.verifyPayment(p1.id, ACCOUNTANT_ID, 'Verified', {
      amount: '14000',
      payment_date: '2026-11-25',
      reference: 'UTR-C1',
      receiving_bank_profile_id: 'bank-acc-14',
    });
    const p2 = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 6000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'prdr-c2',
      },
      COUNSELLOR_ID
    );

    expect(isPaymentApproved(p1)).toBe(true);
    expect(isPaymentPending(p2)).toBe(true);
    const metrics = calculatePaymentApprovalMetrics(store.payments);
    expect(metrics.approvedCount).toBe(1);
    expect(metrics.approvedAmount).toBe(14000);
    expect(metrics.pendingCount).toBe(1);
    expect(metrics.pendingAmount).toBe(6000);
  });

  it('7. Bank account, counsellor, phone, and LMS ID mappings remain intact after verification', () => {
    const accounts = getAuthorizedBankAccounts('accountant');
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 14000,
        payment_mode: 'UPI',
        transaction_reference: 'UTR-MAP',
        our_bank_profile_id: 'bank-acc-14',
        our_bank_name: 'Canara - Thenebanda',
        our_bank_account_name: 'T Usha',
        payment_date: '2026-11-25',
        idempotency_key: 'prdr-map',
      },
      COUNSELLOR_ID
    );
    const acc = findOriginalReceivingAccount(p, accounts);
    expect(acc?.id).toBe('bank-acc-14');
    expect(acc?.account_holder_name).toBe('T Usha');
    expect(p.counsellor_name).toBe('Vineethaa');
    expect(p.student_phone).toBe('+91 9876543210');
    expect(p.student_unique_id).toBe('NGERP-2026-00001');
  });

  it('8. Cross-tenant access to payments is rejected', () => {
    store.users.push({
      id: 'usr-other-tenant',
      tenant_id: 'other-tenant',
      role: 'accountant',
      full_name: 'Other Tenant',
      is_active: true,
    } as UserProfile);
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'prdr-tenant',
      },
      COUNSELLOR_ID
    );
    expect(() =>
      feeWorkflowService.verifyPayment(p.id, 'usr-other-tenant', 'Cross tenant', {
        amount: '5000',
        payment_date: '2026-11-25',
        reference: '',
      })
    ).toThrow(/Forbidden|tenant/i);
  });

  it('9. Reconciliation engine detects zero discrepancies on consistent dataset', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 14000,
        payment_mode: 'UPI',
        transaction_reference: 'UTR-REC',
        our_bank_profile_id: 'bank-acc-14',
        our_bank_name: 'Canara - Thenebanda',
        our_bank_account_name: 'T Usha',
        payment_date: '2026-11-25',
        idempotency_key: 'prdr-rec',
      },
      COUNSELLOR_ID
    );
    feeWorkflowService.verifyPayment(p.id, ACCOUNTANT_ID, 'Verified', {
      amount: '14000',
      payment_date: '2026-11-25',
      reference: 'UTR-REC',
      receiving_bank_profile_id: 'bank-acc-14',
    });
    const report = runFinancialReconciliation(TENANT);
    expect(report.passed).toBe(true);
    expect(report.critical_count).toBe(0);
  });
});
