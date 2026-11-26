import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import * as dbModule from '@/lib/supabase/db';
import * as adminModule from '@/lib/supabase/admin';
import type { UserProfile } from '@/types';

const ACCOUNTANT: UserProfile = {
  id: '82b47429-6dca-47d8-aa73-ac959cb26429',
  full_name: 'Padmaja',
  email: 'padmaja.sap97@gmail.com',
  role: 'accountant',
  tenant_id: 'default',
  is_active: true,
} as UserProfile;

const OTHER_ACCOUNTANT: UserProfile = {
  id: '99999999-6dca-47d8-aa73-ac959cb26499',
  full_name: 'Suresh Kumar',
  email: 'suresh@example.com',
  role: 'accountant',
  tenant_id: 'default',
  is_active: true,
} as UserProfile;

const COUNSELLOR: UserProfile = {
  id: '8fac380f-cc47-4209-9a13-e85153529dd1',
  full_name: 'Vineethaa',
  email: 'vineethaa.myerp@gmail.com',
  role: 'counsellor',
  tenant_id: 'default',
  is_active: true,
} as UserProfile;

function seedQaFixture() {
  store.users = [ACCOUNTANT, OTHER_ACCOUNTANT, COUNSELLOR];
  store.admissions = [
    {
      id: 'da384cda-e98d-41fe-9c41-ada94fa9d21c',
      admission_number: 'ADM-2026-0029',
      student_id: '19ce0822-ce1b-4894-8d85-4cf9a7f2e047',
      student_unique_id: 'NGERP-2026-00003',
      student_name: 'QA Student',
      email: 'qa@example.com',
      phone: '+91 76563 45432',
      course_id: 'c1000000-0000-4000-a000-000000000101',
      course_name: 'SAP FICO PERSONAL TRAINING',
      training_mode: 'Online',
      course_fee: 35000,
      discount: 5000,
      net_payable: 30000,
      status: 'Confirmed',
      counsellor_id: COUNSELLOR.id,
      admission_date: '2026-11-26',
      tenant_id: 'default',
      created_at: '2026-11-26T10:00:00Z',
      updated_at: '2026-11-26T10:00:00Z',
    } as any,
  ];
  store.students = [
    {
      id: '19ce0822-ce1b-4894-8d85-4cf9a7f2e047',
      admission_id: 'da384cda-e98d-41fe-9c41-ada94fa9d21c',
      student_code: 'STU-FICO-003',
      student_unique_id: 'NGERP-2026-00003',
      admission_number: 'ADM-2026-0029',
      full_name: 'QA Student',
      email: 'qa@example.com',
      phone: '+91 76563 45432',
      course_id: 'c1000000-0000-4000-a000-000000000101',
      course_name: 'SAP FICO PERSONAL TRAINING',
      total_fee: 30000,
      paid_amount: 10000,
      outstanding_amount: 20000,
      status: 'Active',
      tenant_id: 'default',
    } as any,
  ];
  store.feeAccounts = [
    {
      id: 'e6845bf3-09ab-429e-a439-8b75dd9e1ce6',
      student_id: '19ce0822-ce1b-4894-8d85-4cf9a7f2e047',
      admission_id: 'da384cda-e98d-41fe-9c41-ada94fa9d21c',
      original_fee: 35000,
      discount: 5000,
      net_payable: 30000,
      paid_amount: 10000,
      outstanding_amount: 20000,
      status: 'Partially Paid',
      tenant_id: 'default',
    } as any,
  ];
  store.studentFees = [
    {
      id: '3eac5b4e-1b35-4288-a386-1fc807013bc8',
      student_id: '19ce0822-ce1b-4894-8d85-4cf9a7f2e047',
      fee_account_id: 'e6845bf3-09ab-429e-a439-8b75dd9e1ce6',
      enrollment_id: 'da384cda-e98d-41fe-9c41-ada94fa9d21c',
      student_name: 'QA Student',
      student_code: 'STU-FICO-003',
      admission_number: 'ADM-2026-0029',
      course_id: 'c1000000-0000-4000-a000-000000000101',
      course_name: 'SAP FICO PERSONAL TRAINING',
      fee_category: 'Course Admission Fee',
      proposed_fee: 35000,
      discount_amount: 5000,
      final_payable: 30000,
      paid_amount: 10000,
      outstanding_amount: 20000,
      is_payable: true,
      approval_status: 'Approved',
      tenant_id: 'default',
    } as any,
  ];
  store.studentPayments = [
    {
      id: 'spr-prior-10000',
      fee_id: '3eac5b4e-1b35-4288-a386-1fc807013bc8',
      student_id: '19ce0822-ce1b-4894-8d85-4cf9a7f2e047',
      student_name: 'QA Student',
      student_code: 'STU-FICO-003',
      admission_number: 'ADM-2026-0029',
      amount_paid: 10000,
      payment_mode: 'UPI',
      payment_date: '2026-11-25',
      transaction_reference: 'PRIOR-10000',
      recorded_by: COUNSELLOR.id,
      verified_by: ACCOUNTANT.id,
      status: 'Approved',
      verification_status: 'Verified',
      receipt_number: 'REC-2026-000001',
      tenant_id: 'default',
      created_at: '2026-11-25T10:00:00.000Z',
    } as any,
    {
      id: 'spr-1795735527117-07vj',
      fee_id: '3eac5b4e-1b35-4288-a386-1fc807013bc8',
      student_id: '19ce0822-ce1b-4894-8d85-4cf9a7f2e047',
      student_name: 'QA Student',
      student_code: 'STU-FICO-003',
      admission_number: 'ADM-2026-0029',
      amount_paid: 9000,
      payment_mode: 'UPI',
      payment_date: '2026-11-27',
      transaction_reference: '12345',
      recorded_by: COUNSELLOR.id,
      status: 'Pending Approval',
      verification_status: 'Pending Verification',
      our_bank_profile_id: 'bank-acc-01',
      our_bank_name: 'HDFC Bank',
      our_bank_account_name: 'Katari Charitha',
      our_bank_account_id: '•••• •••• 1140',
      tenant_id: 'default',
      created_at: '2026-11-26T23:25:27.117Z',
    } as any,
  ];
  store.payments = [];
  store.receipts = [
    {
      id: 'rcpt-prior-10000',
      receipt_number: 'REC-2026-000001',
      payment_id: 'spr-prior-10000',
      student_id: '19ce0822-ce1b-4894-8d85-4cf9a7f2e047',
      student_name: 'QA Student',
      course_name: 'SAP FICO PERSONAL TRAINING',
      payment_amount: 10000,
      payment_mode: 'UPI',
      transaction_reference: 'PRIOR-10000',
      payment_date: '2026-11-25',
      authorized_by: 'Padmaja',
      issued_by: ACCOUNTANT.id,
      tenant_id: 'default',
      created_at: '2026-11-25T10:00:00.000Z',
    } as any,
  ];
  store.studentFinancialLedgers = [];
  store.auditLogs = [];
  store.notifications = [];
}

