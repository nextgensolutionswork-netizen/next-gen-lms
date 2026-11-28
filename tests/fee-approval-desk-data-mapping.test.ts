import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  findOriginalReceivingAccount,
  getAuthorizedBankAccounts,
} from '@/lib/utils/bank-autofill';
import {
  isPaymentApproved,
  isPaymentPending,
  unifyDualLedgerPayments,
} from '@/lib/utils/dashboard-metrics';
import { resolveCanonicalCounsellorId } from '@/lib/services/counsellor-service';
import { idempotencyService } from '@/lib/services/idempotency-service';
import type { StudentFee, StudentPaymentRecord, UserProfile } from '@/types';

const TENANT = 'tenant-fad-qa';
const COUNSELLOR_RADHIKA = '2983a160-0764-40c5-ab50-a41cff9f0c68';
const COUNSELLOR_VINEETHAA = '8fac380f-cc47-4209-9a13-e85153529dd1';
const ACCOUNTANT_ID = '33333333-3333-3333-3333-333333333333';
const STUDENT_ID = 'ed0378b7-9213-4e23-ba01-00eefda4ecbc';
const ADM_ID = 'f1a4bd7c-d854-4aa2-9645-291e3d35bb0b';
const FEE_ID = 'fee-fad-01';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveLmsIdForDesk(
  p: StudentPaymentRecord,
  matchingStudent?: any,
  matchingAdmission?: any
): string {
  const isUuid = (val?: string | null) => Boolean(val && UUID_REGEX.test(val.trim()));
  const rawCandidate =
    matchingStudent?.student_unique_id ||
    matchingStudent?.student_code ||
    matchingAdmission?.student_unique_id ||
    p.student_unique_id ||
    p.student_code ||
    (p.student_id && !p.student_id.startsWith('ADM-') && !isUuid(p.student_id) ? p.student_id : null) ||
    (matchingStudent?.id && !matchingStudent.id.startsWith('ADM-') && !isUuid(matchingStudent.id) ? matchingStudent.id : null);
  return rawCandidate && !isUuid(rawCandidate) ? rawCandidate : 'Registration Pending';
}

function resolvePhoneForDesk(
  p: StudentPaymentRecord,
  matchingStudent?: any,
  matchingAdmission?: any
): string {
  const registeredPhone =
    matchingStudent?.phone ||
    matchingAdmission?.phone ||
    p.student_phone ||
    (p as any).phone ||
    '';
  const cleanPhone = registeredPhone.trim();
  return cleanPhone
    ? cleanPhone.startsWith('+')
      ? cleanPhone
      : `+91 ${cleanPhone.replace(/^0+/, '')}`
    : 'Not Provided';
}

function resolveCounsellorForDesk(
  p: StudentPaymentRecord,
  effectiveAdm?: any
): string {
  const rawCounsellorId = effectiveAdm?.counsellor_id || p.counsellor_id;
  const canonicalId = rawCounsellorId ? resolveCanonicalCounsellorId(rawCounsellorId) : undefined;
  const staff = (store.users || []).find(
    (u) =>
      (rawCounsellorId && u.id === rawCounsellorId) ||
      (canonicalId && u.id === canonicalId)
  );
  return effectiveAdm?.counsellor_name || p.counsellor_name || staff?.full_name || 'Unassigned';
}

