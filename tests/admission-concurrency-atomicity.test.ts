import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createAdmissionWorkflow,
  getNextAdmissionSequence,
  getNextStudentSequence,
  CreateAdmissionInput,
} from '@/lib/services/admission-service';
import { paymentTransaction, onTransactionCommit } from '@/lib/services/payment-workflow-transaction';
import { Lead, Admission, Student, UserProfile } from '@/types';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('BUG-11 Task 1 & 2: Admission Number Concurrency & Transaction Atomicity', () => {
  const originalAdmissions = [...store.admissions];
  const originalStudents = [...store.students];
  const originalFeeAccounts = [...store.feeAccounts];
  const originalLeads = [...store.leads];
  const originalUsers = [...store.users];

  const counsellorUser: UserProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    tenant_id: 'default',
    email: 'counsellor@next-generpsolutions.com',
    full_name: 'Ananya Deshmukh',
    role: 'counsellor',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    store.admissions = [...originalAdmissions];
    store.students = [...originalStudents];
    store.feeAccounts = [...originalFeeAccounts];
    store.leads = [...originalLeads];
    store.users = [...originalUsers];
  });

  afterEach(() => {
    store.admissions = [...originalAdmissions];
    store.students = [...originalStudents];
    store.feeAccounts = [...originalFeeAccounts];
    store.leads = [...originalLeads];
    store.users = [...originalUsers];
    vi.restoreAllMocks();
  });

  it('1. Monotonic sequence allocator preserves existing historical sequence count', () => {
    // Current highest sequence should be at least as high as existing admissions
    const currentYear = new Date().getFullYear();
    const existingNums = store.admissions
      .filter((a) => a.admission_number?.startsWith(`ADM-${currentYear}-`))
      .map((a) => parseInt(a.admission_number.split('-')[2], 10))
      .filter((n) => !isNaN(n));

    const maxExisting = existingNums.length > 0 ? Math.max(...existingNums) : 0;
    const nextSeq = getNextAdmissionSequence(currentYear);
    expect(nextSeq).toBeGreaterThan(maxExisting);
  });

  it('2. Simultaneous concurrent admission creations allocate distinct, monotonic numbers', async () => {
    const lead1: Lead = {
      id: '11111111-2222-3333-4444-555555555551',
      tenant_id: 'default',
      lead_code: 'LEAD-2026-CONC-1',
      full_name: 'Concurrent Student 1',
      email: 'concurrent1@example.com',
      phone: '+91 98765 00001',
      training_preference: 'Online',
      lead_source: 'Website',
      stage: 'Follow-up',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const lead2: Lead = {
      id: '11111111-2222-3333-4444-555555555552',
      tenant_id: 'default',
      lead_code: 'LEAD-2026-CONC-2',
      full_name: 'Concurrent Student 2',
      email: 'concurrent2@example.com',
      phone: '+91 98765 00002',
      training_preference: 'Online',
      lead_source: 'Website',
      stage: 'Follow-up',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.leads.push(lead1, lead2);

    const input1: CreateAdmissionInput = {
      student_name: 'Concurrent Student 1',
      phone: '+91 98765 00001',
      email: 'concurrent1@example.com',
      dob: '2000-01-01',
      gender: 'Male',
      address: '123 Tech Park',
      city: 'Hyderabad',
      education: 'B.Tech',
      experience_years: 1,
      current_employment_status: 'Employed',
      course_id: store.courses[0].id,
      admission_date: '2026-11-18',
      course_fee: 50000,
      discount: 0,
      payment_plan: 'Full Payment',
      lead_id: lead1.id,
    };

    const input2: CreateAdmissionInput = {
      student_name: 'Concurrent Student 2',
      phone: '+91 98765 00002',
      email: 'concurrent2@example.com',
      dob: '2001-02-02',
      gender: 'Female',
      address: '456 Cyber City',
      city: 'Hyderabad',
      education: 'B.Tech',
      experience_years: 2,
      current_employment_status: 'Employed',
      course_id: store.courses[0].id,
      admission_date: '2026-11-18',
      course_fee: 50000,
      discount: 0,
      payment_plan: 'Full Payment',
      lead_id: lead2.id,
    };

    // Execute concurrently
    const [res1, res2] = await Promise.all([
      paymentTransaction(counsellorUser, () => createAdmissionWorkflow(input1, counsellorUser.id, true)),
      paymentTransaction(counsellorUser, () => createAdmissionWorkflow(input2, counsellorUser.id, true)),
    ]);

    expect(res1.admission.admission_number).toBeDefined();
    expect(res2.admission.admission_number).toBeDefined();
    expect(res1.admission.admission_number).not.toBe(res2.admission.admission_number);

    // Both admission numbers match standard ADM-YYYY-NNNN format
    expect(res1.admission.admission_number).toMatch(/^ADM-2026-\d{4}$/);
    expect(res2.admission.admission_number).toMatch(/^ADM-2026-\d{4}$/);

    // Both leads converted with proper references
    const updatedLead1 = store.leads.find((l) => l.id === lead1.id);
    const updatedLead2 = store.leads.find((l) => l.id === lead2.id);
    expect(updatedLead1?.stage).toBe('Converted');
    expect(updatedLead2?.stage).toBe('Converted');
    expect(updatedLead1?.notes).toContain(res1.admission.admission_number);
    expect(updatedLead2?.notes).toContain(res2.admission.admission_number);
  });

  it('3. Transaction atomicity: On commit failure, rollback restores in-memory store and lead stage', async () => {
    const lead: Lead = {
      id: '22222222-3333-4444-5555-666666666666',
      tenant_id: 'default',
      lead_code: 'LEAD-2026-FAIL-1',
      full_name: 'Rollback Student',
      email: 'rollback@example.com',
      phone: '+91 98765 00099',
      training_preference: 'Online',
      lead_source: 'Website',
      stage: 'Follow-up',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.leads.push(lead);

    const initialAdmissionCount = store.admissions.length;
    const initialStudentCount = store.students.length;

    let postCommitExecuted = false;

    // Simulate an operation that registers postCommit and creates admission, but fails before commit
    await expect(
      paymentTransaction(counsellorUser, async () => {
        onTransactionCommit(async () => {
          postCommitExecuted = true;
        });

        const input: CreateAdmissionInput = {
          student_name: 'Rollback Student',
          phone: '+91 98765 00099',
          email: 'rollback@example.com',
          dob: '2000-01-01',
          gender: 'Male',
          address: 'Test Address',
          city: 'Hyderabad',
          education: 'B.Tech',
          experience_years: 0,
          current_employment_status: 'Student',
          course_id: store.courses[0].id,
          admission_date: '2026-11-18',
          course_fee: 45000,
          discount: 0,
          payment_plan: 'Full Payment',
          lead_id: lead.id,
        };

        await createAdmissionWorkflow(input, counsellorUser.id, true);

        // Force an error simulating database transaction rollback
        throw new Error('Database transaction abort simulated');
      })
    ).rejects.toThrow('Database transaction abort simulated');

    // Verify complete rollback: store restored
    expect(store.admissions.length).toBe(initialAdmissionCount);
    expect(store.students.length).toBe(initialStudentCount);

    // Lead stage is NOT Converted - restored to Follow-up
    const rolledBackLead = store.leads.find((l) => l.id === lead.id);
    expect(rolledBackLead?.stage).toBe('Follow-up');
    expect(rolledBackLead?.notes).toBeUndefined();

    // Post-commit tasks must NOT have executed
    expect(postCommitExecuted).toBe(false);
  });

  it('4. Idempotent re-conversion returns existing admission without incrementing sequence', async () => {
    const lead: Lead = {
      id: '33333333-4444-5555-6666-777777777777',
      tenant_id: 'default',
      lead_code: 'LEAD-2026-IDEM-1',
      full_name: 'Idempotency Lead',
      email: 'idempotent@example.com',
      phone: '+91 98765 00088',
      training_preference: 'Online',
      lead_source: 'Website',
      stage: 'Follow-up',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.leads.push(lead);

    const input: CreateAdmissionInput = {
      student_name: 'Idempotency Lead',
      phone: '+91 98765 00088',
      email: 'idempotent@example.com',
      dob: '2000-01-01',
      gender: 'Female',
      address: 'Test Lane',
      city: 'Pune',
      education: 'MCA',
      experience_years: 1,
      current_employment_status: 'Employed',
      course_id: store.courses[0].id,
      admission_date: '2026-11-18',
      course_fee: 55000,
      discount: 0,
      payment_plan: 'Full Payment',
      lead_id: lead.id,
    };

    const firstRun = await paymentTransaction(counsellorUser, () =>
      createAdmissionWorkflow(input, counsellorUser.id, true)
    );
    const firstAdmNumber = firstRun.admission.admission_number;

    // Second call with same lead_id
    const secondRun = await paymentTransaction(counsellorUser, () =>
      createAdmissionWorkflow(input, counsellorUser.id, true)
    );

    expect(secondRun.admission.id).toBe(firstRun.admission.id);
    expect(secondRun.admission.admission_number).toBe(firstAdmNumber);
    expect(secondRun.student.id).toBe(firstRun.student.id);
  });

  it('5. Unique RFC-4122 UUID cross-linkage across Admission -> Student -> FeeAccount', async () => {
    const lead: Lead = {
      id: '44444444-5555-6666-7777-888888888888',
      tenant_id: 'default',
      lead_code: 'LEAD-2026-UUID-1',
      full_name: 'UUID Test Lead',
      email: 'uuid.lead@example.com',
      phone: '+91 98765 00077',
      training_preference: 'Classroom',
      lead_source: 'Referral',
      stage: 'Follow-up',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.leads.push(lead);

    const input: CreateAdmissionInput = {
      student_name: 'UUID Test Lead',
      phone: '+91 98765 00077',
      email: 'uuid.lead@example.com',
      dob: '1998-05-15',
      gender: 'Male',
      address: 'Test Boulevard',
      city: 'Hyderabad',
      education: 'B.Com',
      experience_years: 3,
      current_employment_status: 'Employed',
      course_id: store.courses[0].id,
      admission_date: '2026-11-18',
      course_fee: 40000,
      discount: 0,
      payment_plan: 'Full Payment',
      lead_id: lead.id,
    };

    const result = await paymentTransaction(counsellorUser, () =>
      createAdmissionWorkflow(input, counsellorUser.id, true)
    );

    expect(result.admission.id).toMatch(UUID_V4_REGEX);
    expect(result.student.id).toMatch(UUID_V4_REGEX);
    expect(result.student.user_id).toMatch(UUID_V4_REGEX);
    expect(result.feeAccount.id).toMatch(UUID_V4_REGEX);

    // Linkage consistency
    expect(result.admission.student_id).toBe(result.student.id);
    expect(result.student.admission_id).toBe(result.admission.id);
    expect(result.feeAccount.student_id).toBe(result.student.id);
    expect(result.feeAccount.admission_id).toBe(result.admission.id);
  });
});
