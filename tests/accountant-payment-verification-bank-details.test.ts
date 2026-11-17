import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService as fees } from '@/lib/services/fee-workflow-service';
import { POST } from '@/app/api/fees/payments/route';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { getAuthorizedBankAccounts, findOriginalReceivingAccount } from '@/lib/utils/bank-autofill';
import { StudentFee, UserProfile } from '@/types';
import { NextRequest } from 'next/server';

const profile = (id: string, role: UserProfile['role'], tenant_id = 'default'): UserProfile => ({
  id,
  role,
  tenant_id,
  email: `${id}@example.test`,
  full_name: id,
  is_active: true,
  created_at: '2026-10-12',
  updated_at: '2026-10-12',
});

const counsellor = profile('counsellor-1', 'counsellor');
const accountant = profile('accountant-1', 'accountant');
const admin = profile('admin-1', 'admin');
const superAdmin = profile('super-admin-1', 'super_admin');
const studentUser = profile('student-1', 'student');
const trainerUser = profile('trainer-1', 'trainer');

let fee: StudentFee;
let studentId: string;

const basePaymentInput = () => {
  const accounts = getAuthorizedBankAccounts(undefined, { includePending: false });
  const primaryAccount = accounts[0];
  return {
    fee_id: fee.id,
    student_id: studentId,
    enrollment_id: fee.enrollment_id,
    amount_paid: 5000,
    payment_mode: 'UPI' as const,
    payment_date: '2026-10-12',
    transaction_reference: 'UTR-VERIFY-123',
    payment_proof_url: 'https://example.test/proof.png',
    our_bank_profile_id: primaryAccount.id,
    our_bank_name: primaryAccount.bank_name,
    our_bank_account_name: primaryAccount.account_holder_name,
    our_bank_account_id: primaryAccount.account_number,
    our_upi_details: primaryAccount.upi_id,
  };
};

