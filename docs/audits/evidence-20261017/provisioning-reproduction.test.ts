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


const liveAudit = vi.hoisted(()=>({enabled:false}));
vi.mock('@/lib/supabase/db', async(importOriginal)=>({...await importOriginal<any>(),isLiveSupabaseEnabled:()=>liveAudit.enabled}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({auth:{admin:{listUsers:async()=>({data:{users:[]}}),createUser:async()=>({data:{user:null},error:new Error('Synthetic Auth rejection')})}}})}));
vi.mock('@/lib/services/notification-service',async(importOriginal)=>({...await importOriginal<any>(),sendResendEmail:async()=>({success:true,simulated:true}),sendMultiChannelNotification:async()=>({success:true})}));
it('F07: Auth provisioning rejection fails closed and prevents unauthorized LMS activation', async () => {
  const payment = fees.recordPayment({ ...input(), amount_paid: 10000 }, counsellor.id);
  fees.verifyPayment(payment.id, accountant.id);
  const c = store.onboardingCases[0];
  for (const key of ['admission_confirmation', 'student_details_verification', 'document_verification', 'course_confirmation', 'batch_allocation', 'fee_clearance_verification']) (c.checklist as any)[key].completed = true;
  c.documents = [{ id: 'synthetic-document', status: 'verified' } as any];
  liveAudit.enabled = true;
  try {
    const result = await provisionStudentLmsAccount(c.id, onboarding);
    expect(result.success).toBe(false);
    expect(c.lms_account_created).toBe(false);
    expect(store.students.find((s) => s.id === studentId)?.status).not.toBe('Active');
  } finally {
    liveAudit.enabled = false;
  }
});
