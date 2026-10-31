import { enteredPaymentVerification } from './payment-verification-fixture';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService as fees } from '@/lib/services/fee-workflow-service';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { provisionStudentLmsAccount, forwardApprovedPaymentToOnboarding } from '@/lib/services/onboarding-service';
import { POST, GET } from '@/app/api/fees/payments/route';
import { POST as admit } from '@/app/api/admissions/route';
import { actualPaymentDate, normalizePaymentFields } from '@/lib/services/payment-entry-rules';
import { GET as getProof } from '@/app/api/fees/proof/route';
import { createHash } from 'crypto';
import { generateAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { StudentFee, UserProfile } from '@/types';

const profile = (id: string, role: UserProfile['role'], tenant_id = 'default'): UserProfile => ({ id, role, tenant_id, email: `${id}@example.test`, full_name: id, is_active: true, created_at: '2026-10-12', updated_at: '2026-10-12' });
const counsellor = profile('submitter', 'counsellor');
const accountant = profile('approver', 'accountant');
const onboarding = profile('onboarding', 'onboarding_team');
let fee: StudentFee;
let studentId: string;
const input = () => ({ fee_id: fee.id, student_id: studentId, enrollment_id: fee.enrollment_id, amount_paid: 5000, payment_mode: 'UPI' as const, payment_date: '2026-10-12', transaction_reference: 'UTR-123', payment_proof_url: 'https://example.test/proof.png' });

beforeEach(async () => {
  vi.spyOn(store, 'persist').mockImplementation(() => {});
  vi.spyOn(store, 'persistSync').mockReturnValue(true);
  store.users = [structuredClone(counsellor), structuredClone(accountant), structuredClone(onboarding), profile('other-counsellor', 'counsellor'), profile('other-tenant', 'accountant', 'tenant-b')];
  store.students = []; store.admissions = []; store.studentFees = []; store.feeAccounts = [];
  store.installments = []; store.payments = []; store.studentPayments = []; store.receipts = [];
  store.studentFinancialLedgers = []; store.onboardingCases = []; store.onboardingAuditLogs = [];
  store.auditLogs = []; store.notifications = []; store.batches = [];
  const created = await createAdmissionWorkflow({ student_name: 'New Student', phone: '9999999999', email: 'student@example.test', dob: '2000-01-01', gender: 'Other', address: 'Hyderabad', city: 'Hyderabad', education: 'Graduate', experience_years: 0, current_employment_status: 'Student', course_id: store.courses[0].id, admission_date: '2026-10-12', course_fee: 30000, discount: 0, payment_plan: '3 Installments' }, counsellor.id, true);
  fee = created.studentFee!; studentId = created.student.id;
});
afterEach(() => vi.restoreAllMocks());

describe('Automated payment approval', () => {
  it('preserves historical schedule records while new payments use the account balance', () => {
    store.installments = [{ id: 'historical', student_id: studentId, fee_account_id: fee.fee_account_id!, installment_number: 1, amount: 1000, paid_amount: 200, status: 'Partial', due_date: '2025-01-01' }];
    const original = structuredClone(store.installments);
    const payment = fees.recordPayment(input(), counsellor.id);
    fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id));
    store.reconcileDualLedgers();
    expect(store.installments).toEqual(original);
    expect(fee.outstanding_amount).toBe(25000);
    expect(store.receipts[0].total_tax).toBe(0);
  });

  it('keeps registration inactive and submitted payments out of verified balances and receipts', () => {
    const payment = fees.recordPayment(input(), counsellor.id, 'accountant');
    expect(payment.status).toBe('Pending Approval');
    expect(payment.recorded_by_role).toBe('counsellor');
    expect(payment.enrollment_id).toBe(store.admissions[0].id);
    expect(fee.paid_amount).toBe(0);
    expect(store.receipts).toHaveLength(0);
    expect(store.onboardingCases).toHaveLength(0);
    expect(store.users.find((u) => u.id === store.students[0].user_id)?.is_active).toBe(false);
    expect(store.notifications.some((n) => n.user_id === accountant.id)).toBe(true);
  });

  it('reconciles pending legacy records repeatedly without approval or duplicates', () => {
    fees.recordPayment(input(), counsellor.id);
    for (let n = 0; n < 5; n++) store.reconcileDualLedgers();
    expect(store.studentPayments).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0].status).toBe('Pending');
    expect(store.students[0].paid_amount).toBe(0);
  });

  it('approves once, updates the balance, creates one receipt and assigns onboarding without activation', () => {
    const payment = fees.recordPayment(input(), counsellor.id);
    store.reconcileDualLedgers();
    fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id));
    expect(payment.status).toBe('Approved');
    expect(payment.verified_by).toBe(accountant.id);
    expect(payment.verified_at).toBeTruthy();
    expect(fee.paid_amount).toBe(5000);
    expect(store.feeAccounts[0].outstanding_amount).toBe(25000);
    expect(store.students[0].paid_amount).toBe(5000);
    expect(store.installments).toHaveLength(0);
    expect(store.receipts[0].total_tax).toBe(0);
    expect(store.receipts[0].payment_amount).toBe(5000);
    expect(store.receipts).toHaveLength(1);
    expect(store.studentFinancialLedgers.filter((l) => l.reference_id === payment.id)).toHaveLength(1);
    expect(store.onboardingCases[0].assigned_staff_id).toBe(onboarding.id);
    expect(store.onboardingCases[0].lms_account_created).toBe(false);
    expect(() => fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id))).toThrow();
    forwardApprovedPaymentToOnboarding(payment, accountant);
    store.reconcileDualLedgers();
    expect(store.receipts).toHaveLength(1);
    expect(store.onboardingCases).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
    expect(store.students[0].paid_amount).toBe(5000);
  });

  it('enforces roles, separation of duties, inactive accounts, and tenant boundaries', () => {
    const payment = fees.recordPayment(input(), counsellor.id);
    expect(() => fees.verifyPayment(payment.id, counsellor.id, undefined, enteredPaymentVerification(payment.id))).toThrow(/Separation/);
    expect(() => fees.verifyPayment(payment.id, 'other-counsellor', undefined, enteredPaymentVerification(payment.id))).toThrow(/Unauthorized/);
    expect(() => fees.verifyPayment(payment.id, 'other-tenant', undefined, enteredPaymentVerification(payment.id))).toThrow(/tenant/);
    expect(() => fees.recordPayment(input(), 'other-tenant')).toThrow(/tenant/);
    expect(() => fees.updatePayment(payment.id, { amount_paid: 1000 }, 'other-counsellor')).toThrow(/Unauthorized/);
    store.users.find((u) => u.id === accountant.id)!.is_active = false;
    expect(() => fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id))).toThrow(/Unauthorized/);
    expect(payment.status).toBe('Pending Approval');
  });

  it('requires a rejection reason and preserves history across correction and approval', () => {
    const payment = fees.recordPayment(input(), counsellor.id);
    expect(() => fees.rejectPayment(payment.id, accountant.id, ' ')).toThrow(/reason/);
    fees.rejectPayment(payment.id, accountant.id, 'Reference does not match proof');
    expect(() => fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id))).toThrow();
    expect(store.notifications.some((n) => n.user_id === counsellor.id && n.message.includes('does not match'))).toBe(true);
    fees.updatePayment(payment.id, { transaction_reference: 'CORRECTED' }, counsellor.id);
    expect(payment.status).toBe('Pending Approval');
    fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id));
    const audit = store.auditLogs.filter((a) => a.record_id === payment.id);
    expect(audit.map((a) => a.action)).toEqual(['PAYMENT_APPROVED', 'PAYMENT_RESUBMITTED', 'PAYMENT_REJECTED', 'PAYMENT_SUBMITTED']);
    expect(audit.find((a) => a.action === 'PAYMENT_REJECTED')?.new_value?.rejection_reason).toBe('Reference does not match proof');
  });

  it('supports partial payments against one balance and rechecks it at approval', () => {
    const one = fees.recordPayment({ ...input(), amount_paid: 20000 }, counsellor.id);
    const two = fees.recordPayment({ ...input(), amount_paid: 20000, transaction_reference: 'UTR-SECOND' }, counsellor.id);
    fees.verifyPayment(one.id, accountant.id, undefined, enteredPaymentVerification(one.id));
    expect(() => fees.verifyPayment(two.id, accountant.id, undefined, enteredPaymentVerification(two.id))).toThrow(/outstanding/);
    expect(two.status).toBe('Pending Approval');
    const final = fees.recordPayment({ ...input(), amount_paid: 10000, transaction_reference: 'FINAL' }, counsellor.id);
    fees.verifyPayment(final.id, accountant.id, undefined, enteredPaymentVerification(final.id));
    expect(fee.outstanding_amount).toBe(0);
    expect(store.installments).toHaveLength(0);
  });

  it('rejects invalid amounts, duplicate references, and mismatched enrollments', () => {
    for (const amount_paid of [0, -1, Infinity, NaN, 1.001, 30001]) expect(() => fees.recordPayment({ ...input(), amount_paid }, counsellor.id)).toThrow();
    fees.recordPayment(input(), counsellor.id);
    expect(() => fees.recordPayment({ ...input(), transaction_reference: ' utr-123 ' }, counsellor.id)).toThrow(/Duplicate/);
    expect(() => fees.recordPayment({ ...input(), enrollment_id: 'another-enrollment' }, counsellor.id)).toThrow(/Enrollment/);
    const legacyInput = fees.recordPayment({ ...input(), installment_id: 'other', transaction_reference: 'different' }, counsellor.id);
    expect(legacyInput.installment_id).toBeUndefined();
  });

  it('settles decimal partial payments without floating-point overpayment errors', () => {
    fee.final_payable = 0.30;
    fee.outstanding_amount = 0.30;
    for (const [index, amount_paid] of [0.10, 0.20].entries()) {
      const payment = fees.recordPayment({ ...input(), amount_paid, transaction_reference: `decimal-${index}` }, counsellor.id);
      fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id));
    }
    expect(fee.outstanding_amount).toBe(0);
    expect(fee.paid_amount).toBe(0.30);
  });

  it('does not forward an unapproved admission and gates LMS provisioning', async () => {
    const payment = fees.recordPayment(input(), counsellor.id);
    store.admissions[0].status = 'Pending';
    fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id));
    expect(store.onboardingCases).toHaveLength(0);
    store.admissions[0].status = 'Confirmed';
    forwardApprovedPaymentToOnboarding(payment, accountant);
    const c = store.onboardingCases[0];
    await expect(provisionStudentLmsAccount(c.id, onboarding)).rejects.toThrow(/checks/);
    expect(store.users.find((u) => u.id === store.students[0].user_id)?.is_active).toBe(false);
  });

  it('rolls back balances, receipt, history and onboarding on a failed durable commit', async () => {
    const payment = fees.recordPayment(input(), counsellor.id);
    vi.mocked(store.persistSync).mockReturnValue(false);
    await expect(paymentTransaction(accountant, () => fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id)))).rejects.toThrow(/storage failed/);
    expect(store.studentPayments[0].status).toBe('Pending Approval');
    expect(store.studentFees[0].paid_amount).toBe(0);
    expect(store.receipts).toHaveLength(0);
    expect(store.onboardingCases).toHaveLength(0);
    expect(store.auditLogs.some((a) => a.action === 'PAYMENT_APPROVED')).toBe(false);
  });

  it('serializes simultaneous approvals without duplicate financial entries', async () => {
    const payment = fees.recordPayment(input(), counsellor.id);
    const results = await Promise.allSettled([paymentTransaction(accountant, () => fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id))), paymentTransaction(accountant, () => fees.verifyPayment(payment.id, accountant.id, undefined, enteredPaymentVerification(payment.id)))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(store.receipts).toHaveLength(1);
    expect(store.studentFees[0].paid_amount).toBe(5000);
  });
});

