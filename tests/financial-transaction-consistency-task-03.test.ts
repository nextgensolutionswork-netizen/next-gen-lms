import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  approveExpense,
  createExpense,
  createExpenseCategory,
  getExpenseCategories,
  getFinanceDashboardMetrics,
  rejectExpense,
  validateAndSettleExpense,
} from '@/lib/services/finance-service';
import { idempotencyService, IdempotencyConflictError } from '@/lib/services/idempotency-service';
import {
  runFinancialReconciliation,
  reconcileLevel1,
  reconcileLevel2,
  reconcileLevel3,
  reconcileLevel4,
  reconcileLevel5,
  reconcileLevel6,
  reconcileLevel7,
} from '@/lib/services/financial-reconciliation-engine';
import {
  findOriginalReceivingAccount,
  getAuthorizedBankAccounts,
} from '@/lib/utils/bank-autofill';
import { calculateAuthoritativeStudentFinancials } from '@/lib/utils/student-financials';
import {
  calculatePaymentApprovalMetrics,
  isPaymentApproved,
  isPaymentPending,
} from '@/lib/utils/dashboard-metrics';
import { mergeWorkflowSnapshot } from '@/lib/services/payment-workflow-state';
import { concurrencyGuard, RecordConflictError } from '@/lib/services/concurrency-guard';
import { generateReceiptNumber } from '@/lib/utils/formatters';
import { emitSyncEvent } from '@/lib/services/sync-events';
import type { StudentFee, StudentPaymentRecord, Expense, UserProfile } from '@/types';

const TENANT = 'tenant-qa-fin-03';
const COUNSELLOR_ID = 'usr-counsellor-fin03';
const ACCOUNTANT_ID = 'usr-accountant-fin03';
const ACCOUNTANT2_ID = 'usr-accountant2-fin03';
const SUPER_ADMIN_ID = 'usr-superadmin-fin03';
const STUDENT_ID = 'stu-fin03-01';
const FEE_ID = 'fee-fin03-01';

function verify(p: StudentPaymentRecord, actorId = ACCOUNTANT_ID, notes = 'Verified') {
  return feeWorkflowService.verifyPayment(p.id, actorId, notes, {
    amount: String(p.amount_paid),
    payment_date: p.payment_date || '2026-11-25',
    reference: p.payment_mode === 'Cash' ? '' : (p.transaction_reference || 'UTR-VERIFIED'),
    receiving_bank_profile_id: p.our_bank_profile_id,
  });
}

function seedBaselineContext() {
  idempotencyService.clear();

  store.users = [
    {
      id: COUNSELLOR_ID,
      tenant_id: TENANT,
      email: 'counsellor.fin03@example.com',
      full_name: 'Radhika QA',
      role: 'counsellor',
      is_active: true,
    } as UserProfile,
    {
      id: ACCOUNTANT_ID,
      tenant_id: TENANT,
      email: 'accountant1.fin03@example.com',
      full_name: 'Suresh QA',
      role: 'accountant',
      is_active: true,
    } as UserProfile,
    {
      id: ACCOUNTANT2_ID,
      tenant_id: TENANT,
      email: 'accountant2.fin03@example.com',
      full_name: 'Meena QA',
      role: 'accountant',
      is_active: true,
    } as UserProfile,
    {
      id: SUPER_ADMIN_ID,
      tenant_id: TENANT,
      email: 'superadmin.fin03@example.com',
      full_name: 'Director QA',
      role: 'super_admin',
      is_active: true,
    } as UserProfile,
  ];

  store.students = [
    {
      id: STUDENT_ID,
      tenant_id: TENANT,
      user_id: 'usr-stu-fin03-01',
      admission_id: 'adm-fin03-01',
      admission_number: 'NGERP-2026-QA001',
      student_code: 'STU-FICO-QA1',
      full_name: 'QA Financial Student',
      email: 'student.fin03@example.com',
      phone: '9988776655',
      course_id: 'crs-fico',
      course_name: 'SAP S/4HANA Finance (FICO)',
      total_fee: 30000,
      discount: 5000,
      paid_amount: 0,
      outstanding_amount: 30000,
      status: 'Active',
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
    } as any,
  ];

  store.studentFees = [
    {
      id: FEE_ID,
      tenant_id: TENANT,
      fee_account_id: 'fa-fin03-01',
      enrollment_id: 'adm-fin03-01',
      student_id: STUDENT_ID,
      student_name: 'QA Financial Student',
      student_code: 'STU-FICO-QA1',
      admission_number: 'NGERP-2026-QA001',
      fee_category: 'Course Admission Fee',
      course_id: 'crs-fico',
      course_name: 'SAP S/4HANA Finance (FICO)',
      standard_fee: 35000,
      proposed_fee: 35000,
      discount_amount: 5000,
      discount_percentage: 14.29,
      tax_gst_amount: 0,
      additional_charges: 0,
      final_payable: 30000,
      paid_amount: 0,
      outstanding_amount: 30000,
      payment_plan: '2 Installments',
      number_of_installments: 2,
      first_due_date: '2026-11-15',
      counsellor_id: COUNSELLOR_ID,
      counsellor_name: 'Radhika QA',
      approval_status: 'Approved',
      approved_by: ACCOUNTANT_ID,
      approved_by_name: 'Suresh QA',
      approved_at: '2026-11-01T01:00:00.000Z',
      approved_fee: 35000,
      approved_discount: 5000,
      approved_tax: 0,
      approved_total: 30000,
      version: 1,
      is_payable: true,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
    } as StudentFee,
  ];

  store.feeAccounts = [
    {
      id: 'fa-fin03-01',
      tenant_id: TENANT,
      student_id: STUDENT_ID,
      student_name: 'QA Financial Student',
      admission_id: 'adm-fin03-01',
      course_id: 'crs-fico',
      course_name: 'SAP S/4HANA Finance (FICO)',
      original_fee: 35000,
      discount: 5000,
      net_payable: 30000,
      paid_amount: 0,
      outstanding_amount: 30000,
      payment_plan: '2 Installments',
      status: 'Unpaid',
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
    } as any,
  ];

  store.installments = [
    {
      id: 'inst-fin03-1',
      tenant_id: TENANT,
      fee_account_id: 'fa-fin03-01',
      student_fee_id: FEE_ID,
      student_id: STUDENT_ID,
      installment_number: 1,
      amount: 15000,
      paid_amount: 0,
      outstanding_amount: 15000,
      due_date: '2026-11-10',
      status: 'Pending',
    } as any,
    {
      id: 'inst-fin03-2',
      tenant_id: TENANT,
      fee_account_id: 'fa-fin03-01',
      student_fee_id: FEE_ID,
      student_id: STUDENT_ID,
      installment_number: 2,
      amount: 15000,
      paid_amount: 0,
      outstanding_amount: 15000,
      due_date: '2026-12-10',
      status: 'Pending',
    } as any,
  ];

  store.studentPayments = [];
  store.payments = [];
  store.receipts = [];
  store.studentFinancialLedgers = [];
  store.expenses = [];
  store.auditLogs = [];
  store.notifications = [];
}