const req = async (user: UserProfile, body?: unknown) => {
  const value = encodeURIComponent(JSON.stringify(user));
  const signature = await generateAuthCookieSignature(value);
  return new NextRequest('http://localhost/api/fees/payments', {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      cookie: `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${signature}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
};

beforeEach(async () => {
  vi.spyOn(store, 'persist').mockImplementation(() => {});
  vi.spyOn(store, 'persistSync').mockReturnValue(true);
  store.users = [
    structuredClone(counsellor),
    structuredClone(accountant),
    structuredClone(admin),
    structuredClone(superAdmin),
    structuredClone(studentUser),
    structuredClone(trainerUser),
    profile('other-tenant-accountant', 'accountant', 'tenant-b'),
  ];
  store.students = [];
  store.admissions = [];
  store.studentFees = [];
  store.feeAccounts = [];
  store.installments = [];
  store.payments = [];
  store.studentPayments = [];
  store.receipts = [];
  store.studentFinancialLedgers = [];
  store.onboardingCases = [];
  store.onboardingAuditLogs = [];
  store.auditLogs = [];
  store.notifications = [];
  store.batches = [];

  const created = await createAdmissionWorkflow(
    {
      student_name: 'Test Student',
      phone: '9876543210',
      email: 'student@example.test',
      dob: '2000-01-01',
      gender: 'Other',
      address: 'Hyderabad',
      city: 'Hyderabad',
      education: 'Graduate',
      experience_years: 0,
      current_employment_status: 'Student',
      course_id: store.courses[0].id,
      admission_date: '2026-10-12',
      course_fee: 30000,
      discount: 0,
      payment_plan: '3 Installments',
    },
    counsellor.id,
    true
  );
  fee = created.studentFee!;
  studentId = created.student.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Accountant Payment Verification with Bank Details', () => {
  it('correctly maps and resolves authorized bank accounts with masking', () => {
    const verifiedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
    expect(verifiedAccounts.length).toBeGreaterThanOrEqual(18); // active verified accounts

    for (const acc of verifiedAccounts) {
      expect(acc.account_number).toBeTruthy();
      expect(acc.account_holder_name).toBeTruthy();
      expect(acc.bank_name).toBeTruthy();
      // Masking check: last 4 digits
      const masked = `XXXX${acc.account_number.slice(-4)}`;
      expect(masked.length).toBeGreaterThanOrEqual(8);
      expect(masked.startsWith('XXXX')).toBe(true);
    }
  });

  it('autofills original receiving account details during payment collection and records them', () => {
    const payment = fees.recordPayment(basePaymentInput(), counsellor.id);
    expect(payment.status).toBe('Pending Approval');
    expect(payment.our_bank_profile_id).toBeTruthy();
    expect(payment.our_bank_name).toBeTruthy();
    expect(payment.our_bank_account_name).toBeTruthy();
    expect(payment.our_bank_account_id).toBeTruthy();

    const verifiedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
    const original = findOriginalReceivingAccount(payment, verifiedAccounts);
    expect(original).toBeDefined();
    expect(original?.id).toBe(payment.our_bank_profile_id);
  });

  it('successfully approves payment when accountant selects matching receiving bank account', async () => {
    const payment = fees.recordPayment(basePaymentInput(), counsellor.id);
    const verifiedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
    const selectedAccount = verifiedAccounts.find((a) => a.id === payment.our_bank_profile_id)!;

    const response = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          reference: 'UTR-VERIFY-123',
          amount: '5000',
          payment_date: '2026-10-12',
          receiving_bank_profile_id: selectedAccount.id,
        },
      })
    );

    if (response.status !== 200) {
      console.log('Approve response error:', await response.json());
    }

    expect(response.status).toBe(200);
    const updated = store.studentPayments.find((p) => p.id === payment.id)!;
    expect(updated.status).toBe('Approved');
    expect(updated.verified_by).toBe(accountant.id);
    expect(updated.verified_bank_profile_id).toBe(selectedAccount.id);
    expect(updated.verified_our_bank_name).toBe(selectedAccount.bank_name);
    expect(updated.verified_our_bank_account_name).toBe(selectedAccount.account_holder_name);
    expect(updated.verified_our_bank_account_id).toBe(selectedAccount.account_number);
    expect(updated.verified_our_upi_details).toBe(selectedAccount.upi_id);
    expect(updated.bank_account_discrepancy_reason).toBeUndefined();

    // Check receipt created with verified bank details
    expect(store.receipts).toHaveLength(1);
    const receipt = store.receipts[0];
    expect(receipt.payment_amount).toBe(5000);
    expect(receipt.our_bank_name).toBe(selectedAccount.bank_name);
    expect(receipt.our_bank_account_name).toBe(selectedAccount.account_holder_name);
    expect(receipt.our_bank_account_id).toBe(selectedAccount.account_number);
  });

  it('requires discrepancy explanation when accountant selects different receiving bank account', async () => {
    const payment = fees.recordPayment(basePaymentInput(), counsellor.id);
    const verifiedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
    const differentAccount = verifiedAccounts.find((a) => a.id !== payment.our_bank_profile_id)!;

    // Attempt approval without discrepancy explanation
    const resNoReason = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          reference: 'UTR-VERIFY-123',
          amount: '5000',
          payment_date: '2026-10-12',
          receiving_bank_profile_id: differentAccount.id,
        },
      })
    );

    expect(resNoReason.status).toBe(400);
    const bodyNoReason = await resNoReason.json();
    expect(bodyNoReason.fieldErrors.bank_account_discrepancy_reason).toMatch(/Discrepancy explanation is required/i);
    expect(store.receipts).toHaveLength(0);

    // Attempt approval with valid discrepancy explanation
    const resWithReason = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          reference: 'UTR-VERIFY-123',
          amount: '5000',
          payment_date: '2026-10-12',
          receiving_bank_profile_id: differentAccount.id,
          bank_account_discrepancy_reason:
            'Student transferred funds to ICICI Corporate account instead of designated HDFC account as per bank credit advice.',
        },
      })
    );

    expect(resWithReason.status).toBe(200);
    const updated = store.studentPayments.find((p) => p.id === payment.id)!;
    expect(updated.status).toBe('Approved');
    expect(updated.verified_bank_profile_id).toBe(differentAccount.id);
    expect(updated.verified_our_bank_name).toBe(differentAccount.bank_name);
    expect(updated.bank_account_discrepancy_reason).toContain('ICICI Corporate');

    // Audit log records discrepancy and notes
    const audit = store.auditLogs.find(
      (a) => a.record_id === payment.id && a.action === 'PAYMENT_APPROVED'
    );
    expect(audit).toBeDefined();
    expect(audit?.new_value?.verified_bank_profile_id).toBe(differentAccount.id);
    expect(audit?.new_value?.bank_account_discrepancy_reason).toContain('ICICI Corporate');
  });

  it('rejects nonexistent, inactive, or archived receiving bank account profiles', async () => {
    const payment = fees.recordPayment(basePaymentInput(), counsellor.id);

    // 1. Non-existent ID
    const resInvalid = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          reference: 'UTR-VERIFY-123',
          amount: '5000',
          payment_date: '2026-10-12',
          receiving_bank_profile_id: 'non-existent-bank-id',
        },
      })
    );
    expect(resInvalid.status).toBe(400);
    const bodyInvalid = await resInvalid.json();
    expect(bodyInvalid.fieldErrors.receiving_bank_profile_id).toMatch(/invalid, inactive, or archived/i);

    // 2. Pending account (not verified)
    const pendingAccounts = getAuthorizedBankAccounts(undefined, { includePending: true }).filter(
      (a) => a.is_verified === false
    );
    if (pendingAccounts.length > 0) {
      const resPending = await POST(
        await req(accountant, {
          action: 'approve',
          paymentId: payment.id,
          verification: {
            reference: 'UTR-VERIFY-123',
            amount: '5000',
            payment_date: '2026-10-12',
            receiving_bank_profile_id: pendingAccounts[0].id,
          },
        })
      );
      expect(resPending.status).toBe(400);
      const bodyPending = await resPending.json();
      expect(bodyPending.fieldErrors.receiving_bank_profile_id).toMatch(/invalid, inactive, or archived/i);
    }
  });

  it('blocks approval on manual field mismatches (amount, date, UTR)', async () => {
    const payment = fees.recordPayment(basePaymentInput(), counsellor.id);
    const verifiedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
    const selectedAccount = verifiedAccounts[0];

    // Mismatched amount
    const resAmount = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          reference: 'UTR-VERIFY-123',
          amount: '4000', // original was 5000
          payment_date: '2026-10-12',
          receiving_bank_profile_id: selectedAccount.id,
        },
      })
    );
    expect(resAmount.status).toBe(400);
    expect((await resAmount.json()).fieldErrors.amount).toMatch(/does not match/i);

    // Mismatched date
    const resDate = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          reference: 'UTR-VERIFY-123',
          amount: '5000',
          payment_date: '2026-10-11', // original was 2026-10-12
          receiving_bank_profile_id: selectedAccount.id,
        },
      })
    );
    expect(resDate.status).toBe(400);
    expect((await resDate.json()).fieldErrors.payment_date).toMatch(/does not match/i);

    // Mismatched UTR
    const resUtr = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          reference: 'UTR-DIFFERENT-999',
          amount: '5000',
          payment_date: '2026-10-12',
          receiving_bank_profile_id: selectedAccount.id,
        },
      })
    );
    expect(resUtr.status).toBe(400);
    expect((await resUtr.json()).fieldErrors.reference).toMatch(/does not match/i);
  });

  it('allows Cash payment verification without UTR or bank account selector', async () => {
    const cashInput = {
      ...basePaymentInput(),
      payment_mode: 'Cash' as const,
      transaction_reference: undefined,
      bank_upi_reference: undefined,
      our_bank_profile_id: undefined,
      our_bank_name: undefined,
      our_bank_account_name: undefined,
      our_bank_account_id: undefined,
      our_upi_details: undefined,
    };
    const payment = fees.recordPayment(cashInput, counsellor.id);
    expect(payment.payment_mode).toBe('Cash');

    const resCash = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          amount: '5000',
          payment_date: '2026-10-12',
        },
      })
    );
    expect(resCash.status).toBe(200);
    const updated = store.studentPayments.find((p) => p.id === payment.id)!;
    expect(updated.status).toBe('Approved');
    expect(store.receipts).toHaveLength(1);
  });

  it('enforces RBAC and separation of duties for verification', async () => {
    const payment = fees.recordPayment(basePaymentInput(), counsellor.id);
    const verifiedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
    const selectedAccount = verifiedAccounts[0];
    const validVerification = {
      reference: 'UTR-VERIFY-123',
      amount: '5000',
      payment_date: '2026-10-12',
      receiving_bank_profile_id: selectedAccount.id,
    };

    // 1. Submitter cannot verify (Separation of Duties)
    const resSubmitter = await POST(
      await req(counsellor, { action: 'approve', paymentId: payment.id, verification: validVerification })
    );
    expect(resSubmitter.status).toBe(403);

    // 2. Student cannot verify
    const resStudent = await POST(
      await req(studentUser, { action: 'approve', paymentId: payment.id, verification: validVerification })
    );
    expect(resStudent.status).toBe(403);

    // 3. Trainer cannot verify
    const resTrainer = await POST(
      await req(trainerUser, { action: 'approve', paymentId: payment.id, verification: validVerification })
    );
    expect(resTrainer.status).toBe(403);

    // 4. Admin and SuperAdmin CAN verify
    const resAdmin = await POST(
      await req(admin, { action: 'approve', paymentId: payment.id, verification: validVerification })
    );
    expect(resAdmin.status).toBe(200);

    // 5. Duplicate approval blocked
    const resDuplicate = await POST(
      await req(superAdmin, { action: 'approve', paymentId: payment.id, verification: validVerification })
    );
    expect(resDuplicate.status).toBe(400);
  });

  it('requires receiving_bank_profile_id when verifying non-cash payment', async () => {
    const payment = fees.recordPayment(basePaymentInput(), counsellor.id);
    const res = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          reference: 'UTR-VERIFY-123',
          amount: '5000',
          payment_date: '2026-10-12',
          receiving_bank_profile_id: '',
        },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.receiving_bank_profile_id).toMatch(/required/i);
  });

  it('updates student financial ledger with verified payment entry', async () => {
    const payment = fees.recordPayment(basePaymentInput(), counsellor.id);
    const verifiedAccounts = getAuthorizedBankAccounts(undefined, { includePending: false });
    const selectedAccount = verifiedAccounts[0];

    const res = await POST(
      await req(accountant, {
        action: 'approve',
        paymentId: payment.id,
        verification: {
          reference: 'UTR-VERIFY-123',
          amount: '5000',
          payment_date: '2026-10-12',
          receiving_bank_profile_id: selectedAccount.id,
        },
      })
    );
    expect(res.status).toBe(200);

    const ledgerEntries = store.studentFinancialLedgers.filter((l) => l.reference_id === payment.id);
    expect(ledgerEntries.length).toBeGreaterThanOrEqual(1);
    const verifiedEntry = ledgerEntries.find((l) => l.entry_type === 'Payment Verified');
    expect(verifiedEntry).toBeDefined();
    expect(verifiedEntry?.credit).toBe(5000);
  });
});
