import { describe, expect, it, vi, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { validateAndSettleExpense } from '@/lib/services/finance-service';
import { idempotencyService, IdempotencyConflictError } from '@/lib/services/idempotency-service';
import { UserProfile } from '@/types';

const makeActor = (id: string, role: UserProfile['role'], tenant_id = 'default'): UserProfile => ({
  id,
  role,
  tenant_id,
  email: `${id}@nextgen-test.org`,
  full_name: `Staff ${id}`,
  is_active: true,
  created_at: '2026-11-26T00:00:00.000Z',
  updated_at: '2026-11-26T00:00:00.000Z',
});

const counsellor = makeActor('couns-fin-r', 'counsellor');
const accountantA = makeActor('acc-fin-a', 'accountant');
const accountantB = makeActor('acc-fin-b', 'accountant');

describe('TASK-03 Final Closure Risks (FIN-R01, FIN-R02, FIN-R03, FIN-R04, FIN-R06)', () => {
  beforeEach(() => {
    vi.spyOn(store, 'persist').mockImplementation(() => {});
    vi.spyOn(store, 'persistSync').mockReturnValue(true);
    idempotencyService.clear();

    store.users = [counsellor, accountantA, accountantB];
    store.courses = [
      {
        id: 'crs-fico-r',
        course_name: 'SAP FICO QA',
        course_code: 'FICO-QA',
        description: 'QA Course',
        duration_weeks: 12,
        category: 'SAP Functional',
        price: 35000,
        status: 'Published',
        created_at: '2026-11-01',
        updated_at: '2026-11-01',
      } as any,
    ];
    store.admissions = [];
    store.students = [];
    store.feeAccounts = [];
    store.installments = [];
    store.payments = [];
    store.receipts = [];
    store.studentFees = [];
    store.studentPayments = [];
    store.studentFinancialLedgers = [];
    store.onboardingCases = [];
    store.expenses = [];
    store.vendors = [];
    store.auditLogs = [];
  });

  it('FIN-R01 & FIN-R03: Crash-after-commit and cache-expiry retry do not duplicate payment or receipt', async () => {
    const admRes = await createAdmissionWorkflow(
      {
        student_name: 'Crash Test Student',
        dob: '1998-01-15',
        gender: 'Male',
        phone: '9876543210',
        email: 'crash@example.com',
        address: '100 QA St',
        city: 'Hyderabad',
        education: 'B.Com',
        experience_years: 1,
        current_employment_status: 'Student',
        admission_date: '2026-11-26',
        course_id: 'crs-fico-r',
        course_fee: 35000,
        discount: 5000,
        payment_plan: 'Full Payment',
        collect_initial_payment: true,
        initial_payment_amount: 14000,
        payment_mode: 'UPI',
        transaction_reference: 'UTR-CRASH-1',
        our_bank_profile_id: 'bank-acc-14',
      },
      counsellor.id,
      true
    );

    const pay = store.studentPayments.find((p) => p.student_id === admRes.student.id)!;
    expect(pay).toBeDefined();

    // Approve payment once
    const verif1 = {
      reference: 'UTR-CRASH-1',
      amount: '14000',
      payment_date: pay.payment_date || '2026-11-26',
      receiving_bank_profile_id: 'bank-acc-14',
    };
    const approved = feeWorkflowService.verifyPayment(pay.id, accountantA.id, 'Approved once', verif1);
    expect(approved.verification_status).toBe('Verified');
    expect(store.receipts).toHaveLength(1);

    // Simulate cache expiry (FIN-R03) & retry after idempotencyService.clear()
    idempotencyService.clear();
    expect(() =>
      feeWorkflowService.verifyPayment(pay.id, accountantA.id, 'Retry after cache expiry', verif1)
    ).toThrow();

    expect(store.receipts).toHaveLength(1);
    const fee = store.studentFees.find((f) => f.student_id === admRes.student.id)!;
    expect(fee.paid_amount).toBe(14000);
    expect(fee.outstanding_amount).toBe(16000);
  });

  it('FIN-R02: Stale worker fencing rejects conflicting payload and prevents duplicate approval', async () => {
    const admRes = await createAdmissionWorkflow(
      {
        student_name: 'Fence Student',
        dob: '1998-01-15',
        gender: 'Male',
        phone: '9876543211',
        email: 'fence@example.com',
        address: '101 QA St',
        city: 'Hyderabad',
        education: 'B.Com',
        experience_years: 1,
        current_employment_status: 'Student',
        admission_date: '2026-11-26',
        course_id: 'crs-fico-r',
        course_fee: 35000,
        discount: 0,
        payment_plan: 'Full Payment',
        collect_initial_payment: true,
        initial_payment_amount: 10000,
        payment_mode: 'UPI',
        transaction_reference: 'UTR-FENCE-1',
        our_bank_profile_id: 'bank-acc-14',
      },
      counsellor.id,
      true
    );
    const pay = store.studentPayments.find((p) => p.student_id === admRes.student.id)!;
    expect(pay).toBeDefined();

    // Worker A reserves key, then reuses same key with different payload -> 409 conflict
    idempotencyService.acquire('key-fence', accountantA.id, 'default', { paymentId: pay.id, amount: 10000 }, 'verify');
    expect(() =>
      idempotencyService.acquire('key-fence', accountantA.id, 'default', { paymentId: pay.id, amount: 99999 }, 'verify')
    ).toThrow(IdempotencyConflictError);

    // Worker B approves; stale Worker A cannot approve again
    const verifFence = {
      reference: 'UTR-FENCE-1',
      amount: '10000',
      payment_date: pay.payment_date || '2026-11-26',
      receiving_bank_profile_id: 'bank-acc-14',
    };
    feeWorkflowService.verifyPayment(pay.id, accountantB.id, 'Worker B approval', verifFence);
    expect(() =>
      feeWorkflowService.verifyPayment(pay.id, accountantA.id, 'Stale Worker A approval', verifFence)
    ).toThrow();
    expect(store.receipts).toHaveLength(1);
  });

  it('FIN-R04: Expense settlement validates reference, blocks concurrent double-settlement, and rolls back on failure', async () => {
    store.vendors = [
      {
        id: 'vnd-1',
        vendor_name: 'QA Vendor',
        contact_person: 'Contact',
        phone: '9000000001',
        email: 'vnd@example.com',
        category: 'Office Supplies',
        total_paid: 0,
        created_at: '2026-11-01',
        updated_at: '2026-11-01',
      } as any,
    ];
    store.expenses = [
      {
        id: 'exp-r04-1',
        tenant_id: 'default',
        vendor_id: 'vnd-1',
        vendor_name: 'QA Vendor',
        category: 'Office Supplies',
        description: 'Printer Toner',
        amount: 4500,
        expense_date: '2026-11-26',
        status: 'Approved',
        submitted_by: counsellor.id,
        approved_by: accountantA.id,
        created_at: '2026-11-26',
        updated_at: '2026-11-26',
      } as any,
    ];

    // Missing reference must fail without changing status
    await expect(
      validateAndSettleExpense('exp-r04-1', accountantA.id, {
        payment_mode: 'Bank Transfer',
        bank_account_profile_id: 'bank-acc-14',
        reference: '',
        idempotency_key: 'exp-key-empty-ref',
      })
    ).rejects.toThrow();
    expect(store.expenses[0].status).toBe('Approved');

    // Valid settlement succeeds
    const settled = await validateAndSettleExpense('exp-r04-1', accountantA.id, {
      payment_mode: 'Bank Transfer',
      bank_account_profile_id: 'bank-acc-14',
      reference: 'UTR-EXP-12345',
      idempotency_key: 'exp-key-1',
    });
    expect(settled.status).toBe('Settled');

    // Different key on already-settled expense fails
    await expect(
      validateAndSettleExpense('exp-r04-1', accountantB.id, {
        payment_mode: 'Cash',
        reference: 'CASH-VOUCHER-02',
        idempotency_key: 'exp-key-2',
      })
    ).rejects.toThrow();
  });

  it('FIN-R06: Controlled financial calculation (35k gross, 5k discount, 14k verified, 6k pending, 2k rejected)', async () => {
    const admRes = await createAdmissionWorkflow(
      {
        student_name: 'Calc QA Student',
        dob: '1998-01-15',
        gender: 'Male',
        phone: '9876543212',
        email: 'calc@example.com',
        address: '102 QA St',
        city: 'Hyderabad',
        education: 'B.Com',
        experience_years: 1,
        current_employment_status: 'Student',
        admission_date: '2026-11-26',
        course_id: 'crs-fico-r',
        course_fee: 35000,
        discount: 5000,
        payment_plan: 'Full Payment',
        collect_initial_payment: true,
        initial_payment_amount: 14000,
        payment_mode: 'UPI',
        transaction_reference: 'UTR-CALC-P1',
        our_bank_profile_id: 'bank-acc-14',
      },
      counsellor.id,
      true
    );
    const sid = admRes.student.id;
    const fee = store.studentFees.find((f) => f.student_id === sid)!;
    const p1 = store.studentPayments.find((p) => p.student_id === sid)!;
    feeWorkflowService.verifyPayment(p1.id, accountantA.id, 'Verify P1', {
      reference: 'UTR-CALC-P1',
      amount: '14000',
      payment_date: p1.payment_date || '2026-11-26',
      receiving_bank_profile_id: 'bank-acc-14',
    });

    // Record P2 (6,000 Pending) and P3 (2,000 Rejected)
    const p2 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        student_id: sid,
        amount_paid: 6000,
        payment_mode: 'UPI',
        bank_upi_reference: 'UTR-CALC-P2',
        payment_date: '2026-11-26',
        our_bank_profile_id: 'bank-acc-14',
        idempotency_key: 'idemp-calc-p2',
      },
      counsellor.id,
      counsellor.role
    );
    const p3 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        student_id: sid,
        amount_paid: 2000,
        payment_mode: 'UPI',
        bank_upi_reference: 'UTR-CALC-P3',
        payment_date: '2026-11-26',
        our_bank_profile_id: 'bank-acc-14',
        idempotency_key: 'idemp-calc-p3',
      },
      counsellor.id,
      counsellor.role
    );
    feeWorkflowService.rejectPayment(p3.id, accountantA.id, 'Invalid UTR');

    const summarize = () => {
      const stuPays = store.studentPayments.filter((p) => p.student_id === sid);
      const verified = stuPays.filter((p) => p.verification_status === 'Verified').reduce((s, p) => s + p.amount_paid, 0);
      const pending = stuPays.filter((p) => p.verification_status === 'Pending Verification').reduce((s, p) => s + p.amount_paid, 0);
      const rejected = stuPays.filter((p) => p.verification_status === 'Rejected').reduce((s, p) => s + p.amount_paid, 0);
      const recorded = stuPays.reduce((s, p) => s + p.amount_paid, 0);
      const curFee = store.studentFees.find((f) => f.student_id === sid)!;
      return { verified, pending, rejected, recorded, outstanding: curFee.outstanding_amount };
    };

    expect(summarize()).toEqual({
      verified: 14000,
      pending: 6000,
      rejected: 2000,
      recorded: 22000,
      outstanding: 16000,
    });

    // Approve P2 (6,000)
    const verifP2 = {
      reference: 'UTR-CALC-P2',
      amount: '6000',
      payment_date: '2026-11-26',
      receiving_bank_profile_id: 'bank-acc-14',
    };
    feeWorkflowService.verifyPayment(p2.id, accountantA.id, 'Verify P2', verifP2);
    expect(summarize()).toEqual({
      verified: 20000,
      pending: 0,
      rejected: 2000,
      recorded: 22000,
      outstanding: 10000,
    });
    expect(store.receipts.filter((r) => r.student_id === sid)).toHaveLength(2);

    // Repeat approval -> no duplicate receipt or balance reduction
    expect(() =>
      feeWorkflowService.verifyPayment(p2.id, accountantB.id, 'Duplicate verify P2', verifP2)
    ).toThrow();
    expect(summarize().outstanding).toBe(10000);
    expect(store.receipts.filter((r) => r.student_id === sid)).toHaveLength(2);
  });
});