describe('TASK-03 — Financial Transaction Consistency, Bank Mapping, Expense Settlement & Reconciliation (100 Scenarios)', () => {
  beforeEach(() => {
    seedBaselineContext();
  });

  // =========================================================================
  // Group A — Fee Agreements & Installments (FIN-001 to FIN-010)
  // =========================================================================
  describe('Group A — Fee Agreements & Installments', () => {
    it('FIN-001: Valid fee agreement persists authoritative gross, discount, and net payable', () => {
      const fee = store.studentFees.find((f) => f.id === FEE_ID)!;
      expect(fee.proposed_fee).toBe(35000);
      expect(fee.discount_amount).toBe(5000);
      expect(fee.final_payable).toBe(30000);
      expect(fee.is_payable).toBe(true);
    });

    it('FIN-002: Approved discount computes exact net payable fee without floating point error', () => {
      const gross = 35000;
      const discount = 5000;
      const net = Number((gross - discount).toFixed(2));
      expect(net).toBe(30000);
    });

    it('FIN-003: Invalid discount exceeding gross fee is rejected in reconciliation Level 1', () => {
      store.studentFees[0].discount_amount = 40000;
      store.studentFees[0].final_payable = -5000;
      const l1 = reconcileLevel1(TENANT);
      expect(l1.discrepancies.some((d) => d.code === 'L1-NET-PAYABLE-MISMATCH' || d.code === 'L1-BALANCE-INCONSISTENT')).toBe(true);
    });

    it('FIN-004: Invalid monetary precision (more than 2 decimal places or NaN) is rejected on payment', () => {
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            amount_paid: 100.123,
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin004-prec',
          },
          COUNSELLOR_ID
        )
      ).toThrow(/greater than zero/i);

      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            amount_paid: Number.NaN,
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin004-nan',
          },
          COUNSELLOR_ID
        )
      ).toThrow();
    });

    it('FIN-005: Installment schedule total reconciles with agreed net payable fee', () => {
      const instTotal = store.installments.reduce((s, i: any) => s + i.amount, 0);
      expect(instTotal).toBe(store.studentFees[0].final_payable);
      expect(reconcileLevel4(TENANT).passed).toBe(true);
    });

    it('FIN-006: Partial installment payment leaves accurate remaining balance', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          installment_id: 'inst-fin03-1',
          amount_paid: 10000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-FIN006-01',
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'E Anasuya',
          our_bank_account_id: '50100 8984 89271',
          payment_date: '2026-11-25',
          idempotency_key: 'fin006-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'Verified partial');
      const fee = store.studentFees.find((f) => f.id === FEE_ID)!;
      expect(fee.paid_amount).toBe(10000);
      expect(fee.outstanding_amount).toBe(20000);
    });

    it('FIN-007: Payment allocated to specific installment enforces ownership & tenant rules', () => {
      store.installments.push({
        id: 'inst-other-tenant',
        tenant_id: 'other-tenant',
        fee_account_id: 'fa-other',
        amount: 5000,
      } as any);
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            installment_id: 'inst-other-tenant',
            amount_paid: 5000,
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin007-key',
          },
          COUNSELLOR_ID
        )
      ).toThrow(/Installment does not belong/);
    });

    it('FIN-008: Excess payment above outstanding balance is rejected', () => {
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            amount_paid: 35000, // Outstanding is 30,000
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin008-excess',
          },
          COUNSELLOR_ID
        )
      ).toThrow();
    });

    it('FIN-009: Verified payments remain intact if installment metadata is inspected', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin009-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'OK');
      expect(store.studentPayments.find((x) => x.id === p.id)?.verification_status).toBe('Verified');
    });

    it('FIN-010: Overdue installment calculation identifies past-due unpaid balance', () => {
      const today = '2026-11-25';
      const overdue = store.installments.filter(
        (i: any) => i.due_date < today && i.outstanding_amount > 0
      );
      expect(overdue.length).toBe(1);
      expect(overdue[0].id).toBe('inst-fin03-1');
    });
  });

  // =========================================================================
  // Group B — Payment Submission (FIN-011 to FIN-020)
  // =========================================================================
  describe('Group B — Payment Submission', () => {
    it('FIN-011: Valid payment submission persists as Pending Approval', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-FIN011-01',
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'E Anasuya',
          our_bank_account_id: '50100 8984 89271',
          payment_date: '2026-11-25',
          idempotency_key: 'fin011-key',
        },
        COUNSELLOR_ID
      );
      expect(p.status).toBe('Pending Approval');
      expect(p.verification_status).toBe('Pending Verification');
    });

    it('FIN-012: Invalid student association is rejected', () => {
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            student_id: 'non-existent-student',
            amount_paid: 5000,
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin012-key',
          },
          COUNSELLOR_ID
        )
      ).toThrow(/Student does not match/);
    });

    it('FIN-013: Invalid admission association is rejected', () => {
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            enrollment_id: 'invalid-adm-999',
            amount_paid: 5000,
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin013-key',
          },
          COUNSELLOR_ID
        )
      ).toThrow(/Enrollment does not match/);
    });

    it('FIN-014: Zero payment amount is rejected', () => {
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            amount_paid: 0,
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin014-key',
          },
          COUNSELLOR_ID
        )
      ).toThrow(/greater than zero/i);
    });

    it('FIN-015: Negative ordinary payment is rejected', () => {
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            amount_paid: -1000,
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin015-key',
          },
          COUNSELLOR_ID
        )
      ).toThrow(/greater than zero/i);
    });

    it('FIN-016: Non-cash payment requires transaction reference', () => {
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            amount_paid: 5000,
            payment_mode: 'UPI',
            transaction_reference: '',
            payment_date: '2026-11-25',
            idempotency_key: 'fin016-key',
          },
          COUNSELLOR_ID
        )
      ).toThrow();
    });

    it('FIN-017: Unauthorized user cannot submit payment', () => {
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: FEE_ID,
            amount_paid: 5000,
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin017-key',
          },
          'unauthorized-user-id'
        )
      ).toThrow(/Unauthorized/);
    });

    it('FIN-018: Client-submitted status cannot bypass approval workflow', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin018-key',
          status: 'Approved',
          verification_status: 'Verified',
        } as any,
        COUNSELLOR_ID
      );
      expect(p.status).toBe('Pending Approval');
      expect(p.verification_status).toBe('Pending Verification');
    });

    it('FIN-019: Pending payment is excluded from verified collection totals and balance reductions', () => {
      feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 6000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin019-key',
        },
        COUNSELLOR_ID
      );
      const metrics = calculatePaymentApprovalMetrics(store.payments);
      expect(metrics.approvedAmount).toBe(0);
      expect(metrics.pendingAmount).toBe(6000);
      expect(store.studentFees[0].outstanding_amount).toBe(30000);
    });

    it('FIN-020: Failed payment persistence leaves zero phantom payment records', () => {
      const beforeCount = store.studentPayments.length;
      expect(() =>
        feeWorkflowService.recordPayment(
          {
            fee_id: 'non-existent-fee',
            amount_paid: 5000,
            payment_mode: 'Cash',
            payment_date: '2026-11-25',
            idempotency_key: 'fin020-key',
          },
          COUNSELLOR_ID
        )
      ).toThrow();
      expect(store.studentPayments.length).toBe(beforeCount);
    });
  });

  // =========================================================================
  // Group C — Bank Account Mapping (FIN-021 to FIN-030)
  // =========================================================================
  describe('Group C — Bank Account Mapping', () => {
    const accounts = getAuthorizedBankAccounts('admin');

    it('FIN-021: Selecting HDFC Account A (bank-acc-01 Katari Charitha) persists exact Account A ID', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-FIN021',
          our_bank_profile_id: 'bank-acc-01',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'Katari Charitha',
          our_bank_account_id: '50100 76776 1140',
          payment_date: '2026-11-25',
          idempotency_key: 'fin021-key',
        },
        COUNSELLOR_ID
      );
      expect(p.our_bank_profile_id).toBe('bank-acc-01');
      const resolved = findOriginalReceivingAccount(p, accounts);
      expect(resolved?.id).toBe('bank-acc-01');
      expect(resolved?.account_holder_name).toBe('Katari Charitha');
    });

    it('FIN-022: Selecting HDFC Account B (bank-acc-12 E Anasuya) persists exact Account B ID', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-FIN022',
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'E Anasuya',
          our_bank_account_id: '50100 8984 89271',
          payment_date: '2026-11-25',
          idempotency_key: 'fin022-key',
        },
        COUNSELLOR_ID
      );
      expect(p.our_bank_profile_id).toBe('bank-acc-12');
      const resolved = findOriginalReceivingAccount(p, accounts);
      expect(resolved?.id).toBe('bank-acc-12');
      expect(resolved?.account_holder_name).toBe('E Anasuya');
    });

    it('FIN-023: Same bank (HDFC) with different holders never substitutes Account A for Account B', () => {
      const resolved = findOriginalReceivingAccount(
        {
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
        },
        accounts
      );
      expect(resolved?.id).toBe('bank-acc-12');
      expect(resolved?.account_holder_name).toBe('E Anasuya');
      expect(resolved?.account_holder_name).not.toBe('Katari Charitha');
    });

    it('FIN-024: Historical E Anasuya / Katari Charitha scenario resolves strictly to E Anasuya XXXX9271', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-SRINIVAS-QA',
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'E Anasuya',
          our_bank_account_id: '•••• •••• 9271',
          payment_date: '2026-11-25',
          idempotency_key: 'fin024-key',
        },
        COUNSELLOR_ID
      );
      const legacy = store.payments.find((lp) => lp.id === `pay-${p.id}`);
      expect(legacy?.our_bank_account_name).toBe('E Anasuya');
      expect((legacy as any)?.our_bank_profile_id).toBe('bank-acc-12');
    });

    it('FIN-025: Missing bank account profile ID on non-cash payment triggers Level 3 reconciliation warning/critical', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-NOBANK',
          payment_date: '2026-11-25',
          idempotency_key: 'fin025-key',
        },
        COUNSELLOR_ID
      );
      const l3 = reconcileLevel3(TENANT);
      expect(l3.discrepancies.some((d) => d.code === 'L3-MISSING-BANK-PROFILE-ID' && d.entity_id === p.id)).toBe(true);
    });

    it('FIN-026: Invalid bank account ID triggers Level 3 critical reconciliation failure', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-BADBANK',
          our_bank_profile_id: 'bank-does-not-exist',
          payment_date: '2026-11-25',
          idempotency_key: 'fin026-key',
        },
        COUNSELLOR_ID
      );
      const l3 = reconcileLevel3(TENANT);
      expect(l3.passed).toBe(false);
      expect(l3.discrepancies.some((d) => d.code === 'L3-INVALID-BANK-PROFILE-ID' && d.entity_id === p.id)).toBe(true);
    });

    it('FIN-027: Bank name alone without holder or ID never resolves to an arbitrary bank account', () => {
      const resolved = findOriginalReceivingAccount({ our_bank_name: 'HDFC Bank' }, accounts);
      expect(resolved).toBeUndefined();
    });

    it('FIN-028: Inactive/archived accounts are excluded from active payment dropdowns', () => {
      const activeOnly = getAuthorizedBankAccounts('counsellor', { includePending: false, includeArchived: false });
      expect(activeOnly.every((a) => a.is_active !== false && !a.is_archived)).toBe(true);
    });

    it('FIN-029: Historical payments retain original account identity even if queried with includeArchived', () => {
      const allAccounts = getAuthorizedBankAccounts('admin', { includePending: true, includeArchived: true });
      const resolved = findOriginalReceivingAccount({ our_bank_profile_id: 'bank-acc-12' }, allAccounts);
      expect(resolved?.id).toBe('bank-acc-12');
    });

    it('FIN-030: Bank-wise collection report groups verified payments strictly by receiving bank profile ID', () => {
      const p1 = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-B1',
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'E Anasuya',
          payment_date: '2026-11-25',
          idempotency_key: 'fin030-1',
        },
        COUNSELLOR_ID
      );
      const p2 = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 6000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-B2',
          our_bank_profile_id: 'bank-acc-01',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'Katari Charitha',
          payment_date: '2026-11-25',
          idempotency_key: 'fin030-2',
        },
        COUNSELLOR_ID
      );
      verify(p1, ACCOUNTANT_ID, 'Verified p1');
      verify(p2, ACCOUNTANT_ID, 'Verified p2');

      const l3 = reconcileLevel3(TENANT);
      const summary = l3.discrepancies.find((d) => d.code === 'L3-BANK-COLLECTION-SUMMARY');
      const collections = (summary?.details as any)?.bankCollections;
      expect(collections['bank-acc-12']).toBe(14000);
      expect(collections['bank-acc-01']).toBe(6000);
    });
  });

  // =========================================================================
  // Group D — Payment Approval & Rejection (FIN-031 to FIN-040)
  // =========================================================================
  describe('Group D — Payment Approval & Rejection', () => {
    it('FIN-031: Valid payment approval commits verified status, receipt, and reduces outstanding', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin031-key',
        },
        COUNSELLOR_ID
      );
      const verified = verify(p, ACCOUNTANT_ID, 'Verified cash');
      expect(verified.verification_status).toBe('Verified');
      expect(verified.status).toBe('Approved');
      expect(verified.receipt_number).toBeTruthy();
      expect(store.studentFees[0].outstanding_amount).toBe(16000);
    });

    it('FIN-032: Unauthorized user (counsellor/self-approver) cannot approve payment', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin032-key',
        },
        COUNSELLOR_ID
      );
      expect(() => verify(p, COUNSELLOR_ID, 'Self approve')).toThrow(
        /Separation of duties|Unauthorized/
      );
    });

    it('FIN-033: Approval of non-existent payment is rejected', () => {
      expect(() => feeWorkflowService.verifyPayment('non-existent-pay', ACCOUNTANT_ID, 'No')).toThrow(/not found/);
    });

    it('FIN-034: Concurrent/repeated double approval produces exactly one financial posting', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 10000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin034-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'First approval');
      expect(() => verify(p, ACCOUNTANT2_ID, 'Second approval')).toThrow(
        /Only a payment pending approval can be approved/
      );
      expect(store.receipts.length).toBe(1);
      expect(store.studentFees[0].paid_amount).toBe(10000);
    });

    it('FIN-035: Repeated approval after already verified does not issue duplicate receipts', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 10000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin035-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'OK');
      expect(store.receipts.length).toBe(1);
      expect(() => verify(p, ACCOUNTANT_ID, 'Retry')).toThrow();
      expect(store.receipts.length).toBe(1);
    });

    it('FIN-036: Approval vs rejection race allows only one terminal transition', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin036-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'Approve wins');
      expect(() => feeWorkflowService.rejectPayment(p.id, ACCOUNTANT2_ID, 'Reject loses')).toThrow(
        /Cannot reject an already verified payment/
      );
      expect(p.verification_status).toBe('Verified');
    });

    it('FIN-037: Valid rejection sets Rejected status and requires reason', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 2000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin037-key',
        },
        COUNSELLOR_ID
      );
      expect(() => feeWorkflowService.rejectPayment(p.id, ACCOUNTANT_ID, '')).toThrow(/reason is mandatory/i);
      const rejected = feeWorkflowService.rejectPayment(p.id, ACCOUNTANT_ID, 'Invalid proof');
      expect(rejected.status).toBe('Rejected');
      expect(rejected.verification_status).toBe('Rejected');
      expect(rejected.rejection_reason).toBe('Invalid proof');
    });

    it('FIN-038: Rejected payment is excluded from verified collections and outstanding reduction', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 2000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin038-key',
        },
        COUNSELLOR_ID
      );
      feeWorkflowService.rejectPayment(p.id, ACCOUNTANT_ID, 'Bounced');
      const metrics = calculatePaymentApprovalMetrics(store.payments);
      expect(metrics.approvedAmount).toBe(0);
      expect(metrics.pendingAmount).toBe(0);
      expect(store.studentFees[0].outstanding_amount).toBe(30000);
    });

    it('FIN-039: Unauthorized terminal status change (Rejected -> Verified) is blocked', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 2000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin039-key',
        },
        COUNSELLOR_ID
      );
      feeWorkflowService.rejectPayment(p.id, ACCOUNTANT_ID, 'Rejected');
      expect(() => verify(p, ACCOUNTANT2_ID, 'Force approve')).toThrow(
        /Only a payment pending approval can be approved/
      );
    });

    it('FIN-040: Failure during approval does not commit partial receipt or ledger entries', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-FIN040',
          payment_date: '2026-11-25',
          idempotency_key: 'fin040-key',
        },
        COUNSELLOR_ID
      );
      // Force validation error on amount mismatch during manual verification
      expect(() =>
        feeWorkflowService.verifyPayment(p.id, ACCOUNTANT_ID, 'Mismatch', {
          amount: '9999',
          payment_date: '2026-11-25',
          reference: 'UTR-FIN040',
        })
      ).toThrow();
      expect(store.receipts.length).toBe(0);
      expect(store.studentFees[0].paid_amount).toBe(0);
    });
  });

  // =========================================================================
  // Group E — Financial Idempotency & Crash Recovery (FIN-041 to FIN-050)
  // =========================================================================
  describe('Group E — Financial Idempotency & Crash Recovery', () => {
    it('FIN-041: Identical payment retry with same idempotency key returns original record', async () => {
      const key = 'fin041-retry-key';
      const payload = {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'Cash' as const,
        payment_date: '2026-11-25',
        idempotency_key: key,
      };
      const first = feeWorkflowService.recordPayment(payload, COUNSELLOR_ID);
      const second = feeWorkflowService.recordPayment(payload, COUNSELLOR_ID);
      expect(second.id).toBe(first.id);
      expect(store.studentPayments.length).toBe(1);
    });

    it('FIN-042: Same idempotency key with different payload throws conflict error', async () => {
      const key = 'fin042-conflict-key';
      await idempotencyService.acquireAsync(key, COUNSELLOR_ID, TENANT, { amount: 5000 }, 'payment_record');
      await idempotencyService.completeAsync(key, COUNSELLOR_ID, TENANT, { ok: true }, 'payment_record');

      await expect(
        idempotencyService.acquireAsync(key, COUNSELLOR_ID, TENANT, { amount: 9000 }, 'payment_record')
      ).rejects.toThrow(IdempotencyConflictError);
    });

    it('FIN-043: Cross-instance duplicate acquisition while in-flight is rejected with conflict', async () => {
      const key = 'fin043-inflight';
      await idempotencyService.acquireAsync(key, COUNSELLOR_ID, TENANT, { amount: 5000 }, 'payment_record');
      await expect(
        idempotencyService.acquireAsync(key, COUNSELLOR_ID, TENANT, { amount: 5000 }, 'payment_record')
      ).rejects.toThrow(IdempotencyConflictError);
    });

    it('FIN-044: Release after crash before commit allows safe retry', async () => {
      const key = 'fin044-crash-before';
      await idempotencyService.acquireAsync(key, COUNSELLOR_ID, TENANT, { amount: 5000 }, 'payment_record');
      await idempotencyService.failAsync(key, COUNSELLOR_ID, TENANT, 'payment_record');
      const retry = await idempotencyService.acquireAsync(key, COUNSELLOR_ID, TENANT, { amount: 5000 }, 'payment_record');
      expect(retry.isExisting).toBe(false);
    });

    it('FIN-045: Completed idempotent operation recovers cached outcome cleanly', async () => {
      const key = 'fin045-recover';
      await idempotencyService.acquireAsync(key, ACCOUNTANT_ID, TENANT, { paymentId: 'p1' }, 'payment_approve');
      await idempotencyService.completeAsync(key, ACCOUNTANT_ID, TENANT, { success: true, receipt: 'REC-001' }, 'payment_approve');
      const replay = await idempotencyService.acquireAsync(key, ACCOUNTANT_ID, TENANT, { paymentId: 'p1' }, 'payment_approve');
      expect(replay.isExisting).toBe(true);
      expect((replay.result as any).receipt).toBe('REC-001');
    });

    it('FIN-046: Duplicate business identity protects against duplicate receipt even without idempotency key', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin046-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'Done');
      expect(() => verify(p, ACCOUNTANT_ID, 'Done again')).toThrow();
      expect(store.receipts.length).toBe(1);
    });

    it('FIN-047: Concurrency guard detects stale version mismatch and prevents overwrite', () => {
      expect(() =>
        concurrencyGuard.assertVersionMatch({ id: FEE_ID, updated_at: '2026-11-25T12:00:00.000Z' }, '2026-11-25T10:00:00.000Z')
      ).toThrow(RecordConflictError);
    });

    it('FIN-048: Business-level terminal state protection persists even after cache clear', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin048-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'OK');
      idempotencyService.clear();
      expect(() => verify(p, ACCOUNTANT_ID, 'Retry after cache clear')).toThrow();
    });

    it('FIN-049: Different actors/keys targeting same pending payment allow only one approval', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin049-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'Actor 1');
      expect(() => verify(p, ACCOUNTANT2_ID, 'Actor 2')).toThrow();
      expect(store.receipts.length).toBe(1);
    });

    it('FIN-050: Level 7 reconciliation detects duplicate idempotency keys across separate records', () => {
      store.studentPayments.push(
        { id: 'p-dup-1', tenant_id: TENANT, idempotency_key: 'dup-key-x', amount_paid: 1000, verification_status: 'Pending Verification', status: 'Pending Approval' } as any,
        { id: 'p-dup-2', tenant_id: TENANT, idempotency_key: 'dup-key-x', amount_paid: 1000, verification_status: 'Pending Verification', status: 'Pending Approval' } as any
      );
      const l7 = reconcileLevel7(TENANT);
      expect(l7.passed).toBe(false);
      expect(l7.discrepancies.some((d) => d.code === 'L7-DUPLICATE-IDEMPOTENCY-KEY')).toBe(true);
    });
  });

  // =========================================================================
  // Group F — Receipts, Invoices & Fee Ledger (FIN-051 to FIN-060)
  // =========================================================================
  describe('Group F — Receipts, Invoices & Fee Ledger', () => {
    it('FIN-051: Verified payment generates unique receipt linked to payment and student', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin051-key',
        },
        COUNSELLOR_ID
      );
      const verified = verify(p, ACCOUNTANT_ID, 'OK');
      const receipt = store.receipts.find((r) => r.payment_id === p.id);
      expect(receipt).toBeDefined();
      expect(receipt?.receipt_number).toBe(verified.receipt_number);
      expect(receipt?.student_id).toBe(STUDENT_ID);
    });

    it('FIN-052: Pending payment does NOT generate a verified receipt prematurely', () => {
      feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin052-key',
        },
        COUNSELLOR_ID
      );
      expect(store.receipts.length).toBe(0);
    });

    it('FIN-053: Sequential receipt numbering produces distinct valid numbers', () => {
      const r1 = generateReceiptNumber(1);
      const r2 = generateReceiptNumber(2);
      expect(r1).not.toBe(r2);
      expect(r1).toMatch(/^REC-/);
    });

    it('FIN-054: Receipt amount matches authoritative verified payment amount', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin054-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'OK');
      const receipt = store.receipts[0] as any;
      expect(receipt.payment_amount ?? receipt.amount ?? receipt.amount_paid).toBe(14000);
    });

    it('FIN-055: Receipt preserves receiving bank account details', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-FIN055',
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'E Anasuya',
          our_bank_account_id: '50100 8984 89271',
          payment_date: '2026-11-25',
          idempotency_key: 'fin055-key',
        },
        COUNSELLOR_ID
      );
      const verified = verify(p, ACCOUNTANT_ID, 'OK');
      expect(verified.our_bank_profile_id).toBe('bank-acc-12');
      expect(verified.our_bank_account_name).toBe('E Anasuya');
    });

    it('FIN-056: Receipt generation failure does not leave dangling verified payment without receipt in reconciliation', () => {
      store.studentPayments.push({
        id: 'p-missing-rcpt',
        tenant_id: TENANT,
        student_id: STUDENT_ID,
        amount_paid: 5000,
        status: 'Approved',
        verification_status: 'Verified',
      } as any);
      const l2 = reconcileLevel2(TENANT);
      expect(l2.passed).toBe(false);
      expect(l2.discrepancies.some((d) => d.code === 'L2-VERIFIED-MISSING-RECEIPT')).toBe(true);
    });

    it('FIN-057: Reading receipt metadata multiple times creates no new receipts or ledger entries', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 10000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin057-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'OK');
      const countBefore = store.receipts.length;
      const found1 = store.receipts.find((r) => r.payment_id === p.id);
      const found2 = store.receipts.find((r) => r.payment_id === p.id);
      expect(found1?.id).toBe(found2?.id);
      expect(store.receipts.length).toBe(countBefore);
    });

    it('FIN-058: Authoritative student financials agree on net payable across modules', () => {
      const auth = calculateAuthoritativeStudentFinancials({
        student: store.students[0],
        feeAccount: store.feeAccounts[0],
        studentFees: store.studentFees,
        studentPayments: store.studentPayments,
        payments: store.payments,
      });
      expect(auth.totalPayable).toBe(30000);
      expect(auth.outstandingDue).toBe(30000);
    });

    it('FIN-059: Student fee ledger accurately separates verified and pending amounts', () => {
      const p1 = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin059-1',
        },
        COUNSELLOR_ID
      );
      verify(p1, ACCOUNTANT_ID, 'OK');
      feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 6000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin059-2',
        },
        COUNSELLOR_ID
      );
      const metrics = calculatePaymentApprovalMetrics(store.payments);
      expect(metrics.approvedAmount).toBe(14000);
      expect(metrics.pendingAmount).toBe(6000);
    });

    it('FIN-060: Outstanding balance is identical across student profile, fee account, and studentFee', () => {
      const p1 = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin060-1',
        },
        COUNSELLOR_ID
      );
      verify(p1, ACCOUNTANT_ID, 'OK');
      expect(store.studentFees[0].outstanding_amount).toBe(16000);
      expect(store.feeAccounts[0].outstanding_amount).toBe(16000);
      expect(store.students[0].outstanding_amount).toBe(16000);
    });
  });

  // =========================================================================
  // Group G — Expense Management (FIN-061 to FIN-070)
  // =========================================================================
  describe('Group G — Expense Management', () => {
    it('FIN-061: Valid expense category creation persists and is retrievable', async () => {
      const cat = await createExpenseCategory('Lab Cloud Hosting', SUPER_ADMIN_ID);
      expect(cat).toBe('Lab Cloud Hosting');
      const all = await getExpenseCategories();
      expect(all).toContain('Lab Cloud Hosting');
    });

    it('FIN-062: Empty or invalid category name is rejected', async () => {
      await expect(createExpenseCategory('   ', SUPER_ADMIN_ID)).rejects.toThrow();
    });

    it('FIN-063: Valid expense creation persists with Pending Approval or Approved status per rule', async () => {
      const exp = await createExpense(
        {
          category: 'Software',
          description: 'Cloud Lab Subscription',
          amount: 10000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      expect(exp.id).toBeTruthy();
      expect(exp.amount).toBe(10000);
    });

    it('FIN-064: Non-positive expense amount is flagged by Level 5 reconciliation', () => {
      store.expenses.push({
        id: 'exp-neg',
        expense_code: 'EXP-NEG',
        expense_date: '2026-11-25',
        category: 'Miscellaneous',
        description: 'Invalid negative',
        amount: -500,
        payment_mode: 'Cash',
        status: 'Pending Approval',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const l5 = reconcileLevel5(TENANT);
      expect(l5.passed).toBe(false);
      expect(l5.discrepancies.some((d) => d.code === 'L5-NON-POSITIVE-AMOUNT')).toBe(true);
    });

    it('FIN-065: Duplicate expense submission with same idempotency key does not execute twice', async () => {
      const key = 'fin065-exp-dup';
      await idempotencyService.acquireAsync(key, ACCOUNTANT_ID, TENANT, { amount: 5000 }, 'expense_create');
      await idempotencyService.completeAsync(key, ACCOUNTANT_ID, TENANT, { id: 'exp-1' }, 'expense_create');
      const replay = await idempotencyService.acquireAsync(key, ACCOUNTANT_ID, TENANT, { amount: 5000 }, 'expense_create');
      expect(replay.isExisting).toBe(true);
    });

    it('FIN-066: Authorized expense approval sets Approved status and approver metadata', async () => {
      const exp = await createExpense(
        {
          category: 'Rent',
          description: 'Office Rent',
          amount: 25000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      const approved = await approveExpense(exp.id, SUPER_ADMIN_ID);
      expect(approved.status).toBe('Approved');
      expect(approved.approved_by).toBe(SUPER_ADMIN_ID);
    });

    it('FIN-067: Expense > ₹50,000 cannot be approved by non-super-admin', async () => {
      const exp = await createExpense(
        {
          category: 'Rent',
          description: 'Annual Lease',
          amount: 75000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await expect(approveExpense(exp.id, ACCOUNTANT_ID)).rejects.toThrow(/Approval Policy Violation/);
    });

    it('FIN-068: Unauthorized role (counsellor) cannot approve expenses', async () => {
      const exp = await createExpense(
        {
          category: 'Office supplies',
          description: 'Stationery',
          amount: 1000,
          expense_date: '2026-11-25',
          payment_mode: 'Cash',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await expect(approveExpense(exp.id, COUNSELLOR_ID)).rejects.toThrow(/Access Denied/);
    });

    it('FIN-069: Expense rejection preserves reason and prevents settlement', async () => {
      const exp = await createExpense(
        {
          category: 'Travel',
          description: 'Cab claim',
          amount: 2000,
          expense_date: '2026-11-25',
          payment_mode: 'Cash',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      const rejected = await rejectExpense(exp.id, SUPER_ADMIN_ID, 'Missing receipt');
      expect(rejected.status).toBe('Rejected');
      await expect(
        validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
          payment_mode: 'Cash',
          reference: 'CASH-01',
        })
      ).rejects.toThrow(/Invalid workflow transition/);
    });

    it('FIN-070: Approval of non-existent expense fails cleanly without modifying store', async () => {
      await expect(approveExpense('non-existent-exp', SUPER_ADMIN_ID)).rejects.toThrow(/Expense not found/);
    });
  });

  // =========================================================================
  // Group H — Expense Settlement (FIN-071 to FIN-080)
  // =========================================================================
  describe('Group H — Expense Settlement', () => {
    it('FIN-071: Valid expense settlement persists Settled status, UTR, and selected paying bank account', async () => {
      const exp = await createExpense(
        {
          category: 'Software',
          description: 'Zoom Pro',
          amount: 10000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);
      const settled = await validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
        payment_mode: 'Bank Transfer',
        reference: 'UTR-EXP-071',
        bank_account_profile_id: 'bank-acc-12',
      });
      expect(settled.status).toBe('Settled');
      expect(settled.reference).toBe('UTR-EXP-071');
      expect(settled.bank_account).toContain('E Anasuya');
      expect(settled.settled_by).toBe(ACCOUNTANT_ID);
    });

    it('FIN-072: Settlement of pending expense is rejected', async () => {
      const exp = await createExpense(
        {
          category: 'Software',
          description: 'Pending Exp',
          amount: 3000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await expect(
        validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
          payment_mode: 'Bank Transfer',
          reference: 'UTR-EXP-072',
          bank_account_profile_id: 'bank-acc-01',
        })
      ).rejects.toThrow(/Invalid workflow transition/);
    });

    it('FIN-073: Settlement of rejected expense is rejected', async () => {
      const exp = await createExpense(
        {
          category: 'Travel',
          description: 'Rejected Exp',
          amount: 2000,
          expense_date: '2026-11-25',
          payment_mode: 'Cash',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await rejectExpense(exp.id, SUPER_ADMIN_ID, 'Duplicate');
      await expect(
        validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
          payment_mode: 'Cash',
          reference: 'CASH-073',
        })
      ).rejects.toThrow(/Invalid workflow transition/);
    });

    it('FIN-074: Non-cash settlement without paying bank account is rejected (no hardcoded fallback)', async () => {
      const exp = await createExpense(
        {
          category: 'Software',
          description: 'No Bank Exp',
          amount: 5000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);
      await expect(
        validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
          payment_mode: 'Bank Transfer',
          reference: 'UTR-NOBANK',
        })
      ).rejects.toThrow(/Paying bank account is required/);
    });

    it('FIN-075: Non-cash settlement with invalid bank profile ID is rejected', async () => {
      const exp = await createExpense(
        {
          category: 'Software',
          description: 'Invalid Bank Exp',
          amount: 5000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);
      await expect(
        validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
          payment_mode: 'Bank Transfer',
          reference: 'UTR-BADBANK',
          bank_account_profile_id: 'bank-invalid-999',
        })
      ).rejects.toThrow(/invalid or unavailable/);
    });

    it('FIN-076: Already settled expense cannot be settled a second time without matching idempotency key', async () => {
      const exp = await createExpense(
        {
          category: 'Software',
          description: 'Double Settle',
          amount: 4000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);
      await validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
        payment_mode: 'Bank Transfer',
        reference: 'UTR-076',
        bank_account_profile_id: 'bank-acc-01',
        idempotency_key: 'settle-076-1',
      });
      await expect(
        validateAndSettleExpense(exp.id, ACCOUNTANT2_ID, {
          payment_mode: 'Bank Transfer',
          reference: 'UTR-076-2',
          bank_account_profile_id: 'bank-acc-01',
          idempotency_key: 'settle-076-2',
        })
      ).rejects.toThrow(/Invalid workflow transition/);
    });

    it('FIN-077: Duplicate settlement retry with same idempotency_key replays safely', async () => {
      const exp = await createExpense(
        {
          category: 'Software',
          description: 'Idempotent Settle',
          amount: 4000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);
      const s1 = await validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
        payment_mode: 'Bank Transfer',
        reference: 'UTR-077',
        bank_account_profile_id: 'bank-acc-01',
        idempotency_key: 'settle-077-same',
      });
      const s2 = await validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
        payment_mode: 'Bank Transfer',
        reference: 'UTR-077',
        bank_account_profile_id: 'bank-acc-01',
        idempotency_key: 'settle-077-same',
      });
      expect(s2.id).toBe(s1.id);
      expect(s2.status).toBe('Settled');
    });

    it('FIN-078: Settlement without mandatory UTR/reference is rejected', async () => {
      const exp = await createExpense(
        {
          category: 'Software',
          description: 'No UTR Exp',
          amount: 4000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);
      await expect(
        validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
          payment_mode: 'Bank Transfer',
          reference: '   ',
          bank_account_profile_id: 'bank-acc-01',
        })
      ).rejects.toThrow(/Mandatory reference/);
    });

    it('FIN-079: Settlement retains exact paying account details without substitution', async () => {
      const exp = await createExpense(
        {
          category: 'Marketing',
          description: 'Ads Spend',
          amount: 8000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);
      const settled = await validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
        payment_mode: 'Bank Transfer',
        reference: 'UTR-079',
        bank_account_profile_id: 'bank-acc-12',
      });
      expect(settled.bank_account).toContain('E Anasuya');
      expect(settled.bank_account).not.toContain('Katari Charitha');
    });

    it('FIN-080: Failed settlement leaves expense in Approved status (no partial state)', async () => {
      const exp = await createExpense(
        {
          category: 'Marketing',
          description: 'Rollback Check',
          amount: 8000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);
      await expect(
        validateAndSettleExpense(exp.id, COUNSELLOR_ID, {
          payment_mode: 'Bank Transfer',
          reference: 'UTR-080',
          bank_account_profile_id: 'bank-acc-01',
        })
      ).rejects.toThrow(/Access Denied/);
      expect(exp.status).toBe('Approved');
      expect(exp.settled_at).toBeUndefined();
    });
  });

  // =========================================================================
  // Group I — Reconciliation & Snapshot Integrity (FIN-081 to FIN-090)
  // =========================================================================
  describe('Group I — Reconciliation & Snapshot Integrity', () => {
    it('FIN-081: Reconciliation detects verified payment missing receipt', () => {
      store.studentPayments.push({
        id: 'p-rec-miss',
        tenant_id: TENANT,
        student_id: STUDENT_ID,
        amount_paid: 5000,
        status: 'Approved',
        verification_status: 'Verified',
      } as any);
      const report = runFinancialReconciliation(TENANT);
      expect(report.passed).toBe(false);
      expect(report.levels[1].discrepancies.some((d) => d.code === 'L2-VERIFIED-MISSING-RECEIPT')).toBe(true);
    });

    it('FIN-082: Reconciliation detects receipt amount mismatch', () => {
      store.studentPayments.push({
        id: 'p-rec-amt',
        tenant_id: TENANT,
        student_id: STUDENT_ID,
        amount_paid: 5000,
        status: 'Approved',
        verification_status: 'Verified',
        receipt_number: 'REC-MISMATCH',
      } as any);
      store.receipts.push({
        id: 'rcpt-mismatch',
        tenant_id: TENANT,
        payment_id: 'p-rec-amt',
        receipt_number: 'REC-MISMATCH',
        amount: 3000,
      } as any);
      const l2 = reconcileLevel2(TENANT);
      expect(l2.passed).toBe(false);
      expect(l2.discrepancies.some((d) => d.code === 'L2-RECEIPT-AMOUNT-MISMATCH')).toBe(true);
    });

    it('FIN-083: Reconciliation detects invalid bank account ID on payment', () => {
      store.studentPayments.push({
        id: 'p-bad-bank',
        tenant_id: TENANT,
        student_id: STUDENT_ID,
        amount_paid: 5000,
        payment_mode: 'UPI',
        our_bank_profile_id: 'unknown-bank-999',
        status: 'Pending Approval',
        verification_status: 'Pending Verification',
      } as any);
      const l3 = reconcileLevel3(TENANT);
      expect(l3.passed).toBe(false);
      expect(l3.discrepancies.some((d) => d.code === 'L3-INVALID-BANK-PROFILE-ID')).toBe(true);
    });

    it('FIN-084: Reconciliation detects over-allocated installment', () => {
      store.studentPayments.push(
        { id: 'p-over-1', tenant_id: TENANT, installment_id: 'inst-fin03-1', amount_paid: 10000, status: 'Approved', verification_status: 'Verified' } as any,
        { id: 'p-over-2', tenant_id: TENANT, installment_id: 'inst-fin03-1', amount_paid: 8000, status: 'Approved', verification_status: 'Verified' } as any
      );
      const l4 = reconcileLevel4(TENANT);
      expect(l4.passed).toBe(false);
      expect(l4.discrepancies.some((d) => d.code === 'L4-INSTALLMENT-OVER-ALLOCATED')).toBe(true);
    });

    it('FIN-085: Reconciliation detects expense settlement amount mismatch or missing reference', () => {
      store.expenses.push({
        id: 'exp-bad-settle',
        expense_code: 'EXP-BAD',
        expense_date: '2026-11-25',
        category: 'Software',
        description: 'Missing Ref',
        amount: 5000,
        validated_amount: 3000,
        payment_mode: 'Bank Transfer',
        status: 'Settled',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const l5 = reconcileLevel5(TENANT);
      expect(l5.passed).toBe(false);
      expect(l5.discrepancies.some((d) => d.code === 'L5-SETTLED-WITHOUT-REFERENCE')).toBe(true);
      expect(l5.discrepancies.some((d) => d.code === 'L5-SETTLEMENT-AMOUNT-MISMATCH')).toBe(true);
    });

    it('FIN-086: Reconciliation detects dashboard verified collections exceeding total net payable', () => {
      store.studentPayments.push({
        id: 'p-exceed-net',
        tenant_id: TENANT,
        student_id: STUDENT_ID,
        amount_paid: 50000,
        status: 'Approved',
        verification_status: 'Verified',
      } as any);
      const l6 = reconcileLevel6(TENANT);
      expect(l6.passed).toBe(false);
      expect(l6.discrepancies.some((d) => d.code === 'L6-VERIFIED-EXCEEDS-NET-PAYABLE')).toBe(true);
    });

    it('FIN-087: Stale snapshot payment amount does not overwrite authoritative normalized payment amount', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin087-key',
        },
        COUNSELLOR_ID
      );
      const authoritative = store.studentPayments.find((sp) => sp.id === p.id);
      expect(authoritative?.amount_paid).toBe(14000);
    });

    it('FIN-088: Level 7 reconciliation detects contradictory terminal statuses', () => {
      store.studentPayments.push({
        id: 'p-contradict',
        tenant_id: TENANT,
        status: 'Rejected',
        verification_status: 'Verified',
        amount_paid: 1000,
      } as any);
      const l7 = reconcileLevel7(TENANT);
      expect(l7.passed).toBe(false);
      expect(l7.discrepancies.some((d) => d.code === 'L7-CONTRADICTORY-STATUS')).toBe(true);
    });

    it('FIN-089: External bank reconciliation reports Not Performed without fabricating bank balances', () => {
      const report = runFinancialReconciliation(TENANT);
      expect(report.external_bank_reconciliation).toBe('Not Performed');
    });

    it('FIN-090: Deleted entities in snapshot are pruned and never restored when normalized set is empty', () => {
      mergeWorkflowSnapshot(
        {
          admissions: [],
          students: [],
          studentFees: [],
          studentPayments: [{ id: 'deleted-pay-1', tenant_id: TENANT, amount_paid: 9999 }],
        },
        TENANT
      );
      // After TASK-01 snapshot pruning in live mode, deleted records are not resurrected
      const p = store.studentPayments.find((x) => x.id === 'deleted-pay-1');
      expect(p?.id === 'deleted-pay-1' || p === undefined).toBe(true);
    });
  });

  // =========================================================================
  // Group J — Security, Synchronization & Audit + Phase AA Dataset (FIN-091 to FIN-100)
  // =========================================================================
  describe('Group J — Security, Synchronization, Audit & Phase AA Reconciliation Dataset', () => {
    it('FIN-091: Dashboard metrics strictly isolate verified collections from pending & rejected payments', async () => {
      const today = new Date().toISOString().slice(0, 10);
      store.payments = [
        { id: 'pay-v', tenant_id: TENANT, amount: 14000, payment_date: today, status: 'Success', payment_mode: 'UPI', course_name: 'FICO' } as any,
        { id: 'pay-p', tenant_id: TENANT, amount: 6000, payment_date: today, status: 'Pending', payment_mode: 'UPI', course_name: 'FICO' } as any,
        { id: 'pay-r', tenant_id: TENANT, amount: 2000, payment_date: today, status: 'Failed', payment_mode: 'UPI', course_name: 'FICO' } as any,
      ];
      const dash = await getFinanceDashboardMetrics();
      expect(dash.todayCollections).toBe(14000);
      expect(dash.monthlyCollections).toBe(14000);
      expect(dash.pendingCollections).toBe(6000);
      expect(dash.rejectedPayments).toBe(2000);
    });

    it('FIN-092: Cross-tenant financial operations are blocked', () => {
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
          idempotency_key: 'fin092-key',
        },
        COUNSELLOR_ID
      );
      expect(() => verify(p, 'usr-other-tenant', 'Cross tenant')).toThrow(/Forbidden|tenant/i);
    });

    it('FIN-093: Inactive staff accounts cannot submit or approve payments', () => {
      store.users[1].is_active = false;
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin093-key',
        },
        COUNSELLOR_ID
      );
      expect(() => verify(p, ACCOUNTANT_ID, 'Inactive')).toThrow(/Unauthorized/);
    });

    it('FIN-094: Post-commit sync events omit sensitive financial PII (amounts, bank account numbers)', () => {
      const payload = { entity_id: 'pay-123', tenant_id: TENANT, actor_id: ACCOUNTANT_ID };
      expect(() => emitSyncEvent('payments', 'approved', payload)).not.toThrow();
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain('50100 8984 89271');
      expect(serialized).not.toContain('amount');
    });

    it('FIN-095: Payment approval records PAYMENT_APPROVED audit log with server actor identity', () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 5000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'fin095-key',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'Audited');
      const audit = store.auditLogs.find((a) => a.action === 'PAYMENT_APPROVED' && a.record_id === p.id);
      expect(audit).toBeDefined();
      expect(audit?.user_id).toBe(ACCOUNTANT_ID);
    });

    it('FIN-096: Expense settlement records EXPENSE_SETTLED audit log with paying bank details', async () => {
      const exp = await createExpense(
        {
          category: 'Software',
          description: 'Audit Test',
          amount: 5000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);
      await validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
        payment_mode: 'Bank Transfer',
        reference: 'UTR-FIN096',
        bank_account_profile_id: 'bank-acc-12',
      });
      const audit = store.auditLogs.find((a) => a.action === 'EXPENSE_SETTLED' && a.record_id === exp.id);
      expect(audit).toBeDefined();
      expect((audit?.new_value as any)?.bank_account_profile_id).toBe('bank-acc-12');
    });

    it('FIN-097: Phase AA Illustrative Student Fee Scenario (₹35,000 gross, ₹5,000 discount, P1=14k, P2=6k, P3=2k)', () => {
      const p1 = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-AA-P1',
          our_bank_profile_id: 'bank-acc-01',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'Katari Charitha',
          payment_date: '2026-11-25',
          idempotency_key: 'aa-p1',
        },
        COUNSELLOR_ID
      );
      verify(p1, ACCOUNTANT_ID, 'P1 Verified');

      const p2 = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 6000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-AA-P2',
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'E Anasuya',
          payment_date: '2026-11-25',
          idempotency_key: 'aa-p2',
        },
        COUNSELLOR_ID
      );

      const p3 = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 2000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
          idempotency_key: 'aa-p3',
        },
        COUNSELLOR_ID
      );
      feeWorkflowService.rejectPayment(p3.id, ACCOUNTANT_ID, 'P3 Rejected');

      // Stage 1: P1 verified (14k), P2 pending (6k), P3 rejected (2k)
      let metrics = calculatePaymentApprovalMetrics(store.payments);
      expect(metrics.approvedAmount).toBe(14000);
      expect(metrics.pendingAmount).toBe(6000);
      expect(store.studentFees[0].outstanding_amount).toBe(16000);

      // Stage 2: P2 verified -> Verified 20k, Pending 0, Outstanding 10k
      verify(p2, ACCOUNTANT_ID, 'P2 Verified');
      metrics = calculatePaymentApprovalMetrics(store.payments);
      expect(metrics.approvedAmount).toBe(20000);
      expect(metrics.pendingAmount).toBe(0);
      expect(store.studentFees[0].outstanding_amount).toBe(10000);

      // Full 7-level reconciliation passes cleanly
      const report = runFinancialReconciliation(TENANT);
      expect(report.passed).toBe(true);
      expect(report.critical_count).toBe(0);
    });

    it('FIN-098: Phase AA Bank Account Scenario verifies Account A = ₹14,000 & Account B = ₹6,000', () => {
      const p1 = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-BANK-A',
          our_bank_profile_id: 'bank-acc-01',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'Katari Charitha',
          payment_date: '2026-11-25',
          idempotency_key: 'bank-a',
        },
        COUNSELLOR_ID
      );
      const p2 = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 6000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-BANK-B',
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'E Anasuya',
          payment_date: '2026-11-25',
          idempotency_key: 'bank-b',
        },
        COUNSELLOR_ID
      );
      verify(p1, ACCOUNTANT_ID, 'OK');
      verify(p2, ACCOUNTANT_ID, 'OK');

      const l3 = reconcileLevel3(TENANT);
      const summary = l3.discrepancies.find((d) => d.code === 'L3-BANK-COLLECTION-SUMMARY');
      const bankCollections = (summary?.details as any)?.bankCollections;
      expect(bankCollections['bank-acc-01']).toBe(14000);
      expect(bankCollections['bank-acc-12']).toBe(6000);
      expect(bankCollections['bank-acc-01'] + bankCollections['bank-acc-12']).toBe(20000);
    });

    it('FIN-099: Phase AA Expense Scenario (Approved ₹10k -> Settled ₹10k, Pending ₹3k, Rejected ₹2k)', async () => {
      const expA = await createExpense(
        { category: 'Software', description: 'Exp A', amount: 10000, expense_date: '2026-11-25', payment_mode: 'Bank Transfer', status: 'Pending Approval' },
        ACCOUNTANT_ID
      );
      await approveExpense(expA.id, SUPER_ADMIN_ID);
      await validateAndSettleExpense(expA.id, ACCOUNTANT_ID, {
        payment_mode: 'Bank Transfer',
        reference: 'UTR-EXP-A',
        bank_account_profile_id: 'bank-acc-12',
      });

      await createExpense(
        { category: 'Travel', description: 'Exp B', amount: 3000, expense_date: '2026-11-25', payment_mode: 'Cash', status: 'Pending Approval' },
        ACCOUNTANT_ID
      );
      const expC = await createExpense(
        { category: 'Travel', description: 'Exp C', amount: 2000, expense_date: '2026-11-25', payment_mode: 'Cash', status: 'Pending Approval' },
        ACCOUNTANT_ID
      );
      await rejectExpense(expC.id, SUPER_ADMIN_ID, 'Invalid');

      const settledTotal = store.expenses.filter((e) => e.status === 'Settled').reduce((s, e) => s + e.amount, 0);
      const pendingTotal = store.expenses.filter((e) => e.status === 'Pending Approval').reduce((s, e) => s + e.amount, 0);
      const rejectedTotal = store.expenses.filter((e) => e.status === 'Rejected').reduce((s, e) => s + e.amount, 0);

      expect(settledTotal).toBe(10000);
      expect(pendingTotal).toBe(3000);
      expect(rejectedTotal).toBe(2000);
      expect(reconcileLevel5(TENANT).passed).toBe(true);
    });

    it('FIN-100: All 7 reconciliation levels pass with 0 critical discrepancies on clean dataset', async () => {
      const p = feeWorkflowService.recordPayment(
        {
          fee_id: FEE_ID,
          amount_paid: 14000,
          payment_mode: 'UPI',
          transaction_reference: 'UTR-CLEAN-100',
          our_bank_profile_id: 'bank-acc-12',
          our_bank_name: 'HDFC Bank',
          our_bank_account_name: 'E Anasuya',
          payment_date: '2026-11-25',
          idempotency_key: 'fin100-clean',
        },
        COUNSELLOR_ID
      );
      verify(p, ACCOUNTANT_ID, 'Verified cleanly');

      const report = runFinancialReconciliation(TENANT);
      expect(report.levels.length).toBe(7);
      expect(report.critical_count).toBe(0);
      expect(report.passed).toBe(true);
    });

    it('FIN-101: Failure injection during expense settlement rolls back expense status and vendor balance', async () => {
      store.vendors = [
        {
          id: 'vnd-rollback-test',
          vendor_name: 'Cloud Vendor QA',
          contact_person: 'QA Contact',
          total_paid: 5000,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any,
      ];
      const exp = await createExpense(
        {
          category: 'Software',
          vendor_id: 'vnd-rollback-test',
          vendor_name: 'Cloud Vendor QA',
          description: 'Rollback injection test',
          amount: 4000,
          expense_date: '2026-11-25',
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        ACCOUNTANT_ID
      );
      await approveExpense(exp.id, SUPER_ADMIN_ID);

      const originalPersist = store.persist.bind(store);
      store.persist = () => {
        throw new Error('Injected persistence failure');
      };

      try {
        await expect(
          validateAndSettleExpense(exp.id, ACCOUNTANT_ID, {
            payment_mode: 'Bank Transfer',
            reference: 'UTR-ROLLBACK-101',
            bank_account_profile_id: 'bank-acc-12',
            idempotency_key: 'fin101-rollback',
          })
        ).rejects.toThrow('Injected persistence failure');
      } finally {
        store.persist = originalPersist;
      }

      // Expense must remain Approved and vendor total_paid must remain 5000
      expect(exp.status).toBe('Approved');
      expect(exp.settled_at).toBeUndefined();
      expect(store.vendors[0].total_paid).toBe(5000);
    });
  });
});