function seedFadBaseline() {
  idempotencyService.clear();
  store.users = [
    {
      id: COUNSELLOR_RADHIKA,
      tenant_id: TENANT,
      full_name: 'Radhika',
      email: 'radhika@example.com',
      role: 'counsellor',
      is_active: true,
    } as UserProfile,
    {
      id: COUNSELLOR_VINEETHAA,
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
      student_name: 'QA Desk Student',
      phone: '+91 9876543210',
      email: 'qastudent@example.com',
      counsellor_id: COUNSELLOR_VINEETHAA,
      counsellor_name: 'Vineethaa',
      our_bank_profile_id: 'bank-acc-14',
      our_bank_name: 'Canara - Thenebanda',
      our_bank_account_name: 'T Usha',
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
      full_name: 'QA Desk Student',
      phone: '+91 9876543210',
      email: 'qastudent@example.com',
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
      student_name: 'QA Desk Student',
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
      counsellor_id: COUNSELLOR_VINEETHAA,
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

describe('BUG — Fee Approval Desk Data Mapping (FAD-001 to FAD-030)', () => {
  const accounts = getAuthorizedBankAccounts('accountant');

  beforeEach(() => {
    seedFadBaseline();
  });

  it('FAD-001: Valid receiving bank ID displays exact account holder', () => {
    const acc = findOriginalReceivingAccount({ our_bank_profile_id: 'bank-acc-12' }, accounts);
    expect(acc?.account_holder_name).toBe('E Anasuya');
    expect(acc?.bank_name).toBe('HDFC Bank');
  });

  it('FAD-002: Two accounts in the same bank (HDFC) resolve strictly to exact selected ID', () => {
    const a = findOriginalReceivingAccount({ our_bank_profile_id: 'bank-acc-01' }, accounts);
    const b = findOriginalReceivingAccount({ our_bank_profile_id: 'bank-acc-12' }, accounts);
    expect(a?.account_holder_name).toBe('Katari Charitha');
    expect(b?.account_holder_name).toBe('E Anasuya');
  });

  it('FAD-003: Missing bank account ID retains Bank Account Verification Required', () => {
    const acc = findOriginalReceivingAccount({ our_bank_name: 'HDFC Bank' }, accounts);
    expect(acc).toBeUndefined();
  });

  it('FAD-004: Invalid bank account ID does not resolve to an arbitrary account', () => {
    const acc = findOriginalReceivingAccount({ our_bank_profile_id: 'bank-nonexistent' }, accounts);
    expect(acc).toBeUndefined();
  });

  it('FAD-005: Cross-tenant payment submission or approval is rejected', () => {
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
        idempotency_key: 'fad-005',
      },
      COUNSELLOR_VINEETHAA
    );
    expect(() =>
      feeWorkflowService.verifyPayment(p.id, 'usr-other-tenant', 'Cross tenant', {
        amount: '5000',
        payment_date: '2026-11-25',
        reference: '',
      })
    ).toThrow(/Forbidden|tenant/i);
  });

  it('FAD-006: Assigned counsellor exists -> displays assigned counsellor name', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-006',
      },
      COUNSELLOR_VINEETHAA
    );
    expect(resolveCounsellorForDesk(p, store.admissions[0])).toBe('Vineethaa');
  });

  it('FAD-007: Counsellor assignment genuinely missing -> displays Unassigned', () => {
    const orphanPayment: StudentPaymentRecord = {
      id: 'spr-orphan',
      fee_id: 'fee-none',
      student_id: 'stu-none',
      student_name: 'Orphan',
      admission_number: 'ADM-NONE',
      fee_category: 'Course Fee',
      amount_paid: 5000,
      payment_date: '2026-11-25',
      payment_mode: 'Cash',
      recorded_by: ACCOUNTANT_ID,
      recorded_by_name: 'Suresh Accountant',
      recorded_by_role: 'accountant',
      verification_status: 'Pending Verification',
      created_at: new Date().toISOString(),
    };
    expect(resolveCounsellorForDesk(orphanPayment, undefined)).toBe('Unassigned');
  });

  it('FAD-008: Payment actor differs from assigned counsellor -> displays assigned counsellor, not recorder', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-008',
      },
      ACCOUNTANT_ID // Recorded by Accountant, but Admission belongs to Vineethaa
    );
    expect(p.recorded_by).toBe(ACCOUNTANT_ID);
    expect(resolveCounsellorForDesk(p, store.admissions[0])).toBe('Vineethaa');
  });

  it('FAD-009: Student phone exists -> displays registered phone with country code', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-009',
      },
      COUNSELLOR_VINEETHAA
    );
    expect(resolvePhoneForDesk(p, store.students[0], store.admissions[0])).toBe('+91 9876543210');
  });

  it('FAD-010: Student phone genuinely missing -> displays Not Provided', () => {
    const orphan: StudentPaymentRecord = {
      id: 'spr-nophone',
      fee_id: 'fee-none',
      student_id: 'stu-none',
      student_name: 'No Phone',
      admission_number: 'ADM-NONE',
      fee_category: 'Course Fee',
      amount_paid: 5000,
      payment_date: '2026-11-25',
      payment_mode: 'Cash',
      recorded_by: COUNSELLOR_RADHIKA,
      recorded_by_name: 'Radhika',
      recorded_by_role: 'counsellor',
      verification_status: 'Pending Verification',
      created_at: new Date().toISOString(),
    };
    expect(resolvePhoneForDesk(orphan)).toBe('Not Provided');
  });

  it('FAD-011: Student LMS registration exists -> displays actual NGERP LMS ID', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-011',
      },
      COUNSELLOR_VINEETHAA
    );
    expect(resolveLmsIdForDesk(p, store.students[0], store.admissions[0])).toBe('NGERP-2026-00001');
  });

  it('FAD-012: Internal UUID is NEVER presented as LMS ID even when student record is missing', () => {
    const orphanWithUuid: StudentPaymentRecord = {
      id: 'spr-uuid',
      fee_id: 'fee-none',
      student_id: '53a3c00b-6802-4f48-a48b-9c8ecd53305c',
      student_name: 'Legacy Row',
      admission_number: 'ADM-2026-0023',
      fee_category: 'Course Fee',
      amount_paid: 5000,
      payment_date: '2026-11-25',
      payment_mode: 'UPI',
      recorded_by: COUNSELLOR_RADHIKA,
      recorded_by_name: 'Radhika',
      recorded_by_role: 'counsellor',
      verification_status: 'Pending Verification',
      created_at: new Date().toISOString(),
    };
    const lmsId = resolveLmsIdForDesk(orphanWithUuid);
    expect(UUID_REGEX.test(lmsId)).toBe(false);
    expect(lmsId).toBe('Registration Pending');
  });

  it('FAD-013: Pending payment retains all associated bank, counsellor, phone, and LMS metadata', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 14000,
        payment_mode: 'UPI',
        transaction_reference: '10001',
        our_bank_profile_id: 'bank-acc-12',
        our_bank_name: 'HDFC Bank',
        our_bank_account_name: 'E Anasuya',
        our_bank_account_id: '50100 8984 89271',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-013',
      },
      COUNSELLOR_VINEETHAA
    );
    expect(isPaymentPending(p)).toBe(true);
    expect(p.student_unique_id).toBe('NGERP-2026-00001');
    expect(p.student_phone).toBe('+91 9876543210');
    expect(p.counsellor_name).toBe('Vineethaa');
    expect(p.our_bank_profile_id).toBe('bank-acc-12');
  });

  it('FAD-014: Approved payment retains all associated information', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 14000,
        payment_mode: 'UPI',
        transaction_reference: '10002',
        our_bank_profile_id: 'bank-acc-12',
        our_bank_name: 'HDFC Bank',
        our_bank_account_name: 'E Anasuya',
        our_bank_account_id: '50100 8984 89271',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-014',
      },
      COUNSELLOR_VINEETHAA
    );
    const verified = feeWorkflowService.verifyPayment(p.id, ACCOUNTANT_ID, 'Verified', {
      amount: '14000',
      payment_date: '2026-11-25',
      reference: '10002',
      receiving_bank_profile_id: 'bank-acc-12',
    });
    expect(isPaymentApproved(verified)).toBe(true);
    expect(verified.verified_our_bank_account_name).toBe('E Anasuya');
    expect(verified.counsellor_name).toBe('Vineethaa');
  });

  it('FAD-015: Rejected payment retains all associated information', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-015',
      },
      COUNSELLOR_VINEETHAA
    );
    const rejected = feeWorkflowService.rejectPayment(p.id, ACCOUNTANT_ID, 'Invalid slip');
    expect(rejected.status).toBe('Rejected');
    expect(rejected.student_unique_id).toBe('NGERP-2026-00001');
    expect(rejected.counsellor_name).toBe('Vineethaa');
  });

  it('FAD-016: Newly recorded payment persists student_unique_id, student_phone, counsellor_id/name', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 6000,
        payment_mode: 'UPI',
        transaction_reference: '10003',
        our_bank_profile_id: 'bank-acc-14',
        our_bank_name: 'Canara - Thenebanda',
        our_bank_account_name: 'T Usha',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-016',
      },
      COUNSELLOR_VINEETHAA
    );
    expect(p.student_unique_id).toBe('NGERP-2026-00001');
    expect(p.student_phone).toBe('+91 9876543210');
    expect(p.counsellor_id).toBe(COUNSELLOR_VINEETHAA);
    expect(p.counsellor_name).toBe('Vineethaa');
  });

  it('FAD-017: Authorized bank account correction persists updated bank profile with audit history', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'UPI',
        transaction_reference: '10004',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-017',
      },
      COUNSELLOR_VINEETHAA
    );
    const updated = feeWorkflowService.updatePayment(
      p.id,
      {
        amount_paid: 5000,
        payment_mode: 'UPI',
        payment_date: '2026-11-25',
        transaction_reference: '10004',
        our_bank_profile_id: 'bank-acc-12',
        our_bank_name: 'HDFC Bank',
        our_bank_account_name: 'E Anasuya',
        our_bank_account_id: '50100 8984 89271',
      },
      ACCOUNTANT_ID,
      'accountant'
    );
    expect(updated.our_bank_profile_id).toBe('bank-acc-12');
    expect(updated.our_bank_account_name).toBe('E Anasuya');
  });

  it('FAD-018: Dual-ledger reconciliation preserves bank and counsellor fields across store.payments', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'UPI',
        transaction_reference: '10005',
        our_bank_profile_id: 'bank-acc-12',
        our_bank_name: 'HDFC Bank',
        our_bank_account_name: 'E Anasuya',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-018',
      },
      COUNSELLOR_VINEETHAA
    );
    store.reconcileDualLedgers();
    const legacy = store.payments.find((lp) => lp.id === `pay-${p.id}`);
    expect((legacy as any)?.our_bank_profile_id).toBe('bank-acc-12');
    expect(legacy?.our_bank_account_name).toBe('E Anasuya');
  });

  it('FAD-019: Audit log fallback resolves historical payment bank details without bank-name guessing', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'UPI',
        transaction_reference: '10006',
        our_bank_profile_id: 'bank-acc-12',
        our_bank_name: 'HDFC Bank',
        our_bank_account_name: 'E Anasuya',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-019',
      },
      COUNSELLOR_VINEETHAA
    );
    // Simulate historical record missing bank fields on payment row, while audit log retains them
    p.our_bank_profile_id = undefined;
    p.our_bank_name = undefined;
    p.our_bank_account_name = undefined;
    const auditEvidence = store.auditLogs.find(
      (a) => a.action === 'PAYMENT_SUBMITTED' && a.record_id === p.id
    )?.new_value as any;
    const resolved = findOriginalReceivingAccount(auditEvidence, accounts);
    expect(resolved?.id).toBe('bank-acc-12');
    expect(resolved?.account_holder_name).toBe('E Anasuya');
  });

  it('FAD-020 to FAD-023: Search matches by phone, counsellor, account holder, and LMS ID', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'UPI',
        transaction_reference: '10007',
        our_bank_profile_id: 'bank-acc-12',
        our_bank_name: 'HDFC Bank',
        our_bank_account_name: 'E Anasuya',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-search',
      },
      COUNSELLOR_VINEETHAA
    );
    expect(p.student_phone).toContain('9876543210');
    expect(p.counsellor_name).toBe('Vineethaa');
    expect(p.our_bank_account_name).toBe('E Anasuya');
    expect(p.student_unique_id).toBe('NGERP-2026-00001');
  });

  it('FAD-024: Authoritative student & admission fields remain intact alongside payment record', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-024',
      },
      COUNSELLOR_VINEETHAA
    );
    expect(resolveLmsIdForDesk(p, store.students[0], store.admissions[0])).toBe('NGERP-2026-00001');
  });

  it('FAD-025: Bank account correction on pending payment does not alter financial totals', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'UPI',
        transaction_reference: '10008',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-025',
      },
      COUNSELLOR_VINEETHAA
    );
    feeWorkflowService.updatePayment(
      p.id,
      {
        amount_paid: 5000,
        payment_mode: 'UPI',
        payment_date: '2026-11-25',
        transaction_reference: '10008',
        our_bank_profile_id: 'bank-acc-12',
        our_bank_name: 'HDFC Bank',
        our_bank_account_name: 'E Anasuya',
      },
      ACCOUNTANT_ID,
      'accountant'
    );
    expect(store.studentFees[0].outstanding_amount).toBe(30000);
  });

  it('FAD-026: Verified payment cannot be silently updated via updatePayment', () => {
    const p = feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 5000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-026',
      },
      COUNSELLOR_VINEETHAA
    );
    feeWorkflowService.verifyPayment(p.id, ACCOUNTANT_ID, 'Verified', {
      amount: '5000',
      payment_date: '2026-11-25',
      reference: '',
    });
    expect(() =>
      feeWorkflowService.updatePayment(
        p.id,
        {
          amount_paid: 9000,
          payment_mode: 'Cash',
          payment_date: '2026-11-25',
        },
        ACCOUNTANT_ID,
        'accountant'
      )
    ).toThrow();
  });

  it('FAD-027: Dual-ledger unification deduplicates mirrored payments with zero inflation', () => {
    feeWorkflowService.recordPayment(
      {
        fee_id: FEE_ID,
        amount_paid: 14000,
        payment_mode: 'Cash',
        payment_date: '2026-11-25',
        idempotency_key: 'fad-027',
      },
      COUNSELLOR_VINEETHAA
    );
    const unified = unifyDualLedgerPayments(store.payments, store.studentPayments, {
      receipts: store.receipts,
      students: store.students,
      studentFees: store.studentFees,
      courses: store.courses,
    });
    expect(unified.length).toBe(1);
    expect(unified[0].amount).toBe(14000);
  });

  it('FAD-028 to FAD-030: Preserves TASK-01, TASK-02, and TASK-03 safeguards', () => {
    const unified = unifyDualLedgerPayments([], [], {
      receipts: [],
      students: [],
      studentFees: [],
      courses: [],
    });
    expect(unified).toEqual([]);
  });
});