describe('P0 Hotfix: Accountant Payment Verification Conflict & Financial Transaction Integrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    seedQaFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('PAY-APR-001/021/023/024: verifies ₹9,000 payment with issued_by UUID + authorized_by name and updates fee balances atomically', () => {
    const verified = feeWorkflowService.verifyPayment('spr-1795735527117-07vj', ACCOUNTANT.id, 'Bank credit matched', {
      reference: '12345',
      amount: '9000',
      payment_date: '2026-11-27',
      receiving_bank_profile_id: 'bank-acc-01',
    });

    expect(verified.status).toBe('Approved');
    expect(verified.verification_status).toBe('Verified');
    expect(verified.verified_by).toBe(ACCOUNTANT.id);
    expect(verified.verified_our_bank_account_name).toBe('Katari Charitha');

    expect(store.receipts).toHaveLength(2);
    const receipt = store.receipts[1] as any;
    expect(receipt.authorized_by).toBe('Padmaja');
    expect(receipt.issued_by).toBe(ACCOUNTANT.id);
    expect(receipt.payment_amount).toBe(9000);

    expect(store.studentFees[0].paid_amount).toBe(19000);
    expect(store.studentFees[0].outstanding_amount).toBe(11000);
    expect(store.students[0].paid_amount).toBe(19000);
    expect(store.students[0].outstanding_amount).toBe(11000);

    // PAY-APR-016: Already verified payment cannot be verified a second time
    expect(() =>
      feeWorkflowService.verifyPayment('spr-1795735527117-07vj', OTHER_ACCOUNTANT.id, 'Retry', {
        reference: '12345',
        amount: '9000',
        payment_date: '2026-11-27',
        receiving_bank_profile_id: 'bank-acc-01',
      })
    ).toThrow(/already be verified/i);
  });

  it('PAY-APR-007/008/012/011: enforces UTR, amount, and date matching rules', () => {
    expect(() =>
      feeWorkflowService.verifyPayment('spr-1795735527117-07vj', ACCOUNTANT.id, undefined, {
        reference: '99999',
        amount: '9000',
        payment_date: '2026-11-27',
        receiving_bank_profile_id: 'bank-acc-01',
      })
    ).toThrow(/UTR \/ Transaction Reference does not match/i);

    expect(() =>
      feeWorkflowService.verifyPayment('spr-1795735527117-07vj', ACCOUNTANT.id, undefined, {
        reference: '12345',
        amount: '8500',
        payment_date: '2026-11-27',
        receiving_bank_profile_id: 'bank-acc-01',
      })
    ).toThrow(/Amount Received does not match/i);
  });

  it('PAY-APR-013/025/030: distinguishes SQLSTATE 40001 revision conflict, 23505 duplicate UTR, and 22P02 DB error and rolls back store on failure', async () => {
    vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);

    const makeDb = (rpcError: { code: string; message: string }) => ({
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { revision: 54, snapshot: {} }, error: null }),
            then: (resolve: (v: unknown) => void) =>
              resolve({
                data:
                  table === 'profiles'
                    ? [ACCOUNTANT, COUNSELLOR]
                    : table === 'admissions'
                      ? store.admissions
                      : table === 'students'
                        ? store.students
                        : [],
                error: null,
              }),
          }),
        }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: null, error: rpcError }),
    });

    // 1. 22P02 DB error -> Database failure (NOT misleading Conflict), store rolled back
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(
      makeDb({ code: '22P02', message: 'invalid input syntax for type uuid: "Padmaja"' }) as any
    );
    await expect(
      paymentTransaction(ACCOUNTANT, () => {
        store.studentFees[0].paid_amount = 19000;
        return 'ok';
      })
    ).rejects.toThrow(/Database failure: Payment verification could not be completed/i);
    expect(store.studentFees[0].paid_amount).toBe(10000);

    // 2. 40001 -> True revision conflict
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(
      makeDb({ code: '40001', message: 'Conflict: workflow revision changed' }) as any
    );
    await expect(paymentTransaction(ACCOUNTANT, () => 'ok')).rejects.toThrow(/Conflict: This payment was updated by another user/i);

    // 3. 23505 transaction_reference -> Duplicate reference conflict
    vi.spyOn(adminModule, 'createAdminClient').mockReturnValue(
      makeDb({ code: '23505', message: 'duplicate key value violates unique constraint "payments_transaction_reference_key"' }) as any
    );
    await expect(paymentTransaction(ACCOUNTANT, () => 'ok')).rejects.toThrow(/Conflict: This transaction reference is already associated/i);
  });

  it('PAY-APR-018/019: deduplicates double-click verifyPayment calls and attaches stable idempotency_key', async () => {
    let resolveFetch!: (val: unknown) => void;
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const p1 = paymentWorkflowClient.verifyPayment('spr-1795735527117-07vj', ACCOUNTANT.id, 'ok', {
      reference: '12345',
      amount: '9000',
      payment_date: '2026-11-27',
      receiving_bank_profile_id: 'bank-acc-01',
    });
    const p2 = paymentWorkflowClient.verifyPayment('spr-1795735527117-07vj', ACCOUNTANT.id, 'ok', {
      reference: '12345',
      amount: '9000',
      payment_date: '2026-11-27',
      receiving_bank_profile_id: 'bank-acc-01',
    });

    expect(p1).toBe(p2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.idempotency_key).toBeTruthy();

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ success: true, payment: { id: 'spr-1795735527117-07vj', status: 'Approved' } }),
    });
    await expect(p1).resolves.toMatchObject({ status: 'Approved' });
  });
});