async function req(actor: UserProfile, body?: unknown) {
  const value = encodeURIComponent(JSON.stringify(actor));
  const signature = await generateAuthCookieSignature(value);
  return new NextRequest('http://localhost/api/fees/payments', { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', cookie: `${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${signature}` }, body: body ? JSON.stringify(body) : undefined });
}

describe('Payment API trust boundary', () => {
  it('denies proof downloads across tenants and path traversal', async () => {
    const signed = await req(accountant);
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const foreign = `${hash('tenant-b')}/${hash('foreign-user')}/00000000-0000-0000-0000-000000000001.png`;
    const response = await getProof(new NextRequest(`http://localhost/api/fees/proof?path=${encodeURIComponent(foreign)}`, { headers: signed.headers }));
    expect(response.status).toBe(403);
    const traversal = await getProof(new NextRequest('http://localhost/api/fees/proof?path=../../secret', { headers: signed.headers }));
    expect(traversal.status).toBe(400);
  });
  it('rejects forged bearer identities and unsigned cookies', async () => {
    const attempts: Record<string, string>[] = [{ authorization: `Bearer ${accountant.id}` }, { cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(accountant))}` }];
    for (const headers of attempts) {
      expect((await GET(new NextRequest('http://localhost/api/fees/payments', { headers }))).status).toBe(401);
    }
  });
  it('validates optional proof, retains a submission across duplicate requests, and exposes it to Accounts', async () => {
    const body = { action: 'record', input: { ...input(), idempotency_key: 'request-1' } };
    const missing = await POST(await req(counsellor, { ...body, input: { ...body.input, payment_proof_url: 'invalid-proof' } }));
    expect(missing.status).toBe(400);
    expect((await POST(await req(counsellor, body))).status).toBe(200);
    expect((await POST(await req(counsellor, body))).status).toBe(200);
    expect(store.studentPayments).toHaveLength(1);
    const response = await (await GET(await req(accountant))).json();
    expect(response.snapshot.studentPayments[0].status).toBe('Pending Approval');
    const other = await (await GET(await req(profile('other-tenant', 'accountant', 'tenant-b')))).json();
    expect(other.snapshot.studentPayments).toHaveLength(0);
  });
});

describe('Conditional admission payments and manual Accounts verification', () => {
  const modes = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash', 'Bank Transfer', 'Cheque'] as const;
  const admissionInput = (mode: typeof modes[number]) => ({
    student_name: 'Synthetic Conditional Payment', phone: '9999999998', email: 'conditional@example.test',
    dob: '2000-01-01', gender: 'Other', address: 'Test', city: 'Test', education: 'Graduate',
    experience_years: 0, current_employment_status: 'Student', course_id: store.courses[0].id,
    admission_date: '2026-10-01', course_fee: 30000, discount: 0, payment_plan: 'Full Payment',
    collect_initial_payment: true, initial_payment_amount: 5000, payment_mode: mode,
    transaction_reference: mode === 'Cash' ? null : `MANUAL-${mode}`, payment_date: '2026-10-31',
    idempotency_key: `admission-${mode}`,
  });
  it.each(modes)('admits and explicitly approves %s without proof, once only', async (mode) => {
    const body = admissionInput(mode);
    const response = await admit(await req(counsellor, body));
    expect(response.status).toBe(200);
    const payment = (await response.json()).result.payment;
    expect(payment.payment_mode).toBe(mode);
    expect(payment.payment_date).toBe('2026-10-31');
    expect(payment.transaction_reference).toBe(mode === 'Cash' ? null : body.transaction_reference);
    expect(payment.payment_proof_url).toBeUndefined();
    expect(store.receipts).toHaveLength(0);
    expect((await admit(await req(counsellor, body))).status).toBe(200);
    expect(store.studentPayments).toHaveLength(1);
    const verification = { ...(mode !== 'Cash' ? { reference: body.transaction_reference!.toLowerCase() } : {}), amount: '5000.00', payment_date: '2026-10-31' };
    const command = { action: 'approve', paymentId: payment.id, verification };
    expect((await POST(await req(accountant, command))).status).toBe(200);
    expect(store.receipts).toHaveLength(1);
    expect(store.studentFees.find((f) => f.id === payment.fee_id)?.paid_amount).toBe(5000);
    expect(store.studentFinancialLedgers.filter((l) => l.reference_id === payment.id && l.entry_type === 'Payment Verified')).toHaveLength(1);
    expect(store.auditLogs.find((a) => a.action === 'PAYMENT_APPROVED')?.new_value?.manual_verification).toEqual(verification);
    expect((await POST(await req(accountant, command))).status).toBe(400);
    expect(store.receipts).toHaveLength(1);
  });
  it.each(modes.filter((m) => m !== 'Cash'))('rejects %s admission with a missing reference', async (mode) => {
    const response = await admit(await req(counsellor, { ...admissionInput(mode), transaction_reference: ' ' }));
    expect(response.status).toBe(400);
    expect(store.studentPayments).toHaveLength(0);
    expect(store.receipts).toHaveLength(0);
  });
  it('strips stale reference and proof from cash on the server and defaults the actual date', async () => {
    const response = await admit(await req(counsellor, { ...admissionInput('Cash'), payment_date: undefined, transaction_reference: 'OLD-UTR', payment_proof_url: 'stale-invalid-upload' }));
    expect(response.status).toBe(200);
    const p = (await response.json()).result.payment;
    expect(p.transaction_reference).toBeNull();
    expect(p.payment_proof_url).toBeUndefined();
    expect(p.payment_date).toBe(actualPaymentDate());
    expect(store.payments[0].transaction_reference).toBeNull();
  });
  it.each([undefined, 0, -1])('requires a positive collection amount (%s)', async (amount) => {
    expect((await admit(await req(counsellor, { ...admissionInput('Cash'), initial_payment_amount: amount }))).status).toBe(400);
    expect(store.studentPayments).toHaveLength(0);
  });
  it.each(modes.filter((m) => m !== 'Cash'))('clears %s fields when updating to cash and requires a reference when switching back', async (mode) => {
    const p = fees.recordPayment({ ...input(), payment_mode: mode }, counsellor.id);
    const details = { ...input(), payment_mode: 'Cash', bank_upi_reference: 'STALE-BANK' };
    expect((await POST(await req(counsellor, { action: 'update', paymentId: p.id, input: details }))).status).toBe(200);
    expect(store.studentPayments[0]).toMatchObject({ payment_mode: 'Cash', transaction_reference: null });
    expect(store.studentPayments[0].bank_upi_reference).toBeUndefined();
    expect(store.studentPayments[0].payment_proof_url).toBeUndefined();
    expect(store.payments[0].transaction_reference).toBeNull();
    expect((await POST(await req(counsellor, { action: 'update', paymentId: p.id, input: { ...details, payment_mode: mode, transaction_reference: null, bank_upi_reference: undefined } }))).status).toBe(400);
    expect((await POST(await req(counsellor, { action: 'update', paymentId: p.id, input: { ...details, payment_mode: mode, transaction_reference: 'NEW-REF', payment_proof_url: undefined } }))).status).toBe(200);
  });
  it.each(['Cash', 'UPI'] as const)('blocks mismatched amount/date and missing verification for %s', async (mode) => {
    const p = fees.recordPayment({ ...input(), payment_mode: mode }, counsellor.id);
    for (const verification of [undefined, { reference: 'UTR-123', amount: '5000.01', payment_date: '2026-10-13' }]) {
      const response = await POST(await req(accountant, { action: 'approve', paymentId: p.id, verification }));
      expect(response.status).toBe(400);
      const { fieldErrors } = await response.json();
      expect(fieldErrors.amount).toBeTruthy(); expect(fieldErrors.payment_date).toBeTruthy();
      if (mode === 'Cash') expect(fieldErrors.reference).toBeUndefined();
      expect(store.receipts).toHaveLength(0); expect(store.studentFees[0].paid_amount).toBe(0);
      expect(store.studentFinancialLedgers.some((l) => l.entry_type === 'Payment Verified')).toBe(false);
    }
  });
  it('rejects a wrong noncash UTR before financial changes', async () => {
    const p = fees.recordPayment(input(), counsellor.id);
    const response = await POST(await req(accountant, { action: 'approve', paymentId: p.id, verification: { reference: 'WRONG', amount: '5000', payment_date: '2026-10-12' } }));
    expect((await response.json()).fieldErrors.reference).toMatch(/does not match/);
    expect(store.receipts).toHaveLength(0);
  });
  it('uses the institute calendar date across UTC midnight boundaries', () => {
    expect(actualPaymentDate(new Date('2026-10-30T20:00:00Z'))).toBe('2026-10-31');
  });
  it('never carries reference or proof through cash when switching among all seven modes', () => {
    for (const from of modes) for (const to of modes) {
      const original = { payment_mode: from, transaction_reference: 'REF', payment_proof_url: 'https://example.test/proof' };
      const cash = normalizePaymentFields({ ...original, payment_mode: 'Cash' });
      const next = normalizePaymentFields({ ...cash, payment_mode: to });
      expect(next.transaction_reference).toBeNull(); expect(next.payment_proof_url).toBeUndefined();
      expect(original.transaction_reference).toBe('REF');
    }
  });
  it('normalizes reference whitespace and case for manual approval', async () => {
    const p = fees.recordPayment(input(), counsellor.id);
    const response = await POST(await req(accountant, { action: 'approve', paymentId: p.id, verification: { reference: ' utr- 123 ', amount: '5000.00', payment_date: '2026-10-12' } }));
    expect(response.status).toBe(200);
    expect(store.receipts).toHaveLength(1);
  });
  it('blocks legacy noncash payments with a missing original reference', async () => {
    const p = fees.recordPayment(input(), counsellor.id);
    p.transaction_reference = null; p.bank_upi_reference = undefined;
    const response = await POST(await req(accountant, { action: 'approve', paymentId: p.id, verification: { reference: 'UTR-123', amount: '5000', payment_date: '2026-10-12' } }));
    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors.reference).toMatch(/missing/);
    expect(store.receipts).toHaveLength(0);
  });

});
