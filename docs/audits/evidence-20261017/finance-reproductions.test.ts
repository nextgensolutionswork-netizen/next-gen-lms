import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService as fees } from '@/lib/services/fee-workflow-service';
import { paymentTransaction, onTransactionCommit } from '@/lib/services/payment-workflow-transaction';
import {
  provisionStudentLmsAccount,
  forwardApprovedPaymentToOnboarding,
  updateChecklistItem,
  completeOnboardingWorkflow,
} from '@/lib/services/onboarding-service';
import { StudentFee, UserProfile } from '@/types';

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

const counsellor = profile('submitter', 'counsellor');
const accountant = profile('approver', 'accountant');
const onboarding = profile('onboarding', 'onboarding_team');
const trainerDefault = profile('trainer-default', 'trainer', 'default');
const trainerOtherTenant = profile('trainer-tenant-b', 'trainer', 'tenant-b');

let fee: StudentFee;
let studentId: string;
const input = () => ({
  fee_id: fee.id,
  student_id: studentId,
  enrollment_id: fee.enrollment_id,
  amount_paid: 5000,
  payment_mode: 'UPI' as const,
  payment_date: '2026-10-12',
  transaction_reference: 'UTR-123',
  payment_proof_url: 'https://example.test/proof.png',
});

beforeEach(async () => {
  vi.spyOn(store, 'persist').mockImplementation(() => {});
  vi.spyOn(store, 'persistSync').mockReturnValue(true);
  store.users = [
    structuredClone(counsellor),
    structuredClone(accountant),
    structuredClone(onboarding),
    structuredClone(trainerDefault),
    structuredClone(trainerOtherTenant),
    profile('other-counsellor', 'counsellor'),
    profile('other-tenant', 'accountant', 'tenant-b'),
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
  store.batches = [
    {
      id: 'batch-fico-01',
      batch_code: 'FICO-B01',
      batch_name: 'SAP FICO Morning',
      course_id: store.courses[0].id,
      course_name: 'SAP FICO',
      trainer_id: trainerDefault.id,
      trainer_name: trainerDefault.full_name,
      start_date: '2026-11-01',
      end_date: '2027-01-31',
      start_time: '09:00',
      end_time: '11:00',
      days: ['Monday', 'Wednesday', 'Friday'],
      maximum_capacity: 30,
      current_enrolled: 5,
      training_mode: 'Online',
      status: 'Upcoming',
      created_at: '2026-10-12',
      updated_at: '2026-10-12',
    },
  ];

  const created = await createAdmissionWorkflow(
    {
      student_name: 'New Student',
      phone: '9999999999',
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
      payment_plan: 'Full Payment',
    },
    counsellor.id,
    true
  );
  fee = created.studentFee!;
  studentId = created.student.id;
});

afterEach(() => vi.restoreAllMocks());


it('F04: rejects payment allocation to an installment belonging to another tenant or student (FIXED)', () => {
  store.installments = [{id:'foreign-installment',tenant_id:'tenant-b',fee_account_id:'foreign-fee',student_id:'foreign-student',amount:9000,paid_amount:0,status:'Pending'} as any];
  expect(() => fees.recordPayment({...input(),installment_id:'foreign-installment'},counsellor.id))
    .toThrow('Installment does not belong to this student fee account or tenant.');
  expect(store.installments[0].paid_amount).toBe(0);
});
it('F05: editing payment notes preserves valid installment association (FIXED)', () => {
  store.installments = [{id:'own-installment',tenant_id:'default',fee_account_id:fee.fee_account_id,student_id:studentId,amount:9000,paid_amount:0,status:'Pending'} as any];
  const payment=fees.recordPayment({...input(),installment_id:'own-installment'},counsellor.id);
  fees.updatePayment(payment.id,{notes:'corrected'},counsellor.id);
  expect(payment.installment_id).toBe('own-installment');
});
it('F06: voiding an installment payment restores installment paid balance and status to Pending (FIXED)', () => {
  store.installments = [{id:'own-installment',tenant_id:'default',fee_account_id:fee.fee_account_id,student_id:studentId,amount:5000,paid_amount:0,status:'Pending'} as any];
  const payment=fees.recordPayment({...input(),installment_id:'own-installment'},counsellor.id);
  fees.verifyPayment(payment.id,accountant.id);
  const receipt=store.receipts.find(r=>r.payment_id===payment.id)!;
  fees.voidReceipt(receipt.id,accountant.id,'Audit reversal');
  expect(fee.paid_amount).toBe(0);
  expect(store.installments[0].paid_amount).toBe(0);
  expect(store.installments[0].status).toBe('Pending');
});
it('R01: reversal to zero paid correctly revokes onboarding financial clearance', () => {
  const payment=fees.recordPayment({...input(),amount_paid:10000},counsellor.id);
  fees.verifyPayment(payment.id,accountant.id);
  const c=store.onboardingCases[0];
  expect(c.checklist.fee_clearance_verification.completed).toBe(true);
  fees.voidReceipt(store.receipts.find(r=>r.payment_id===payment.id)!.id,accountant.id,'Audit reversal');
  expect(fee.paid_amount).toBe(0);
  expect(c.checklist.fee_clearance_verification.completed).toBe(false);
});
